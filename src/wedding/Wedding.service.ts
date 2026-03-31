import crypto from "crypto";
import KnexSqlUtilities from "../utils/KnexSqlUtilities";
import { ITB_WEDDING_SESSION } from "../models/databases/tb_wedding_session";
import { ITB_WEDDING_DATE } from "../models/databases/tb_wedding_date";
import { ITB_WEDDING_DATE_COMMENT } from "../models/databases/tb_wedding_date_comment";
import { ITB_WEDDING_EVENT } from "../models/databases/tb_wedding_event";
import { ITB_WEDDING_GUEST } from "../models/databases/tb_wedding_guest";
import { ITB_WEDDING_TABLE } from "../models/databases/tb_wedding_table";
import { Exceptions } from "../exceptions/AppExceptions";

const TB_WEDDING_SESSION      = "tb_wedding_session";
const TB_WEDDING_DATE         = "tb_wedding_date";
const TB_WEDDING_DATE_COMMENT = "tb_wedding_date_comment";
const TB_WEDDING_EVENT        = "tb_wedding_event";
const TB_WEDDING_GUEST        = "tb_wedding_guest";
const TB_WEDDING_TABLE        = "tb_wedding_table";

export interface SessionDto {
  id: number;
  shortCode: string;
  title: string;
  createdAt: number;
}

export interface CommentDto {
  id: number;
  dateId: number;
  commenterName: string;
  comment: string;
  createdAt: number;
}

export interface DateDto {
  id: number;
  sessionId: number;
  date: string;
  ceremonyType: string;
  auspiciousNotes: string | null;
  status: string;
  createdAt: number;
  comments: CommentDto[];
}

export interface PublicSessionDto {
  id: number;
  shortCode: string;
  title: string;
  dates: DateDto[];
}

export interface AddDateBody {
  sessionId: number;
  date: string;
  ceremonyType: string;
  auspiciousNotes?: string | null;
}

export interface UpdateDateBody {
  date?: string;
  ceremonyType?: string;
  auspiciousNotes?: string | null;
  status?: string;
}

export interface EventDto {
  id: number;
  title: string;
  date: string;
  category: string;
  status: string;
  notes: string | null;
  createdAt: number;
}

export interface CreateEventBody {
  title: string;
  date: string;
  category: string;
  notes?: string | null;
}

export interface GuestDto {
  id: number;
  name: string;
  group: string;
  rsvp: string;
  plusOne: boolean;
  dietaryNotes: string | null;
  tableId: number | null;
  seatNumber: number | null;
  createdAt: number;
}

export interface CreateGuestBody {
  name: string;
  group: string;
  plusOne: boolean;
  dietaryNotes?: string | null;
}

export interface TableDto {
  id: number;
  name: string;
  capacity: number;
  createdAt: number;
}

export interface CreateTableBody {
  name: string;
  capacity: number;
}

export class WeddingService {
  constructor(private db: KnexSqlUtilities) {}

  // ─── Mappers ──────────────────────────────────────────────────────────────────

  private mapSession(row: ITB_WEDDING_SESSION): SessionDto {
    return {
      id:        row.id!,
      shortCode: row.short_code,
      title:     row.title,
      createdAt: row.created_dt,
    };
  }

  private mapDate(row: ITB_WEDDING_DATE, comments: CommentDto[]): DateDto {
    return {
      id:              row.id!,
      sessionId:       row.session_id,
      date:            row.date,
      ceremonyType:    row.ceremony_type,
      auspiciousNotes: row.auspicious_notes ?? null,
      status:          row.status,
      createdAt:       row.created_dt,
      comments,
    };
  }

  private mapComment(row: ITB_WEDDING_DATE_COMMENT): CommentDto {
    return {
      id:            row.id!,
      dateId:        row.date_id,
      commenterName: row.commenter_name,
      comment:       row.comment,
      createdAt:     row.created_dt,
    };
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────────

  private async verifySessionOwnership(username: string, sessionId: number): Promise<ITB_WEDDING_SESSION> {
    const session = await this.db.findOne<ITB_WEDDING_SESSION>(
      TB_WEDDING_SESSION,
      { id: sessionId, record_status: "A" }
    );
    if (!session) throw new Exceptions.NotFound();
    if (session.created_by !== username) throw new Exceptions.ForbiddenAccess();
    return session;
  }

  private async fetchDatesWithComments(sessionId: number): Promise<DateDto[]> {
    const dates = await this.db.find<ITB_WEDDING_DATE>(
      TB_WEDDING_DATE,
      { session_id: sessionId, record_status: "A" },
      { orderBy: "date", orderDirection: "asc" }
    );

    if (!dates.length) return [];

    const dateIds = dates.map((d) => d.id!);
    const comments = await this.db.find<ITB_WEDDING_DATE_COMMENT>(
      TB_WEDDING_DATE_COMMENT,
      { record_status: "A" },
      { extraWhere: (qb: any) => qb.whereIn("date_id", dateIds), orderBy: "created_dt", orderDirection: "asc" }
    );

    const commentsByDateId = comments.reduce<Record<number, CommentDto[]>>((acc, row) => {
      const key = row.date_id;
      if (!acc[key]) acc[key] = [];
      acc[key].push(this.mapComment(row));
      return acc;
    }, {});

    return dates.map((d) => this.mapDate(d, commentsByDateId[d.id!] ?? []));
  }

  // ─── Sessions ────────────────────────────────────────────────────────────────

  async listSessions(username: string): Promise<SessionDto[]> {
    const rows = await this.db.find<ITB_WEDDING_SESSION>(
      TB_WEDDING_SESSION,
      { created_by: username, record_status: "A" },
      { orderBy: "created_dt", orderDirection: "desc" }
    );
    return rows.map((r) => this.mapSession(r));
  }

  async createSession(username: string, title: string): Promise<SessionDto> {
    const shortCode = crypto.randomBytes(4).toString("hex");
    const inserted = await this.db.insert<ITB_WEDDING_SESSION>(TB_WEDDING_SESSION, {
      short_code:    shortCode,
      title:         title.trim(),
      created_by:    username,
      created_dt:    Date.now(),
      record_status: "A",
    });
    return this.mapSession(inserted);
  }

  async deleteSession(username: string, id: number): Promise<boolean> {
    const session = await this.db.findOne<ITB_WEDDING_SESSION>(
      TB_WEDDING_SESSION,
      { id, created_by: username, record_status: "A" }
    );
    if (!session) return false;

    await this.db.update<ITB_WEDDING_SESSION>(TB_WEDDING_SESSION, { id }, { record_status: "D" });
    await this.db.raw(
      `UPDATE ${TB_WEDDING_DATE} SET record_status = 'D' WHERE session_id = ? AND record_status = 'A'`,
      [id]
    );
    await this.db.raw(
      `UPDATE ${TB_WEDDING_DATE_COMMENT} c
       JOIN ${TB_WEDDING_DATE} d ON c.date_id = d.id
       SET c.record_status = 'D'
       WHERE d.session_id = ? AND c.record_status = 'A'`,
      [id]
    );
    return true;
  }

  // ─── Dates ───────────────────────────────────────────────────────────────────

  async addDate(username: string, body: AddDateBody): Promise<DateDto> {
    await this.verifySessionOwnership(username, body.sessionId);
    const inserted = await this.db.insert<ITB_WEDDING_DATE>(TB_WEDDING_DATE, {
      session_id:       body.sessionId,
      date:             body.date,
      ceremony_type:    body.ceremonyType,
      auspicious_notes: body.auspiciousNotes ?? null,
      status:           "pending",
      created_by:       username,
      created_dt:       Date.now(),
      record_status:    "A",
    });
    return this.mapDate(inserted, []);
  }

  async updateDate(username: string, id: number, body: UpdateDateBody): Promise<DateDto | null> {
    const existing = await this.db.findOne<ITB_WEDDING_DATE>(
      TB_WEDDING_DATE,
      { id, record_status: "A" }
    );
    if (!existing) return null;

    await this.verifySessionOwnership(username, existing.session_id);

    const updatePayload: Partial<ITB_WEDDING_DATE> = {};
    if (body.date !== undefined)            updatePayload.date             = body.date;
    if (body.ceremonyType !== undefined)    updatePayload.ceremony_type    = body.ceremonyType;
    if (body.auspiciousNotes !== undefined) updatePayload.auspicious_notes = body.auspiciousNotes;
    if (body.status !== undefined)          updatePayload.status           = body.status;

    const updated = await this.db.update<ITB_WEDDING_DATE>(TB_WEDDING_DATE, { id }, updatePayload);
    const comments = await this.db.find<ITB_WEDDING_DATE_COMMENT>(
      TB_WEDDING_DATE_COMMENT,
      { date_id: id, record_status: "A" },
      { orderBy: "created_dt", orderDirection: "asc" }
    );
    return this.mapDate(updated[0], comments.map((c) => this.mapComment(c)));
  }

  async deleteDate(username: string, id: number): Promise<boolean> {
    const existing = await this.db.findOne<ITB_WEDDING_DATE>(
      TB_WEDDING_DATE,
      { id, record_status: "A" }
    );
    if (!existing) return false;

    await this.verifySessionOwnership(username, existing.session_id);
    await this.db.update<ITB_WEDDING_DATE>(TB_WEDDING_DATE, { id }, { record_status: "D" });
    return true;
  }

  // ─── Comments ────────────────────────────────────────────────────────────────

  async addComment(dateId: number, commenterName: string, comment: string): Promise<CommentDto> {
    const inserted = await this.db.insert<ITB_WEDDING_DATE_COMMENT>(TB_WEDDING_DATE_COMMENT, {
      date_id:        dateId,
      commenter_name: commenterName,
      comment:        comment,
      created_by:     commenterName,
      created_dt:     Date.now(),
      record_status:  "A",
    });
    return this.mapComment(inserted);
  }

  async deleteComment(username: string, commentId: number): Promise<boolean> {
    const comment = await this.db.findOne<ITB_WEDDING_DATE_COMMENT>(
      TB_WEDDING_DATE_COMMENT,
      { id: commentId, record_status: "A" }
    );
    if (!comment) return false;

    const date = await this.db.findOne<ITB_WEDDING_DATE>(
      TB_WEDDING_DATE,
      { id: comment.date_id, record_status: "A" }
    );
    if (!date) return false;

    await this.verifySessionOwnership(username, date.session_id);
    await this.db.update<ITB_WEDDING_DATE_COMMENT>(TB_WEDDING_DATE_COMMENT, { id: commentId }, { record_status: "D" });
    return true;
  }

  // ─── Events ──────────────────────────────────────────────────────────────────

  private mapEvent(row: ITB_WEDDING_EVENT): EventDto {
    return {
      id:        row.id!,
      title:     row.title,
      date:      row.date,
      category:  row.category,
      status:    row.status,
      notes:     row.notes ?? null,
      createdAt: row.created_dt,
    };
  }

  async listEvents(username: string): Promise<EventDto[]> {
    const rows = await this.db.find<ITB_WEDDING_EVENT>(
      TB_WEDDING_EVENT,
      { created_by: username, record_status: "A" },
      { orderBy: "date", orderDirection: "asc" }
    );
    return rows.map((r) => this.mapEvent(r));
  }

  async createEvent(username: string, body: CreateEventBody): Promise<EventDto> {
    const inserted = await this.db.insert<ITB_WEDDING_EVENT>(TB_WEDDING_EVENT, {
      title:         body.title.trim(),
      date:          body.date,
      category:      body.category,
      status:        "pending",
      notes:         body.notes ?? null,
      created_by:    username,
      created_dt:    Date.now(),
      record_status: "A",
    });
    return this.mapEvent(inserted);
  }

  async updateEventStatus(username: string, id: number, status: string): Promise<boolean> {
    const existing = await this.db.findOne<ITB_WEDDING_EVENT>(
      TB_WEDDING_EVENT,
      { id, created_by: username, record_status: "A" }
    );
    if (!existing) return false;
    await this.db.update<ITB_WEDDING_EVENT>(TB_WEDDING_EVENT, { id }, { status });
    return true;
  }

  async deleteEvent(username: string, id: number): Promise<boolean> {
    const existing = await this.db.findOne<ITB_WEDDING_EVENT>(
      TB_WEDDING_EVENT,
      { id, created_by: username, record_status: "A" }
    );
    if (!existing) return false;
    await this.db.update<ITB_WEDDING_EVENT>(TB_WEDDING_EVENT, { id }, { record_status: "D" });
    return true;
  }

  // ─── Tables ──────────────────────────────────────────────────────────────────

  private mapTable(row: ITB_WEDDING_TABLE): TableDto {
    return {
      id:        row.id!,
      name:      row.name,
      capacity:  row.capacity,
      createdAt: row.created_dt,
    };
  }

  async listTables(username: string): Promise<TableDto[]> {
    const rows = await this.db.find<ITB_WEDDING_TABLE>(
      TB_WEDDING_TABLE,
      { created_by: username, record_status: "A" },
      { orderBy: "created_dt", orderDirection: "asc" }
    );
    return rows.map((r) => this.mapTable(r));
  }

  async createTable(username: string, body: CreateTableBody): Promise<TableDto> {
    const inserted = await this.db.insert<ITB_WEDDING_TABLE>(TB_WEDDING_TABLE, {
      name:          body.name.trim(),
      capacity:      body.capacity,
      created_by:    username,
      created_dt:    Date.now(),
      record_status: "A",
    });
    return this.mapTable(inserted);
  }

  async deleteTable(username: string, id: number): Promise<boolean> {
    const existing = await this.db.findOne<ITB_WEDDING_TABLE>(
      TB_WEDDING_TABLE,
      { id, created_by: username, record_status: "A" }
    );
    if (!existing) return false;
    await this.db.update<ITB_WEDDING_TABLE>(TB_WEDDING_TABLE, { id }, { record_status: "D" });
    // Unassign guests from deleted table
    await this.db.raw(
      `UPDATE ${TB_WEDDING_GUEST} SET table_id = NULL, seat_number = NULL WHERE table_id = ? AND record_status = 'A'`,
      [id]
    );
    return true;
  }

  // ─── Guests ──────────────────────────────────────────────────────────────────

  private mapGuest(row: ITB_WEDDING_GUEST): GuestDto {
    return {
      id:           row.id!,
      name:         row.name,
      group:        row.guest_group,
      rsvp:         row.rsvp,
      plusOne:      row.plus_one === 1,
      dietaryNotes: row.dietary_notes ?? null,
      tableId:      row.table_id ?? null,
      seatNumber:   row.seat_number ?? null,
      createdAt:    row.created_dt,
    };
  }

  async listGuests(username: string): Promise<GuestDto[]> {
    const rows = await this.db.find<ITB_WEDDING_GUEST>(
      TB_WEDDING_GUEST,
      { created_by: username, record_status: "A" },
      { orderBy: "created_dt", orderDirection: "asc" }
    );
    return rows.map((r) => this.mapGuest(r));
  }

  async createGuest(username: string, body: CreateGuestBody): Promise<GuestDto> {
    const inserted = await this.db.insert<ITB_WEDDING_GUEST>(TB_WEDDING_GUEST, {
      name:          body.name.trim(),
      guest_group:   body.group,
      rsvp:          "pending",
      plus_one:      body.plusOne ? 1 : 0,
      dietary_notes: body.dietaryNotes ?? null,
      table_id:      null,
      seat_number:   null,
      created_by:    username,
      created_dt:    Date.now(),
      record_status: "A",
    });
    return this.mapGuest(inserted);
  }

  async updateGuestRsvp(username: string, id: number, rsvp: string): Promise<boolean> {
    const existing = await this.db.findOne<ITB_WEDDING_GUEST>(
      TB_WEDDING_GUEST,
      { id, created_by: username, record_status: "A" }
    );
    if (!existing) return false;
    await this.db.update<ITB_WEDDING_GUEST>(TB_WEDDING_GUEST, { id }, { rsvp });
    return true;
  }

  async assignGuestTable(username: string, guestId: number, tableId: number | null, seatNumber: number | null): Promise<boolean> {
    const guest = await this.db.findOne<ITB_WEDDING_GUEST>(
      TB_WEDDING_GUEST,
      { id: guestId, created_by: username, record_status: "A" }
    );
    if (!guest) return false;
    if (tableId !== null) {
      const table = await this.db.findOne<ITB_WEDDING_TABLE>(
        TB_WEDDING_TABLE,
        { id: tableId, created_by: username, record_status: "A" }
      );
      if (!table) return false;
    }
    await this.db.update<ITB_WEDDING_GUEST>(TB_WEDDING_GUEST, { id: guestId }, { table_id: tableId, seat_number: seatNumber });
    return true;
  }

  async deleteGuest(username: string, id: number): Promise<boolean> {
    const existing = await this.db.findOne<ITB_WEDDING_GUEST>(
      TB_WEDDING_GUEST,
      { id, created_by: username, record_status: "A" }
    );
    if (!existing) return false;
    await this.db.update<ITB_WEDDING_GUEST>(TB_WEDDING_GUEST, { id }, { record_status: "D" });
    return true;
  }

  // ─── Public ──────────────────────────────────────────────────────────────────

  async getSessionByShortCode(shortCode: string): Promise<PublicSessionDto | null> {
    const session = await this.db.findOne<ITB_WEDDING_SESSION>(
      TB_WEDDING_SESSION,
      { short_code: shortCode, record_status: "A" }
    );
    if (!session) return null;

    const dates = await this.fetchDatesWithComments(session.id!);
    return {
      id:        session.id!,
      shortCode: session.short_code,
      title:     session.title,
      dates,
    };
  }
}
