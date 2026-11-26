// ── Request bodies ────────────────────────────────────────────────────────────

/** One entry of `additionalGuestContact` on POST /wedding/rsvp (validated, trimmed, blanks → null). */
export interface WeddingRsvpGuestBody {
  name: string;
  email: string | null;
  contactNumber: string | null;
  dietaryRestrictions: string | null;
  mealPreference: string | null;
}

/** POST /wedding/rsvp (validated, trimmed, blanks → null). */
export interface WeddingRsvpBody {
  name: string;
  email: string;
  contactNumber: string | null;
  attending: boolean;
  dietaryRestrictions: string | null;
  mealPreference: string | null;
  message: string | null;
  additionalGuestContact: WeddingRsvpGuestBody[];
}

/** POST /wedding/rsvp/preflight. */
export interface WeddingRsvpPreflightBody {
  email: string;
}

/** GET /wedding/rsvp/status?name=&pin=. */
export interface WeddingRsvpStatusQuery {
  name: string;
  pin: string;
}

/** POST /wedding/visit, clipped to safe lengths (never rejected: it's a page-view beacon). */
export interface WeddingVisitBody {
  language: string;
  timezone: string;
  screen: string;
  referrer: string;
  path: string;
}

// ── Responses ─────────────────────────────────────────────────────────────────

/** POST /wedding/rsvp. The auto-increment id is never sent: `pin` is the guest-facing identifier. */
export interface WeddingRsvpSubmittedDto {
  pin: string;
  /** PDPA retention notice shown at collection. */
  notice: string;
}

/** POST /wedding/rsvp/preflight. Booleans only, never personal data. */
export interface WeddingRsvpPreflightDto {
  exists: boolean;
  hasEmail: boolean;
}

/**
 * One RSVP found by GET /wedding/rsvp/status. Public and unauthenticated, so it lists
 * masked names only (no email, contact number or dietary info).
 */
export interface WeddingRsvpStatusMatchDto {
  pin: string;
  /** Masked name of the main registrant. */
  name: string;
  attending: boolean;
  /** Masked names of the listed guests. */
  additionalGuestNames: string[];
  /** Masked; present only when the match was found via a guest's name ("X is on Y's RSVP"). */
  matchedGuestName?: string;
  createdAt: number;
  updatedAt: number;
}

/** GET /wedding/rsvp/status: zero or one match (array kept for the jessikheng contract). */
export interface WeddingRsvpStatusDto {
  matches: WeddingRsvpStatusMatchDto[];
}

// ── Internal ──────────────────────────────────────────────────────────────────

/**
 * Set when a submission replaced an earlier response for the same email (tamper alert):
 * "own" = this email's previous RSVP, saved at `at` (ms; 0 if unknown);
 * "guest" = this email was listed as a guest on someone else's RSVP.
 */
export type ReplacedRsvp = { kind: "own"; at: number } | { kind: "guest" };

/** What the visit notifier relays to Telegram. */
export interface WeddingVisit extends WeddingVisitBody {
  ip: string;
  userAgent: string;
}
