import KnexSqlUtilities from "../utils/KnexSqlUtilities.js";
import { IRequestLogEvent } from "../models/IRequestLogContext.js";
import { ITb_suggestion_packing } from "../models/databases/tb_suggestion_packing.js";
import { ITb_suggestion_note } from "../models/databases/tb_suggestion_note.js";

export class SuggestionService {
  constructor(private readonly db: KnexSqlUtilities) {}

  async getAllPacking(logEvent?: IRequestLogEvent): Promise<ITb_suggestion_packing[]> {
    return this.db.find<ITb_suggestion_packing>(
      "tb_suggestion_packing",
      { record_status: "A" } as any,
      { orderBy: "trip_type" },
      logEvent,
    );
  }

  async createPacking(
    data: { tripType: string; label: string; labelKey?: string; category?: string },
    logEvent?: IRequestLogEvent,
  ): Promise<ITb_suggestion_packing> {
    return this.db.insert<Partial<ITb_suggestion_packing>, ITb_suggestion_packing>(
      "tb_suggestion_packing",
      {
        trip_type: data.tripType,
        label: data.label,
        label_key: data.labelKey ?? null,
        category: data.category ?? null,
        record_status: "A",
        created_dt: Date.now(),
      },
      logEvent,
    );
  }

  async deletePacking(id: number, logEvent?: IRequestLogEvent): Promise<void> {
    await this.db.update<any>(
      "tb_suggestion_packing",
      { id },
      { record_status: "D" },
      logEvent,
    );
  }

  // Small curated list per country — exact (case-insensitive) match is fine,
  // unlike activity's fuzzy LIKE, since this table is admin-curated and small.
  async getNotesByCountry(country: string, logEvent?: IRequestLogEvent): Promise<ITb_suggestion_note[]> {
    return this.db.find<ITb_suggestion_note>(
      "tb_suggestion_note",
      { record_status: "A" } as any,
      {
        extraWhere: (q) => q.whereRaw("LOWER(country) = LOWER(?)", [country]),
        orderBy: "id",
      },
      logEvent,
    );
  }

  async createNote(
    data: {
      country: string;
      title: string;
      url: string;
      category?: string;
      mandatory?: boolean;
      minDaysBeforeArrival?: number;
      maxAdvanceHours?: number;
      notes?: string;
    },
    logEvent?: IRequestLogEvent,
  ): Promise<ITb_suggestion_note> {
    return this.db.insert<Partial<ITb_suggestion_note>, ITb_suggestion_note>(
      "tb_suggestion_note",
      {
        country: data.country,
        title: data.title,
        url: data.url,
        category: data.category ?? null,
        mandatory: data.mandatory ? 1 : 0,
        min_days_before_arrival: data.minDaysBeforeArrival ?? null,
        max_advance_hours: data.maxAdvanceHours ?? null,
        notes: data.notes ?? null,
        record_status: "A",
        created_dt: Date.now(),
      },
      logEvent,
    );
  }

  async deleteNote(id: number, logEvent?: IRequestLogEvent): Promise<void> {
    await this.db.update<any>(
      "tb_suggestion_note",
      { id },
      { record_status: "D" },
      logEvent,
    );
  }
}
