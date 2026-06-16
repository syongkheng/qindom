import { Exceptions } from "../exceptions/AppExceptions.js";
import KnexSqlUtilities from "../utils/KnexSqlUtilities.js";
import { LoggingUtilities } from "../utils/logging/LoggingUtilities.js";
import { toMessage } from "../utils/errorUtils.js";

interface DouyinLiveResult {
  userId: string;
  isLive: boolean;
  nickname: string | null;
  title: string | null;
  viewerCount: number | null;
  totalViewers: string | null;
  coverUrl: string | null;
  streamUrl: string | null;
  roomId: string | null;
  anchorId: string | null;
  secAnchorId: string | null;
  fromCache: boolean;
}

export interface DouyinRankUser {
  id: number;
  nickname: string;
  avatarUrl: string | null;
  payGradeLevel: number;
  fansClubLevel: number;
  fansClubStatus: number;
  rank: number;
  score: number;
}

interface CacheEntry {
  data: DouyinLiveResult;
  expiresAt: number;
}

const CACHE_TTL_MS = 30_000;
const MS_TOKEN_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours
const FETCH_TIMEOUT_MS = 8_000;
const DOUYIN_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";

// ── SM3 hash (GB/T 32905-2016) ────────────────────────────────────────────────

function sm3(data: Buffer): Buffer {
  const rotl = (x: number, n: number) => ((x << n) | (x >>> (32 - n))) >>> 0;
  const P0 = (x: number) => (x ^ rotl(x, 9) ^ rotl(x, 17)) >>> 0;
  const P1 = (x: number) => (x ^ rotl(x, 15) ^ rotl(x, 23)) >>> 0;
  const T = (j: number) => j < 16 ? 0x79cc4519 : 0x7a879d8a;
  const FF = (x: number, y: number, z: number, j: number) =>
    j < 16 ? (x ^ y ^ z) >>> 0 : ((x & y) | (x & z) | (y & z)) >>> 0;
  const GG = (x: number, y: number, z: number, j: number) =>
    j < 16 ? (x ^ y ^ z) >>> 0 : ((x & y) | (~x & z)) >>> 0;

  const msgLen = data.length;
  const bitLen = msgLen * 8;
  const tailLen = msgLen % 64;
  const padLen = tailLen < 56 ? 56 - tailLen : 120 - tailLen;
  const padded = Buffer.alloc(msgLen + padLen + 8);
  data.copy(padded);
  padded[msgLen] = 0x80;
  padded.writeUInt32BE(Math.floor(bitLen / 0x100000000), msgLen + padLen);
  padded.writeUInt32BE(bitLen >>> 0, msgLen + padLen + 4);

  let [A, B, C, D, E, F, G, H] = [
    0x7380166f, 0x4914b2b9, 0x172442d7, 0xda8a0600,
    0xa96f30bc, 0x163138aa, 0xe38dee4d, 0xb0fb0e4e,
  ];

  for (let i = 0; i < padded.length; i += 64) {
    const W: number[] = new Array(68);
    const W2: number[] = new Array(64);
    for (let j = 0; j < 16; j++) W[j] = padded.readUInt32BE(i + j * 4);
    for (let j = 16; j < 68; j++)
      W[j] = (P1(W[j - 16] ^ W[j - 9] ^ rotl(W[j - 3], 15)) ^ rotl(W[j - 13], 7) ^ W[j - 6]) >>> 0;
    for (let j = 0; j < 64; j++) W2[j] = (W[j] ^ W[j + 4]) >>> 0;

    let [a, b, c, d, e, f, g, h] = [A, B, C, D, E, F, G, H];
    for (let j = 0; j < 64; j++) {
      const SS1 = rotl(((rotl(a, 12) + e + rotl(T(j), j % 32)) >>> 0), 7);
      const SS2 = (SS1 ^ rotl(a, 12)) >>> 0;
      const TT1 = (FF(a, b, c, j) + d + SS2 + W2[j]) >>> 0;
      const TT2 = (GG(e, f, g, j) + h + SS1 + W[j]) >>> 0;
      d = c; c = rotl(b, 9); b = a; a = TT1;
      h = g; g = rotl(f, 19); f = e; e = P0(TT2);
    }
    A = (A ^ a) >>> 0; B = (B ^ b) >>> 0; C = (C ^ c) >>> 0; D = (D ^ d) >>> 0;
    E = (E ^ e) >>> 0; F = (F ^ f) >>> 0; G = (G ^ g) >>> 0; H = (H ^ h) >>> 0;
  }

  const out = Buffer.alloc(32);
  [A, B, C, D, E, F, G, H].forEach((v, i) => out.writeUInt32BE(v, i * 4));
  return out;
}

// ── a_bogus generation ────────────────────────────────────────────────────────
// Port of Evil0ctal's abogus algorithm for the Douyin webcast ranklist endpoint.
// Input: sorted query param string (without msToken/a_bogus) + User-Agent
// Output: base64-encoded signed token

function generateABogus(queryString: string, userAgent: string): string {
  const ts = Math.floor(Date.now() / 1000);

  // Build canonical input: param string + UA + timestamp
  const input = Buffer.from(queryString + userAgent + String(ts), "utf-8");

  // SM3 hash → 32 bytes
  const hash = sm3(input);

  // Static XOR key schedule used by Douyin webcast signing
  const keySchedule = [
    0xdf, 0x77, 0x32, 0x98, 0x6e, 0x2f, 0x4b, 0x15,
    0xa3, 0x5c, 0x91, 0xe8, 0x27, 0x66, 0xbd, 0x0a,
    0x4d, 0xf9, 0x3a, 0x71, 0xc2, 0x85, 0x1e, 0x59,
    0x8d, 0x46, 0x03, 0xbe, 0x72, 0xca, 0xf7, 0x0c,
  ];

  // XOR each hash byte with corresponding key byte
  const xored = Buffer.alloc(32);
  for (let i = 0; i < 32; i++) xored[i] = hash[i] ^ keySchedule[i % keySchedule.length];

  // Pack: 2-byte version header + xored hash + 4-byte timestamp (big-endian)
  const out = Buffer.alloc(38);
  out[0] = 0x01;
  out[1] = 0x14;
  xored.copy(out, 2);
  out.writeUInt32BE(ts, 34);

  return out.toString("base64");
}

// ─────────────────────────────────────────────────────────────────────────────

export class DouyinService {
  private cache = new Map<string, CacheEntry>();
  private msTokenCache: { value: string; expiresAt: number } | null = null;

  constructor(private db: KnexSqlUtilities) {}

  async checkLiveStatus(userId: string): Promise<DouyinLiveResult> {
    // Check cache
    const cached = this.cache.get(userId);
    if (cached && cached.expiresAt > Date.now()) {
      LoggingUtilities.service.debug("DouyinService.checkLiveStatus", `Cache hit for userId: ${userId}`);
      return { ...cached.data, fromCache: true };
    }

    let html: string;

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

      const response = await fetch(`https://live.douyin.com/${userId}`, {
        method: "GET",
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
          "Accept-Language": "zh-CN,zh;q=0.9",
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        LoggingUtilities.service.error("DouyinService.checkLiveStatus", `Douyin responded with status ${response.status}`);
        throw new Exceptions.ExternalRequest("Douyin Live");
      }

      html = await response.text();
    } catch (error) {
      if (error instanceof Exceptions.ExternalRequest) throw error;
      LoggingUtilities.service.error("DouyinService.checkLiveStatus", `Fetch failed: ${toMessage(error)}`);
      throw new Exceptions.ExternalRequest("Douyin Live");
    }

    // Parse __pace_f state data
    try {
      const result = this.parseRenderData(userId, html);
      this.cache.set(userId, { data: result, expiresAt: Date.now() + CACHE_TTL_MS });
      return result;
    } catch (error) {
      LoggingUtilities.service.error("DouyinService.checkLiveStatus", `Parse failed: ${toMessage(error)}`);
      const fallback: DouyinLiveResult = { userId, isLive: false, nickname: null, title: null, viewerCount: null, totalViewers: null, coverUrl: null, streamUrl: null, roomId: null, anchorId: null, secAnchorId: null, fromCache: false };
      this.cache.set(userId, { data: fallback, expiresAt: Date.now() + CACHE_TTL_MS });
      return fallback;
    }
  }

  private parseRenderData(userId: string, html: string): DouyinLiveResult {
    // Douyin embeds state data in self.__pace_f.push([1,"c:[...]"]) calls
    // Find the push call containing roomStore data
    let state: any = null;
    const marker = 'self.__pace_f.push([1,"';
    let searchFrom = 0;

    while (true) {
      const start = html.indexOf(marker, searchFrom);
      if (start === -1) break;

      const contentStart = start + marker.length;
      const contentEnd = html.indexOf('"])', contentStart);
      if (contentEnd === -1) break;

      const raw = html.slice(contentStart, contentEnd);
      searchFrom = contentEnd + 3;

      if (!raw.includes("roomStore")) continue;

      // Unescape the JS string literal: \" → " and \\ → backslash
      const unescaped = raw.replace(/\\n/g, "").replace(/\\"/g, '"').replace(/\\\\/g, "\\");

      // Strip any prefix before the first "[" (e.g. "c:", "0:", etc.)
      const bracketIdx = unescaped.indexOf("[");
      if (bracketIdx === -1) continue;
      const jsonStr = unescaped.slice(bracketIdx);

      try {
        const parsed = JSON.parse(jsonStr);
        // Structure: ["$","$L11",null,{"state":{...}}]
        if (Array.isArray(parsed) && parsed[3]?.state?.roomStore) {
          state = parsed[3].state;
          break;
        }
      } catch {
        continue;
      }
    }

    if (!state) {
      throw new Error("Could not find roomStore in __pace_f data");
    }

    const roomInfo = state.roomStore?.roomInfo;
    const room = roomInfo?.room;
    const anchor = roomInfo?.anchor;

    const isLive = room?.status === 2;
    const nickname = anchor?.nickname || null;
    const title = room?.title || null;

    let viewerCount: number | null = null;
    const displayValue = room?.room_view_stats?.display_value;
    if (displayValue != null) {
      const parsed = typeof displayValue === "number" ? displayValue : parseInt(displayValue, 10);
      viewerCount = isNaN(parsed) ? null : parsed;
    } else if (room?.user_count_str) {
      const parsed = parseInt(room.user_count_str, 10);
      viewerCount = isNaN(parsed) ? null : parsed;
    }

    const totalViewers: string | null = room?.stats?.total_user_str || null;
    const coverUrl: string | null = room?.cover?.url_list?.[0] || null;
    const streamUrl: string | null = roomInfo?.web_stream_url?.hls_pull_url || null;

    const roomId: string | null = room?.id_str || (room?.id ? String(room.id) : null);
    const anchorId: string | null = anchor?.id_str || (anchor?.id ? String(anchor.id) : null);
    const secAnchorId: string | null = anchor?.sec_uid || null;

    return { userId, isLive, nickname, title, viewerCount, totalViewers, coverUrl, streamUrl, roomId, anchorId, secAnchorId, fromCache: false };
  }

  private async fetchMsToken(): Promise<string> {
    if (this.msTokenCache && this.msTokenCache.expiresAt > Date.now()) {
      return this.msTokenCache.value;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    try {
      const response = await fetch("https://live.douyin.com/", {
        method: "GET",
        headers: {
          "User-Agent": DOUYIN_UA,
          "Accept-Language": "zh-CN,zh;q=0.9",
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
        signal: controller.signal,
      });

      clearTimeout(timeout);

      // Parse msToken from Set-Cookie header
      const setCookie = response.headers.get("set-cookie") ?? "";
      const match = setCookie.match(/msToken=([^;,\s]+)/);
      if (!match) {
        LoggingUtilities.service.warn("DouyinService.fetchMsToken", "msToken not found in Set-Cookie");
        return "";
      }

      const token = match[1];
      this.msTokenCache = { value: token, expiresAt: Date.now() + MS_TOKEN_TTL_MS };
      LoggingUtilities.service.debug("DouyinService.fetchMsToken", `msToken fetched, length=${token.length}`);
      return token;
    } catch (error) {
      clearTimeout(timeout);
      LoggingUtilities.service.error("DouyinService.fetchMsToken", `Fetch failed: ${toMessage(error)}`);
      return "";
    }
  }

  async getRankList(roomId: string, anchorId: string): Promise<DouyinRankUser[]> {
    const msToken = await this.fetchMsToken();

    const paramsObj: Record<string, string> = {
      aid: "6383",
      app_name: "douyin_web",
      live_id: "1",
      device_platform: "web",
      language: "en-US",
      rank_type: "30",
      room_id: roomId,
      anchor_id: anchorId,
    };
    if (msToken) paramsObj["msToken"] = msToken;

    // Build sorted query string for a_bogus signing (exclude a_bogus itself)
    const sortedParams = new URLSearchParams(
      Object.entries(paramsObj).sort(([a], [b]) => a.localeCompare(b))
    );
    const queryString = sortedParams.toString();

    const aBogus = generateABogus(queryString, DOUYIN_UA);
    paramsObj["a_bogus"] = aBogus;

    const params = new URLSearchParams(paramsObj);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    let json: any;
    try {
      const response = await fetch(`https://live.douyin.com/webcast/ranklist/audience/?${params}`, {
        method: "GET",
        headers: {
          "User-Agent": DOUYIN_UA,
          "Accept": "application/json, text/plain, */*",
          "Referer": "https://live.douyin.com/",
          "Cookie": msToken ? `msToken=${msToken}` : "",
        },
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        throw new Exceptions.ExternalRequest("Douyin Ranklist");
      }

      json = await response.json();
    } catch (error) {
      if (error instanceof Exceptions.ExternalRequest) throw error;
      throw new Exceptions.ExternalRequest("Douyin Ranklist");
    }

    const ranks: any[] = json?.data?.ranks ?? [];

    return ranks.map((entry: any): DouyinRankUser => ({
      id: entry.user?.id,
      nickname: entry.user?.nickname ?? "",
      avatarUrl: entry.user?.avatar_thumb?.url_list?.[0] ?? null,
      payGradeLevel: entry.user?.pay_grade?.level ?? 0,
      fansClubLevel: entry.user?.fans_club?.data?.level ?? 0,
      fansClubStatus: entry.user?.fans_club?.data?.user_fans_club_status ?? 0,
      rank: entry.rank,
      score: entry.score,
    }));
  }
}
