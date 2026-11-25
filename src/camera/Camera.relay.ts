import {
  CAMERA_CLOSE_REPLACED,
  CAMERA_CLOSE_UNAUTHORISED,
  CAMERA_MAX_DASHBOARD_BUFFER,
  CAMERA_MAX_FRAME_BYTES,
  CameraStatus,
  encodeFramePacket,
  parseCommand,
  parseJsonMessage,
  sanitiseAck,
  sanitiseStatus,
} from "./Camera.protocol.js";

/** The slice of a `ws` WebSocket the relay needs — lets tests use fakes. */
export interface RelaySocket {
  readonly bufferedAmount: number;
  send(data: Buffer | string, cb?: (err?: Error) => void): void;
  close(code?: number, reason?: string): void;
}

export interface PhoneConnection {
  socket: RelaySocket;
  deviceId: string;
  userId: number | null;
  name: string;
  status: CameraStatus | null;
  /** Latest encoded frame packet, replayed to dashboards that connect later. */
  lastFrame: Buffer | null;
}

interface FrameSlot {
  inFlight: boolean;
  pending: Buffer | null;
}

export interface DashboardConnection {
  socket: RelaySocket;
  userId: number;
  open: boolean;
  frames: Map<string, FrameSlot>;
}

/**
 * In-memory relay between phones and dashboards. Pure logic over `RelaySocket`
 * so it can be unit-tested; Camera.ws.ts wires real sockets into it.
 *
 * Frames: only the latest per device is kept. Per dashboard and device at most
 * one frame is being written and at most one waits behind it (newer replaces
 * older). Dashboards whose socket buffer is over the limit get nothing new.
 */
export class CameraRelay {
  private readonly phones = new Map<string, PhoneConnection>();
  private readonly dashboards = new Map<number, Set<DashboardConnection>>();

  constructor(private readonly maxDashboardBuffer = CAMERA_MAX_DASHBOARD_BUFFER) {}

  // ---- phones ----

  addPhone(socket: RelaySocket, device: { deviceId: string; userId: number | null; name: string }): PhoneConnection {
    const previous = this.phones.get(device.deviceId);
    if (previous) previous.socket.close(CAMERA_CLOSE_REPLACED, "replaced");

    const conn: PhoneConnection = { socket, ...device, status: null, lastFrame: null };
    this.phones.set(device.deviceId, conn);
    if (conn.userId != null) this.announceOnline(conn);
    return conn;
  }

  removePhone(conn: PhoneConnection): void {
    // A replaced connection closing late must not take its successor offline.
    if (this.phones.get(conn.deviceId) !== conn) return;
    this.phones.delete(conn.deviceId);
    if (conn.userId != null) {
      this.broadcast(conn.userId, { type: "device_offline", deviceId: conn.deviceId });
    }
  }

  onPhoneFrame(conn: PhoneConnection, jpeg: Buffer): void {
    if (conn.userId == null || jpeg.length === 0 || jpeg.length > CAMERA_MAX_FRAME_BYTES) return;
    const packet = encodeFramePacket(conn.deviceId, jpeg);
    conn.lastFrame = packet;
    for (const dashboard of this.dashboards.get(conn.userId) ?? []) {
      this.deliverFrame(dashboard, conn.deviceId, packet);
    }
  }

  onPhoneText(conn: PhoneConnection, text: string): void {
    const message = parseJsonMessage(text);
    if (!message) return;

    if (message.type === "status") {
      const status = sanitiseStatus(message.status);
      if (!status) return;
      conn.status = status;
      if (conn.userId != null) this.broadcast(conn.userId, { type: "status", deviceId: conn.deviceId, status });
    } else if (message.type === "ack") {
      const ack = sanitiseAck(message);
      if (ack && conn.userId != null) this.broadcast(conn.userId, { type: "ack", deviceId: conn.deviceId, ...ack });
    }
  }

  // ---- dashboards ----

  addDashboard(socket: RelaySocket, userId: number): DashboardConnection {
    const conn: DashboardConnection = { socket, userId, open: true, frames: new Map() };
    let set = this.dashboards.get(userId);
    if (!set) {
      set = new Set();
      this.dashboards.set(userId, set);
    }
    set.add(conn);

    for (const phone of this.phonesOf(userId)) {
      this.sendJson(socket, {
        type: "device_online",
        deviceId: phone.deviceId,
        name: phone.name,
        status: phone.status,
      });
      if (phone.lastFrame) this.deliverFrame(conn, phone.deviceId, phone.lastFrame);
    }
    return conn;
  }

  removeDashboard(conn: DashboardConnection): void {
    conn.open = false;
    conn.frames.clear();
    const set = this.dashboards.get(conn.userId);
    set?.delete(conn);
    if (set && set.size === 0) this.dashboards.delete(conn.userId);
  }

  onDashboardText(conn: DashboardConnection, text: string): void {
    const message = parseJsonMessage(text);
    if (!message) return;
    const command = parseCommand(message);
    if (!command) return;

    const owned = this.phonesOf(conn.userId);
    const targets = command.target === "all" ? owned : owned.filter((phone) => phone.deviceId === command.target);

    const forward: Record<string, unknown> = { type: command.type, requestId: command.requestId };
    if (command.quality) forward.quality = command.quality;

    const sent: string[] = [];
    for (const phone of targets) {
      this.sendJson(phone.socket, forward);
      sent.push(phone.deviceId);
    }
    // A named target that isn't one of the user's online phones is reported offline
    // (whether it's offline or not theirs is deliberately indistinguishable).
    const offline = command.target !== "all" && sent.length === 0 ? [command.target] : [];
    this.sendJson(conn.socket, { type: "command_result", requestId: command.requestId, sent, offline });
  }

  // ---- pairing lifecycle (called by the REST layer) ----

  /** A dashboard user just claimed this device: start relaying it to them. */
  bindDevice(deviceId: string, userId: number, name: string): void {
    const phone = this.phones.get(deviceId);
    if (!phone) return;
    phone.userId = userId;
    phone.name = name;
    this.sendJson(phone.socket, { type: "paired", name });
    this.announceOnline(phone);
  }

  /** Device removed by its owner: tell dashboards and close the phone's socket. */
  disconnectDevice(deviceId: string, userId: number): void {
    this.broadcast(userId, { type: "device_removed", deviceId });
    const phone = this.phones.get(deviceId);
    if (!phone) return;
    this.phones.delete(deviceId);
    phone.socket.close(CAMERA_CLOSE_UNAUTHORISED, "device removed");
  }

  isOnline(deviceId: string): boolean {
    return this.phones.has(deviceId);
  }

  // ---- internals ----

  private phonesOf(userId: number): PhoneConnection[] {
    return [...this.phones.values()].filter((phone) => phone.userId === userId);
  }

  private announceOnline(phone: PhoneConnection): void {
    if (phone.userId == null) return;
    this.broadcast(phone.userId, {
      type: "device_online",
      deviceId: phone.deviceId,
      name: phone.name,
      status: phone.status,
    });
  }

  private deliverFrame(dashboard: DashboardConnection, deviceId: string, packet: Buffer): void {
    if (!dashboard.open) return;
    let slot = dashboard.frames.get(deviceId);
    if (!slot) {
      slot = { inFlight: false, pending: null };
      dashboard.frames.set(deviceId, slot);
    }
    if (slot.inFlight) {
      slot.pending = packet; // newest wins; the older waiting frame is dropped
      return;
    }
    if (dashboard.socket.bufferedAmount > this.maxDashboardBuffer) return; // slow reader: drop

    const current = slot;
    current.inFlight = true;
    dashboard.socket.send(packet, () => {
      current.inFlight = false;
      const next = current.pending;
      current.pending = null;
      if (next) this.deliverFrame(dashboard, deviceId, next);
    });
  }

  private broadcast(userId: number, message: Record<string, unknown>): void {
    for (const dashboard of this.dashboards.get(userId) ?? []) {
      this.sendJson(dashboard.socket, message);
    }
  }

  private sendJson(socket: RelaySocket, message: Record<string, unknown>): void {
    try {
      socket.send(JSON.stringify(message));
    } catch {
      // Socket already closing; its close handler cleans up.
    }
  }
}
