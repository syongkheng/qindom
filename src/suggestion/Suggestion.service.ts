import KnexSqlUtilities from "../utils/KnexSqlUtilities.js";
import { IRequestLogEvent } from "../models/IRequestLogContext.js";
import { ITb_suggestion_activity } from "../models/databases/tb_suggestion_activity.js";
import { ITb_suggestion_packing } from "../models/databases/tb_suggestion_packing.js";
import { ITb_suggestion_note } from "../models/databases/tb_suggestion_note.js";
import { ITb_suggestion_place } from "../models/databases/tb_suggestion_place.js";

export class SuggestionService {
  constructor(private readonly db: KnexSqlUtilities) {}

  async searchActivities(destination: string, logEvent?: IRequestLogEvent): Promise<ITb_suggestion_activity[]> {
    return this.db.find<ITb_suggestion_activity>(
      "tb_suggestion_activity",
      { record_status: "A" } as any,
      {
        extraWhere: (q) => q.whereRaw("LOWER(destination_tag) LIKE ?", [`%${destination.toLowerCase()}%`]),
        orderBy: "id",
      },
      logEvent,
    );
  }

  async getAllActivitiesAdmin(logEvent?: IRequestLogEvent): Promise<ITb_suggestion_activity[]> {
    return this.db.find<ITb_suggestion_activity>(
      "tb_suggestion_activity",
      { record_status: "A" } as any,
      { orderBy: "destination_tag" },
      logEvent,
    );
  }

  async createActivity(
    data: { destinationTag: string; title: string; category?: string; estimatedHours?: number; description?: string; images?: string[] },
    logEvent?: IRequestLogEvent,
  ): Promise<ITb_suggestion_activity> {
    return this.db.insert<Partial<ITb_suggestion_activity>, ITb_suggestion_activity>(
      "tb_suggestion_activity",
      {
        destination_tag: data.destinationTag,
        title: data.title,
        category: data.category ?? null,
        estimated_hours: data.estimatedHours ?? null,
        description: data.description ?? null,
        images_json: data.images?.length ? JSON.stringify(data.images) : null,
        record_status: "A",
        created_dt: Date.now(),
      },
      logEvent,
    );
  }

  async updateActivity(
    id: number,
    data: { destinationTag?: string; title?: string; category?: string; estimatedHours?: number; description?: string; images?: string[] },
    logEvent?: IRequestLogEvent,
  ): Promise<void> {
    await this.db.update<Partial<ITb_suggestion_activity>>(
      "tb_suggestion_activity",
      { id },
      {
        destination_tag: data.destinationTag,
        title: data.title,
        category: data.category ?? null,
        estimated_hours: data.estimatedHours ?? null,
        description: data.description ?? null,
        images_json: data.images?.length ? JSON.stringify(data.images) : null,
      },
      logEvent,
    );
  }

  async deleteActivity(id: number, logEvent?: IRequestLogEvent): Promise<void> {
    await this.db.update<any>(
      "tb_suggestion_activity",
      { id },
      { record_status: "D" },
      logEvent,
    );
  }

  // ── Places (curated) — merged with live Overpass results in
  // src/places/Places.service.ts. Same fuzzy-match convention as activities.
  async getPlacesByDestination(destination: string, logEvent?: IRequestLogEvent): Promise<ITb_suggestion_place[]> {
    return this.db.find<ITb_suggestion_place>(
      "tb_suggestion_place",
      { record_status: "A" } as any,
      {
        extraWhere: (q) => q.whereRaw("LOWER(destination_tag) LIKE ?", [`%${destination.toLowerCase()}%`]),
        orderBy: "id",
      },
      logEvent,
    );
  }

  async getAllPlacesAdmin(logEvent?: IRequestLogEvent): Promise<ITb_suggestion_place[]> {
    return this.db.find<ITb_suggestion_place>(
      "tb_suggestion_place",
      { record_status: "A" } as any,
      { orderBy: "destination_tag" },
      logEvent,
    );
  }

  async createPlace(
    data: { destinationTag: string; title: string; category?: string; description?: string; images?: string[]; lat: number; lng: number },
    logEvent?: IRequestLogEvent,
  ): Promise<ITb_suggestion_place> {
    return this.db.insert<Partial<ITb_suggestion_place>, ITb_suggestion_place>(
      "tb_suggestion_place",
      {
        destination_tag: data.destinationTag,
        title: data.title,
        category: data.category ?? null,
        description: data.description ?? null,
        images_json: data.images?.length ? JSON.stringify(data.images) : null,
        lat: data.lat,
        lng: data.lng,
        record_status: "A",
        created_dt: Date.now(),
      },
      logEvent,
    );
  }

  async updatePlace(
    id: number,
    data: { destinationTag?: string; title?: string; category?: string; description?: string; images?: string[]; lat?: number; lng?: number },
    logEvent?: IRequestLogEvent,
  ): Promise<void> {
    await this.db.update<Partial<ITb_suggestion_place>>(
      "tb_suggestion_place",
      { id },
      {
        destination_tag: data.destinationTag,
        title: data.title,
        category: data.category ?? null,
        description: data.description ?? null,
        images_json: data.images?.length ? JSON.stringify(data.images) : null,
        lat: data.lat,
        lng: data.lng,
      },
      logEvent,
    );
  }

  async deletePlace(id: number, logEvent?: IRequestLogEvent): Promise<void> {
    await this.db.update<any>(
      "tb_suggestion_place",
      { id },
      { record_status: "D" },
      logEvent,
    );
  }

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
