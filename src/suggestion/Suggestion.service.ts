import KnexSqlUtilities from "../utils/KnexSqlUtilities.js";
import { IRequestLogContext } from "../models/IRequestLogContext.js";
import { ITB_SUGGESTION_PACKING } from "../models/databases/tb_suggestion_packing.js";
import { ITB_SUGGESTION_NOTE } from "../models/databases/tb_suggestion_note.js";
import { LoggingUtilities } from "../utils/logging/LoggingUtilities.js";
import { RecordStatus } from "../constants/RecordStatus.js";
import {
  NoteSuggestionBody,
  NoteSuggestionDto,
  PackingSuggestionBody,
  PackingSuggestionDto,
  SuggestionDeletedDto,
} from "./Suggestion.types.js";

const SUGGESTION_PACKING_TABLE = "tb_suggestion_packing";
const SUGGESTION_NOTE_TABLE = "tb_suggestion_note";

function toPackingDto(row: ITB_SUGGESTION_PACKING): PackingSuggestionDto {
  return {
    id: row.id,
    tripType: row.trip_type,
    label: row.label,
    labelKey: row.label_key,
    category: row.category,
  };
}

function toNoteDto(row: ITB_SUGGESTION_NOTE): NoteSuggestionDto {
  return {
    id: row.id,
    country: row.country,
    title: row.title,
    url: row.url,
    category: row.category,
    mandatory: !!row.mandatory,
    minDaysBeforeArrival: row.min_days_before_arrival,
    maxAdvanceHours: row.max_advance_hours,
    notes: row.notes,
  };
}

/** Admin-curated trip suggestions: packing items (all trips) and country notes (visas, arrival cards). */
export class SuggestionService {
  constructor(private readonly db: KnexSqlUtilities) {}

  async getAllPacking(logContext?: IRequestLogContext): Promise<PackingSuggestionDto[]> {
    const event = LoggingUtilities.request.branch(logContext, "SERVICE", "List packing suggestions");
    const rows = await this.db.find<ITB_SUGGESTION_PACKING>(
      SUGGESTION_PACKING_TABLE,
      { record_status: RecordStatus.ACTIVE },
      { orderBy: "trip_type" },
      event,
    );
    return rows.map(toPackingDto);
  }

  async createPacking(body: PackingSuggestionBody, logContext?: IRequestLogContext): Promise<PackingSuggestionDto> {
    const event = LoggingUtilities.request.branch(logContext, "SERVICE", "Create packing suggestion");
    const row = await this.db.insert<ITB_SUGGESTION_PACKING>(
      SUGGESTION_PACKING_TABLE,
      {
        trip_type: body.tripType,
        label: body.label,
        label_key: body.labelKey,
        category: body.category,
        record_status: RecordStatus.ACTIVE,
        created_dt: Date.now(),
      },
      event,
    );
    return toPackingDto(row);
  }

  async deletePacking(id: number, logContext?: IRequestLogContext): Promise<SuggestionDeletedDto> {
    const event = LoggingUtilities.request.branch(logContext, "SERVICE", "Delete packing suggestion");
    await this.db.update<ITB_SUGGESTION_PACKING>(
      SUGGESTION_PACKING_TABLE,
      { id },
      { record_status: RecordStatus.DELETED },
      event,
    );
    return { deleted: true };
  }

  /** Exact, case-insensitive country match: the list is small and curated, so no fuzzy search. */
  async getNotesByCountry(country: string, logContext?: IRequestLogContext): Promise<NoteSuggestionDto[]> {
    const event = LoggingUtilities.request.branch(logContext, "SERVICE", "List note suggestions");
    const rows = await this.db.find<ITB_SUGGESTION_NOTE>(
      SUGGESTION_NOTE_TABLE,
      { record_status: RecordStatus.ACTIVE },
      { extraWhere: (q) => q.whereRaw("LOWER(country) = LOWER(?)", [country]), orderBy: "id" },
      event,
    );
    return rows.map(toNoteDto);
  }

  async createNote(body: NoteSuggestionBody, logContext?: IRequestLogContext): Promise<NoteSuggestionDto> {
    const event = LoggingUtilities.request.branch(logContext, "SERVICE", "Create note suggestion");
    const row = await this.db.insert<ITB_SUGGESTION_NOTE>(
      SUGGESTION_NOTE_TABLE,
      {
        country: body.country,
        title: body.title,
        url: body.url,
        category: body.category,
        mandatory: body.mandatory ? 1 : 0,
        min_days_before_arrival: body.minDaysBeforeArrival,
        max_advance_hours: body.maxAdvanceHours,
        notes: body.notes,
        record_status: RecordStatus.ACTIVE,
        created_dt: Date.now(),
      },
      event,
    );
    return toNoteDto(row);
  }

  async deleteNote(id: number, logContext?: IRequestLogContext): Promise<SuggestionDeletedDto> {
    const event = LoggingUtilities.request.branch(logContext, "SERVICE", "Delete note suggestion");
    await this.db.update<ITB_SUGGESTION_NOTE>(
      SUGGESTION_NOTE_TABLE,
      { id },
      { record_status: RecordStatus.DELETED },
      event,
    );
    return { deleted: true };
  }
}
