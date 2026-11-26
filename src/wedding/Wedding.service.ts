import type { Knex } from "knex";
import KnexSqlUtilities from "../utils/KnexSqlUtilities.js";
import { IRequestLogContext, IRequestLogEvent } from "../models/IRequestLogContext.js";
import { ITb_wedding_rsvp } from "../models/databases/tb_wedding_rsvp.js";
import { ITb_wedding_rsvp_guest } from "../models/databases/tb_wedding_rsvp_guest.js";
import { RecordStatus } from "../constants/RecordStatus.js";
import { Exceptions } from "../exceptions/AppExceptions.js";
import { MaskingUtilities } from "../utils/MaskingUtilities.js";
import { MailerUtilities, MailOptions } from "../utils/MailerUtilities.js";
import { LoggingUtilities } from "../utils/logging/LoggingUtilities.js";
import { toMessage } from "../utils/errorUtils.js";
import { rsvpConfirmationMail, rsvpGuestMail } from "./Wedding.emailTemplate.js";
import {
  ReplacedRsvp,
  WeddingRsvpBody,
  WeddingRsvpGuestBody,
  WeddingRsvpPreflightDto,
  WeddingRsvpStatusMatchDto,
  WeddingRsvpStatusQuery,
  WeddingRsvpSubmittedDto,
} from "./Wedding.types.js";

const WEDDING_RSVP_TABLE = "tb_wedding_rsvp";
const WEDDING_RSVP_GUEST_TABLE = "tb_wedding_rsvp_guest";

// PDPA retention notice surfaced to guests at collection (POST /rsvp). It PROMISES deletion:
// there is no purge job, the tables are dropped by hand after the wedding (deliberate).
export const WEDDING_PDPA_NOTICE =
  "Your RSVP details are collected only for this wedding and will be permanently deleted the day after the event.";

// 4 digits = 10,000 pins: collisions are rare at guest-list scale, but still checked. The
// uq_wedding_rsvp_pin key covers deleted rows too, so uniqueness is checked against every row.
const PIN_LENGTH = 4;
const PIN_SPACE = 10 ** PIN_LENGTH;
const PIN_GENERATION_ATTEMPTS = 20;

const STATUS_COLUMNS = ["id", "pin", "name", "attending", "created_dt", "updated_dt"] as const;
const LOG_LABEL = "WeddingService";

/** Case-insensitive email match (stored emails keep the case they were typed in). */
const emailEquals = (email: string) => (qb: Knex.QueryBuilder) => {
  qb.whereRaw("LOWER(email) = LOWER(?)", [email]);
};

const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** A random 4-digit pin (leading zeros kept). Guessability is accepted: only the global limiter protects lookup. */
export const randomPin = (random: () => number = Math.random): string =>
  String(Math.floor(random() * PIN_SPACE)).padStart(PIN_LENGTH, "0");

/**
 * Tamper alert input: what (if anything) this submission replaced. The email's own earlier RSVP wins over a
 * guest entry; `at` is when that RSVP was last saved (0 if unknown).
 */
export function replacedRsvp(
  previous: Pick<ITb_wedding_rsvp, "created_dt" | "updated_dt">[],
  guestEntryCount: number,
): ReplacedRsvp | null {
  if (previous.length > 0) {
    return { kind: "own", at: Math.max(...previous.map((r) => Number(r.updated_dt ?? r.created_dt) || 0)) };
  }
  return guestEntryCount > 0 ? { kind: "guest" } : null;
}

/** Public status view: names masked (PDPA), no contact details, the pin instead of the auto-increment id. */
export function toStatusMatchDto(
  rsvp: Pick<ITb_wedding_rsvp, "pin" | "name" | "attending" | "created_dt" | "updated_dt">,
  guestNames: string[],
  matchedGuestName?: string,
): WeddingRsvpStatusMatchDto {
  return {
    pin: rsvp.pin,
    name: MaskingUtilities.maskName(rsvp.name),
    attending: rsvp.attending === 1,
    additionalGuestNames: guestNames.map((name) => MaskingUtilities.maskName(name)),
    ...(matchedGuestName !== undefined && { matchedGuestName: MaskingUtilities.maskName(matchedGuestName) }),
    createdAt: rsvp.created_dt,
    updatedAt: rsvp.updated_dt,
  };
}

interface GuestMailRecipient {
  guest: WeddingRsvpGuestBody;
  to: string;
}

/** Guests who were given an email, minus the submitter's own address and repeats (one email per inbox). */
export function guestMailRecipients(rsvp: WeddingRsvpBody): GuestMailRecipient[] {
  const seen = new Set([rsvp.email.toLowerCase()]);
  const recipients: GuestMailRecipient[] = [];
  for (const guest of rsvp.additionalGuestContact) {
    if (!guest.email || seen.has(guest.email.toLowerCase())) continue;
    seen.add(guest.email.toLowerCase());
    recipients.push({ guest, to: guest.email });
  }
  return recipients;
}

export class WeddingService {
  constructor(
    private readonly db: KnexSqlUtilities,
    private readonly nextPin: () => string = randomPin,
  ) {}

  /**
   * Step-1 existence check for the RSVP form: does this email already have an RSVP, as a main registrant or as
   * someone's additional guest? Booleans only. `hasEmail` always equals `exists` (the lookup is by email);
   * it stays for the jessikheng contract.
   */
  async checkRsvpExistsByEmail(email: string, logContext?: IRequestLogContext): Promise<WeddingRsvpPreflightDto> {
    const event = LoggingUtilities.request.branch(logContext, "SERVICE", "RSVP preflight");
    const [rsvp] = await this.db.find<ITb_wedding_rsvp>(
      WEDDING_RSVP_TABLE,
      { record_status: RecordStatus.ACTIVE },
      { limit: 1, columns: ["id"], extraWhere: emailEquals(email) },
      event,
    );
    const [guest] = rsvp
      ? []
      : await this.db.find<ITb_wedding_rsvp_guest>(
          WEDDING_RSVP_GUEST_TABLE,
          { record_status: RecordStatus.ACTIVE },
          { limit: 1, columns: ["id"], extraWhere: emailEquals(email) },
          event,
        );
    const exists = Boolean(rsvp ?? guest);
    if (event) event.detail = rsvp ? "registrant" : guest ? "guest" : "none";
    return { exists, hasEmail: exists };
  }

  /**
   * Status lookup: BOTH the pin and a name on that pin's RSVP (registrant or listed guest) are required.
   * A wrong pin or a name that isn't on it → null. Names in the result are masked.
   */
  async findRsvpStatus(
    query: WeddingRsvpStatusQuery,
    logContext?: IRequestLogContext,
  ): Promise<WeddingRsvpStatusMatchDto | null> {
    const event = LoggingUtilities.request.branch(logContext, "SERVICE", "RSVP status lookup");
    const rsvp = await this.db.findOne<ITb_wedding_rsvp>(
      WEDDING_RSVP_TABLE,
      { pin: query.pin, record_status: RecordStatus.ACTIVE },
      STATUS_COLUMNS,
      event,
    );
    if (!rsvp) {
      if (event) event.detail = "no match";
      return null;
    }
    const guestNames = (
      await this.db.find<ITb_wedding_rsvp_guest>(
        WEDDING_RSVP_GUEST_TABLE,
        { rsvp_id: rsvp.id, record_status: RecordStatus.ACTIVE },
        { columns: ["name"] },
        event,
      )
    ).map((g) => g.name);

    if (sameName(rsvp.name, query.name)) {
      if (event) event.detail = "registrant";
      return toStatusMatchDto(rsvp, guestNames);
    }
    const matchedGuest = guestNames.find((name) => sameName(name, query.name));
    if (event) event.detail = matchedGuest !== undefined ? "guest" : "no match";
    return matchedGuest !== undefined ? toStatusMatchDto(rsvp, guestNames, matchedGuest) : null;
  }

  /**
   * Saves an RSVP keyed by email. Re-submitting an email soft-deletes that email's earlier RSVP (+ its guests)
   * and any guest entry for it on someone else's RSVP, then inserts a new row with a new pin. No pin is needed to
   * overwrite (deliberate: every RSVP is emailed, and the confirmation carries a tamper alert when it replaced one).
   */
  async submitRsvp(rsvp: WeddingRsvpBody, logContext?: IRequestLogContext): Promise<WeddingRsvpSubmittedDto> {
    const event = LoggingUtilities.request.branch(logContext, "SERVICE", "Submit RSVP");
    const now = Date.now();

    const previous = await this.db.find<ITb_wedding_rsvp>(
      WEDDING_RSVP_TABLE,
      { record_status: RecordStatus.ACTIVE },
      { columns: ["id", "created_dt", "updated_dt"], extraWhere: emailEquals(rsvp.email) },
      event,
    );
    for (const { id } of previous) {
      await this.db.update<Partial<ITb_wedding_rsvp>>(
        WEDDING_RSVP_TABLE,
        { id },
        { record_status: RecordStatus.DELETED, updated_dt: now },
        event,
      );
      await this.db.update<Partial<ITb_wedding_rsvp_guest>>(
        WEDDING_RSVP_GUEST_TABLE,
        { rsvp_id: id, record_status: RecordStatus.ACTIVE },
        { record_status: RecordStatus.DELETED },
        event,
      );
    }

    // They're now answering for themselves, so a guest entry for this email on someone else's RSVP goes too.
    const guestEntries = await this.db.find<ITb_wedding_rsvp_guest>(
      WEDDING_RSVP_GUEST_TABLE,
      { record_status: RecordStatus.ACTIVE },
      { columns: ["id"], extraWhere: emailEquals(rsvp.email) },
      event,
    );
    for (const { id } of guestEntries) {
      await this.db.update<Partial<ITb_wedding_rsvp_guest>>(
        WEDDING_RSVP_GUEST_TABLE,
        { id },
        { record_status: RecordStatus.DELETED },
        event,
      );
    }

    const pin = await this.generateUniquePin(event);
    const saved = await this.db.insert<Partial<ITb_wedding_rsvp>, ITb_wedding_rsvp>(
      WEDDING_RSVP_TABLE,
      {
        pin,
        name: rsvp.name,
        email: rsvp.email,
        contact_number: rsvp.contactNumber,
        attending: rsvp.attending ? 1 : 0,
        dietary_restrictions: rsvp.dietaryRestrictions,
        meal_preference: rsvp.mealPreference,
        message: rsvp.message,
        record_status: RecordStatus.ACTIVE,
        created_dt: now,
        updated_dt: now,
      },
      event,
    );
    for (const guest of rsvp.additionalGuestContact) {
      await this.db.insert<Partial<ITb_wedding_rsvp_guest>>(
        WEDDING_RSVP_GUEST_TABLE,
        {
          rsvp_id: saved.id,
          name: guest.name,
          email: guest.email,
          contact_number: guest.contactNumber,
          dietary_restrictions: guest.dietaryRestrictions,
          meal_preference: guest.mealPreference,
          record_status: RecordStatus.ACTIVE,
          created_dt: now,
        },
        event,
      );
    }

    const replaced = replacedRsvp(previous, guestEntries.length);
    const recipients = guestMailRecipients(rsvp);
    this.sendInBackground(rsvpConfirmationMail(rsvp, replaced), `confirmation for RSVP #${saved.id}`);
    for (const { guest, to } of recipients) {
      this.sendInBackground(rsvpGuestMail(rsvp, guest, to), `guest email for RSVP #${saved.id}`);
    }

    if (event) {
      event.detail = `replaced ${replaced?.kind ?? "nothing"}; ${rsvp.additionalGuestContact.length} guests; ${1 + recipients.length} emails`;
    }
    return { pin, notice: WEDDING_PDPA_NOTICE };
  }

  /** Mail failures (SMTP down, bad address) must never fail or delay an RSVP that's already saved. */
  private sendInBackground(mail: MailOptions, what: string): void {
    MailerUtilities.sendMail(mail).catch((err) => {
      LoggingUtilities.service.error(LOG_LABEL, `Failed to send ${what}: ${toMessage(err)}`);
    });
  }

  private async generateUniquePin(event?: IRequestLogEvent): Promise<string> {
    for (let attempt = 0; attempt < PIN_GENERATION_ATTEMPTS; attempt++) {
      const pin = this.nextPin();
      const taken = await this.db.findOne<ITb_wedding_rsvp>(WEDDING_RSVP_TABLE, { pin }, ["id"], event);
      if (!taken) return pin;
    }
    throw new Exceptions.EntityCreation("RSVP pin");
  }
}
