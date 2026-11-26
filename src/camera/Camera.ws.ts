import type { IncomingMessage, Server } from "http";
import type { Duplex } from "stream";
import { WebSocketServer, WebSocket, RawData } from "ws";
import { LoggingUtilities } from "../utils/logging/LoggingUtilities.js";
import { toMessage } from "../utils/ErrorUtilities.js";
import { clientIp } from "../utils/RequestUtilities.js";
import { JWT_COOKIE } from "../utils/AuthCookieUtilities.js";
import { resolveSessionUser } from "../middlewares/TokenFilter.js";
import { Time } from "../constants/Time.js";
import { CameraService } from "./Camera.service.js";
import { CameraRelay } from "./Camera.relay.js";
import { CameraDeviceIdentity } from "./Camera.types.js";
import {
  CAMERA_MAX_FRAME_BYTES,
  CAMERA_MAX_TEXT_BYTES,
  CAMERA_WS_DASHBOARD_PATH,
  CAMERA_WS_PHONE_PATH,
  WS_CLOSE_INTERNAL_ERROR,
} from "./Camera.protocol.js";

const LOG_TAG = "camera";
/** Ping interval; under nginx's default 60 s proxy_read_timeout (and Cloudflare's 100 s idle limit). */
export const CAMERA_HEARTBEAT_MS = 25 * Time.SECOND_MS;
/** Room for a full frame plus the WebSocket framing; anything larger closes the socket (1009). */
const WS_MAX_PAYLOAD_BYTES = CAMERA_MAX_FRAME_BYTES + 1024;
const BEARER_PREFIX = "Bearer ";
/** Base for parsing the request path only; the host is never used. */
const URL_PARSE_BASE = "http://localhost";

const HttpStatus = {
  BAD_REQUEST: { code: 400, reason: "Bad Request" },
  UNAUTHORIZED: { code: 401, reason: "Unauthorized" },
  FORBIDDEN: { code: 403, reason: "Forbidden" },
  NOT_FOUND: { code: 404, reason: "Not Found" },
  INTERNAL: { code: 500, reason: "Internal Server Error" },
} as const;
type HttpStatus = (typeof HttpStatus)[keyof typeof HttpStatus];

/** Session user lookup for the dashboard socket (defaults to the same check as MandatoryTokenFilter). */
export type SessionUserResolver = (token: string | undefined) => Promise<{ id: number } | null>;

export interface CameraWebSocketDeps {
  service: Pick<CameraService, "authenticateDevice" | "touch">;
  relay: CameraRelay;
  allowedOrigins: string[];
  resolveUser?: SessionUserResolver;
  heartbeatMs?: number;
}

export interface CameraWebSockets {
  /** Stops the heartbeat, detaches from the server and drops every socket (tests, shutdown). */
  close(): void;
}

const logError = (what: string, err: unknown) =>
  LoggingUtilities.service.error(LOG_TAG, `${what} failed: ${toMessage(err)}`);

/**
 * Runs an event callback that nobody awaits (socket events, timers). A throw here would be
 * an uncaught exception and take the whole API down, so it is logged and swallowed.
 */
function guard(what: string, fn: () => void): void {
  try {
    fn();
  } catch (err) {
    logError(what, err);
  }
}

function rejectUpgrade(socket: Duplex, status: HttpStatus): void {
  try {
    socket.write(`HTTP/1.1 ${status.code} ${status.reason}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
  } finally {
    socket.destroy();
  }
}

/** The request path, or null when the URL can't be parsed (e.g. `//`). */
function upgradePath(url: string | undefined): string | null {
  try {
    return new URL(url ?? "/", URL_PARSE_BASE).pathname;
  } catch {
    return null;
  }
}

function readCookie(req: IncomingMessage, name: string): string | undefined {
  for (const part of (req.headers.cookie ?? "").split(";")) {
    const index = part.indexOf("=");
    if (index > 0 && part.slice(0, index).trim() === name) {
      try {
        return decodeURIComponent(part.slice(index + 1).trim());
      } catch {
        return undefined;
      }
    }
  }
  return undefined;
}

function readBearerToken(req: IncomingMessage): string {
  const header = req.headers.authorization ?? "";
  return header.startsWith(BEARER_PREFIX) ? header.slice(BEARER_PREFIX.length).trim() : "";
}

function toBuffer(data: RawData): Buffer {
  if (Buffer.isBuffer(data)) return data;
  if (Array.isArray(data)) return Buffer.concat(data);
  return Buffer.from(data);
}

/** Text frames over the JSON limit are dropped before decoding. */
const toText = (data: RawData): string | null => {
  const buffer = toBuffer(data);
  return buffer.length > CAMERA_MAX_TEXT_BYTES ? null : buffer.toString("utf8");
};

/**
 * Handles HTTP upgrades for the camera relay on the Express server:
 *  - /camera/ws/phone      — `Authorization: Bearer <device token>`
 *  - /camera/ws/dashboard  — session cookie + Origin in ALLOWED_ORIGINS (browsers
 *    can't send the CSRF header on a WebSocket, so Origin stands in for it)
 * Any other upgrade path is refused. Every socket/timer callback is guarded: a bad client
 * can get its own socket closed, never crash the process.
 */
export function attachCameraWebSockets(server: Server, deps: CameraWebSocketDeps): CameraWebSockets {
  const { service, relay, allowedOrigins } = deps;
  const resolveUser = deps.resolveUser ?? resolveSessionUser;
  const wss = new WebSocketServer({
    noServer: true,
    // Frames are already JPEG; compression would only cost CPU and latency.
    perMessageDeflate: false,
    maxPayload: WS_MAX_PAYLOAD_BYTES,
  });
  wss.on("error", (err) => logError("WebSocket server", err));

  const alive = new WeakMap<WebSocket, boolean>();
  const heartbeat = setInterval(() => {
    for (const ws of wss.clients) {
      guard("heartbeat", () => {
        if (alive.get(ws) === false) {
          ws.terminate();
          return;
        }
        alive.set(ws, false);
        ws.ping();
      });
    }
  }, deps.heartbeatMs ?? CAMERA_HEARTBEAT_MS);
  heartbeat.unref();

  const track = (ws: WebSocket, label: string) => {
    alive.set(ws, true);
    ws.on("pong", () => alive.set(ws, true));
    // Protocol errors (oversize payload, bad framing) end up here; ws closes the socket itself.
    ws.on("error", (err) =>
      guard(`${label} socket error`, () => {
        LoggingUtilities.service.warn(LOG_TAG, `${label} socket error: ${toMessage(err)}`);
        ws.terminate();
      }),
    );
  };

  const touch = (deviceId: string) => {
    service.touch(deviceId).catch((err) => logError(`touch ${deviceId}`, err));
  };

  /**
   * Completes an authenticated upgrade. `ws` calls `setup` synchronously, so it gets its own
   * try/catch: an error there must close the WebSocket, not write an HTTP error onto it.
   */
  const upgrade = (req: IncomingMessage, socket: Duplex, head: Buffer, label: string, setup: (ws: WebSocket) => void) =>
    wss.handleUpgrade(req, socket, head, (ws) => {
      try {
        track(ws, label);
        setup(ws);
      } catch (err) {
        logError(`${label} setup`, err);
        guard(`${label} close`, () => ws.close(WS_CLOSE_INTERNAL_ERROR, "internal error"));
      }
    });

  function onPhoneSocket(ws: WebSocket, device: CameraDeviceIdentity, req: IncomingMessage): void {
    const conn = relay.addPhone(ws, device);
    LoggingUtilities.service.info(LOG_TAG, `phone ${device.deviceId} connected from ${clientIp(req)}`);
    touch(device.deviceId);

    ws.on("message", (data, isBinary) =>
      guard("phone message", () => {
        if (isBinary) {
          relay.onPhoneFrame(conn, toBuffer(data));
          return;
        }
        const text = toText(data);
        if (text !== null) relay.onPhoneText(conn, text);
      }),
    );
    ws.on("close", () =>
      guard("phone close", () => {
        relay.removePhone(conn);
        LoggingUtilities.service.info(LOG_TAG, `phone ${device.deviceId} disconnected`);
        touch(device.deviceId);
      }),
    );
  }

  function onDashboardSocket(ws: WebSocket, userId: number): void {
    const conn = relay.addDashboard(ws, userId);
    ws.on("message", (data, isBinary) =>
      guard("dashboard message", () => {
        if (isBinary) return; // dashboards only send JSON commands
        const text = toText(data);
        if (text !== null) relay.onDashboardText(conn, text);
      }),
    );
    ws.on("close", () => guard("dashboard close", () => relay.removeDashboard(conn)));
  }

  async function handlePhone(req: IncomingMessage, socket: Duplex, head: Buffer): Promise<void> {
    const token = readBearerToken(req);
    const device = token ? await service.authenticateDevice(token) : null;
    if (!device) return rejectUpgrade(socket, HttpStatus.UNAUTHORIZED);
    upgrade(req, socket, head, "phone", (ws) => onPhoneSocket(ws, device, req));
  }

  async function handleDashboard(req: IncomingMessage, socket: Duplex, head: Buffer): Promise<void> {
    const origin = req.headers.origin;
    if (!origin || !allowedOrigins.includes(origin)) return rejectUpgrade(socket, HttpStatus.FORBIDDEN);
    const user = await resolveUser(readCookie(req, JWT_COOKIE));
    if (!user) return rejectUpgrade(socket, HttpStatus.UNAUTHORIZED);
    upgrade(req, socket, head, "dashboard", (ws) => onDashboardSocket(ws, user.id));
  }

  /** Runs an async upgrade handler; any failure (DB down, …) becomes a 500 on the raw socket. */
  const run = (label: string, handler: Promise<void>, socket: Duplex) => {
    handler.catch((err) => {
      logError(`${label} upgrade`, err);
      guard(`${label} reject`, () => rejectUpgrade(socket, HttpStatus.INTERNAL));
    });
  };

  const onUpgrade = (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    try {
      socket.on("error", () => socket.destroy());
      const path = upgradePath(req.url);
      if (path === CAMERA_WS_PHONE_PATH) run("phone", handlePhone(req, socket, head), socket);
      else if (path === CAMERA_WS_DASHBOARD_PATH) run("dashboard", handleDashboard(req, socket, head), socket);
      else rejectUpgrade(socket, path === null ? HttpStatus.BAD_REQUEST : HttpStatus.NOT_FOUND);
    } catch (err) {
      logError("upgrade", err);
      socket.destroy();
    }
  };
  server.on("upgrade", onUpgrade);

  return {
    close() {
      clearInterval(heartbeat);
      server.off("upgrade", onUpgrade);
      for (const ws of wss.clients) ws.terminate();
      wss.close();
    },
  };
}
