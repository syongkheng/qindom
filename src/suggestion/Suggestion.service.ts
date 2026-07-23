import KnexSqlUtilities from "../utils/KnexSqlUtilities.js";
import { IRequestLogEvent } from "../models/IRequestLogContext.js";
import { ITb_suggestion_activity } from "../models/databases/tb_suggestion_activity.js";
import { ITb_suggestion_packing } from "../models/databases/tb_suggestion_packing.js";

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

  async createActivity(
    data: { destinationTag: string; title: string; category?: string; estimatedHours?: number; description?: string },
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
        record_status: "A",
        created_dt: Date.now(),
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
}
