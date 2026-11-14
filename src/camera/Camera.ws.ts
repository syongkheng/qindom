import type { IncomingMessage, Server } from "http";
import type { Duplex } from "stream";
import { WebSocketServer, WebSocket, RawData } from "ws";
import { LoggingUtilities } from "../utils/logging/LoggingUtilities.js";
import { JWT_COOKIE } from "../utils/AuthCookieUtilities.js";
import { resolveSessionUser } from "../middlewares/TokenFilter.js";
import { CameraService } from "./Camera.service.js";
import { CameraRelay } from "./Camera.relay.js";
import { CAMERA_MAX_FRAME_BYTES, CAMERA_WS_DASHBOARD_PATH, CAMERA_WS_PHONE_PATH } from "./Camera.protocol.js";

const HEARTBEAT_MS = 25_000; // under nginx's default 60 s proxy_read_timeout

function rejectUpgrade(socket: Duplex, status: number, reason: string): void {
  socket.write(`HTTP/1.1 ${status} ${reason}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
  socket.destroy();
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

function toBuffer(data: RawData): Buffer {
  if (Buffer.isBuffer(data)) return data;
  if (Array.isArray(data)) return Buffer.concat(data);
  return Buffer.from(data);
}

const clientIp = (req: IncomingMessage) => String(req.headers["x-real-ip"] || req.socket.remoteAddress || "unknown");

/**
 * Handles HTTP upgrades for the camera relay on the Express server:
 *  - /camera/ws/phone      — `Authorization: Bearer <device token>`
 *  - /camera/ws/dashboard  — session cookie + Origin in ALLOWED_ORIGINS (browsers
 *    can't send the CSRF header on a WebSocket, so Origin stands in for it)
 * Any other upgrade path is refused.
 */
export function attachCameraWebSockets(
  server: Server,
  deps: { service: CameraService; relay: CameraRelay; allowedOrigins: string[] },
): void {
  const { service, relay, allowedOrigins } = deps;
  const wss = new WebSocketServer({
    noServer: true,
    // Frames are already JPEG; compression would only cost CPU and latency.
    perMessageDeflate: false,
    maxPayload: CAMERA_MAX_FRAME_BYTES + 1024,
  });

  const alive = new WeakMap<WebSocket, boolean>();
  const heartbeat = setInterval(() => {
    for (const ws of wss.clients) {
      if (alive.get(ws) === false) {
        ws.terminate();
        continue;
      }
      alive.set(ws, false);
      ws.ping();
    }
  }, HEARTBEAT_MS);
  heartbeat.unref();

  const track = (ws: WebSocket) => {
    alive.set(ws, true);
    ws.on("pong", () => alive.set(ws, true));
    ws.on("error", () => ws.terminate());
  };

  server.on("upgrade", (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    socket.on("error", () => socket.destroy());
    const path = new URL(req.url ?? "/", "http://localhost").pathname;

    if (path === CAMERA_WS_PHONE_PATH) {
      void handlePhone(req, socket, head);
    } else if (path === CAMERA_WS_DASHBOARD_PATH) {
      void handleDashboard(req, socket, head);
    } else {
      rejectUpgrade(socket, 404, "Not Found");
    }
  });

  async function handlePhone(req: IncomingMessage, socket: Duplex, head: Buffer) {
    try {
      const header = req.headers.authorization ?? "";
      const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
      const device = token ? await service.authenticateDevice(token) : null;
      if (!device) return rejectUpgrade(socket, 401, "Unauthorized");

      wss.handleUpgrade(req, socket, head, (ws) => {
        track(ws);
        const conn = relay.addPhone(ws, { deviceId: device.uuid, userId: device.user_id ?? null, name: device.name });
        LoggingUtilities.service.info("camera", `phone ${device.uuid} connected from ${clientIp(req)}`);
        void service.touch(device.uuid).catch(() => {});

        ws.on("message", (data, isBinary) => {
          if (isBinary) relay.onPhoneFrame(conn, toBuffer(data));
          else relay.onPhoneText(conn, toBuffer(data).toString("utf8"));
        });
        ws.on("close", () => {
          relay.removePhone(conn);
          LoggingUtilities.service.info("camera", `phone ${device.uuid} disconnected`);
          void service.touch(device.uuid).catch(() => {});
        });
      });
    } catch (err) {
      LoggingUtilities.service.error("camera", `phone upgrade failed: ${String(err)}`);
      rejectUpgrade(socket, 500, "Internal Server Error");
    }
  }

  async function handleDashboard(req: IncomingMessage, socket: Duplex, head: Buffer) {
    try {
      const origin = req.headers.origin;
      if (!origin || !allowedOrigins.includes(origin)) return rejectUpgrade(socket, 403, "Forbidden");

      const user = await resolveSessionUser(readCookie(req, JWT_COOKIE));
      if (!user) return rejectUpgrade(socket, 401, "Unauthorized");

      wss.handleUpgrade(req, socket, head, (ws) => {
        track(ws);
        const conn = relay.addDashboard(ws, user.id);
        ws.on("message", (data, isBinary) => {
          if (!isBinary) relay.onDashboardText(conn, toBuffer(data).toString("utf8"));
        });
        ws.on("close", () => relay.removeDashboard(conn));
      });
    } catch (err) {
      LoggingUtilities.service.error("camera", `dashboard upgrade failed: ${String(err)}`);
      rejectUpgrade(socket, 500, "Internal Server Error");
    }
  }
}
