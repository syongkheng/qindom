import { Request } from "express";
import { InvalidRequestException } from "../exceptions/InvalidRequestException";

const VALID_CEREMONY_TYPES = ["过大礼", "结婚", "回门", "custom"];
const VALID_DATE_STATUSES  = ["pending", "accepted", "rejected"];
const VALID_EVENT_CATS     = ["venue", "catering", "attire", "ceremony", "admin", "other"];
const VALID_EVENT_STATUSES = ["pending", "done"];
const VALID_GUEST_GROUPS   = ["bride", "groom", "mutual"];
const VALID_RSVP_STATUSES  = ["pending", "accepted", "declined"];

export class WeddingValidator {
  // ── Date Picker ──────────────────────────────────────────────────────────────

  static validateCreateSessionRequest(req: Request): { title: string } {
    const { title } = req.body;
    if (!title) throw new InvalidRequestException("title");
    return { title };
  }

  static validateAddDateRequest(req: Request): {
    session_id: number; date: string; ceremony_type: string; auspicious_notes?: string | null;
  } {
    const { session_id, date, ceremony_type, auspicious_notes } = req.body;
    if (!session_id) throw new InvalidRequestException("session_id");
    if (!date) throw new InvalidRequestException("date");
    if (!ceremony_type) throw new InvalidRequestException("ceremony_type");
    if (!VALID_CEREMONY_TYPES.includes(ceremony_type)) throw new InvalidRequestException("ceremony_type");
    return { session_id: Number(session_id), date, ceremony_type, auspicious_notes: auspicious_notes ?? null };
  }

  static validateUpdateDateRequest(req: Request): {
    id: number; date?: string; ceremony_type?: string; auspicious_notes?: string | null; status?: string;
  } {
    const { id, date, ceremony_type, auspicious_notes, status } = req.body;
    if (!id) throw new InvalidRequestException("id");
    if (ceremony_type && !VALID_CEREMONY_TYPES.includes(ceremony_type)) throw new InvalidRequestException("ceremony_type");
    if (status && !VALID_DATE_STATUSES.includes(status)) throw new InvalidRequestException("status");
    return { id: Number(id), date, ceremony_type, auspicious_notes, status };
  }

  // ── Events ───────────────────────────────────────────────────────────────────

  static validateCreateEventRequest(req: Request): {
    title: string; date: string; category: string; notes?: string | null;
  } {
    const { title, date, category, notes } = req.body;
    if (!title) throw new InvalidRequestException("title");
    if (!date) throw new InvalidRequestException("date");
    if (!category) throw new InvalidRequestException("category");
    if (!VALID_EVENT_CATS.includes(category)) throw new InvalidRequestException("category");
    return { title, date, category, notes: notes ?? null };
  }

  static validateUpdateEventStatusRequest(req: Request): { id: number; status: string } {
    const { id, status } = req.body;
    if (!id) throw new InvalidRequestException("id");
    if (!status || !VALID_EVENT_STATUSES.includes(status)) throw new InvalidRequestException("status");
    return { id: Number(id), status };
  }

  // ── Guests ───────────────────────────────────────────────────────────────────

  static validateCreateGuestRequest(req: Request): {
    name: string; group: string; plusOne: boolean; dietaryNotes?: string | null;
  } {
    const { name, group, plusOne, dietaryNotes } = req.body;
    if (!name) throw new InvalidRequestException("name");
    if (!group || !VALID_GUEST_GROUPS.includes(group)) throw new InvalidRequestException("group");
    return { name, group, plusOne: Boolean(plusOne), dietaryNotes: dietaryNotes ?? null };
  }

  static validateUpdateGuestRsvpRequest(req: Request): { id: number; rsvp: string } {
    const { id, rsvp } = req.body;
    if (!id) throw new InvalidRequestException("id");
    if (!rsvp || !VALID_RSVP_STATUSES.includes(rsvp)) throw new InvalidRequestException("rsvp");
    return { id: Number(id), rsvp };
  }

  static validateAssignTableRequest(req: Request): {
    guestId: number; tableId: number | null; seatNumber: number | null;
  } {
    const { guestId, tableId, seatNumber } = req.body;
    if (!guestId) throw new InvalidRequestException("guestId");
    return {
      guestId:    Number(guestId),
      tableId:    tableId != null ? Number(tableId) : null,
      seatNumber: seatNumber != null ? Number(seatNumber) : null,
    };
  }

  // ── Tables ───────────────────────────────────────────────────────────────────

  static validateCreateTableRequest(req: Request): { name: string; capacity: number } {
    const { name, capacity } = req.body;
    if (!name) throw new InvalidRequestException("name");
    if (capacity == null || Number(capacity) < 1) throw new InvalidRequestException("capacity");
    return { name, capacity: Number(capacity) };
  }

  // ── Shared ───────────────────────────────────────────────────────────────────

  static validateIdRequest(req: Request): { id: number } {
    const { id } = req.body;
    if (!id) throw new InvalidRequestException("id");
    return { id: Number(id) };
  }

  static validatePublicCommentRequest(req: Request): {
    date_id: number; commenter_name: string; comment: string;
  } {
    const { date_id, commenter_name, comment } = req.body;
    if (!date_id) throw new InvalidRequestException("date_id");
    if (!commenter_name) throw new InvalidRequestException("commenter_name");
    if (!comment) throw new InvalidRequestException("comment");
    return { date_id: Number(date_id), commenter_name: commenter_name.trim(), comment: comment.trim() };
  }
}
