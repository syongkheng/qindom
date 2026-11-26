import crypto from "crypto";
import KnexSqlUtilities from "../utils/KnexSqlUtilities.js";
import { ITB_HOUSE_LAYOUT } from "../models/databases/tb_house_layout.js";
import { IRequestLogContext, IRequestLogEvent } from "../models/IRequestLogContext.js";
import { Exceptions } from "../exceptions/AppExceptions.js";
import { RecordStatus } from "../constants/RecordStatus.js";
import { LoggingUtilities } from "../utils/logging/LoggingUtilities.js";
import {
  HouseDeletedDto,
  HouseLayoutBody,
  HouseLayoutDto,
  HouseLayoutListDto,
  HouseLayoutSummaryDto,
  HouseLayoutUpdateBody,
} from "./House.types.js";

const HOUSE_LAYOUT_TABLE = "tb_house_layout";
const MAX_LAYOUTS_PER_USER = 30;
const SUMMARY_COLUMNS = ["uuid", "name", "item_count", "created_dt", "updated_dt"] as const;

function toSummaryDto(row: Pick<ITB_HOUSE_LAYOUT, (typeof SUMMARY_COLUMNS)[number]>): HouseLayoutSummaryDto {
  return {
    id: row.uuid,
    name: row.name,
    itemCount: row.item_count,
    // BIGINT columns can come back as strings.
    createdAt: Number(row.created_dt),
    updatedAt: Number(row.updated_dt ?? row.created_dt),
  };
}

/** Saved house-planner layouts (the planner itself works logged out via localStorage). Owner-scoped; uuid is the public id. */
export class HouseLayoutService {
  constructor(private db: KnexSqlUtilities) {}

  /** Summaries only, newest first; the layout body is fetched on demand. */
  async list(userId: number, logContext?: IRequestLogContext): Promise<HouseLayoutListDto> {
    const event = LoggingUtilities.request.branch(logContext, "SERVICE", "List layouts");
    const rows = await this.db.find<ITB_HOUSE_LAYOUT>(
      HOUSE_LAYOUT_TABLE,
      { created_by_id: userId, record_status: RecordStatus.ACTIVE },
      { columns: SUMMARY_COLUMNS },
      event,
    );
    return { layouts: rows.map(toSummaryDto).sort((a, b) => b.updatedAt - a.updatedAt) };
  }

  async get(userId: number, uuid: string, logContext?: IRequestLogContext): Promise<HouseLayoutDto> {
    const event = LoggingUtilities.request.branch(logContext, "SERVICE", "Get layout");
    const row = await this.loadOrThrow(userId, uuid, event);
    return { ...toSummaryDto(row), data: JSON.parse(row.data) };
  }

  async create(userId: number, body: HouseLayoutBody, logContext?: IRequestLogContext): Promise<HouseLayoutSummaryDto> {
    const event = LoggingUtilities.request.branch(logContext, "SERVICE", "Create layout");
    const count = await this.db.count<ITB_HOUSE_LAYOUT>(
      HOUSE_LAYOUT_TABLE,
      { created_by_id: userId, record_status: RecordStatus.ACTIVE },
      event,
    );
    if (count >= MAX_LAYOUTS_PER_USER) throw new Exceptions.InvalidRequest("layouts", "limit");

    const row = await this.db.insert<ITB_HOUSE_LAYOUT>(
      HOUSE_LAYOUT_TABLE,
      {
        uuid: crypto.randomUUID(),
        name: body.name,
        data: body.dataJson,
        item_count: body.itemCount,
        record_status: RecordStatus.ACTIVE,
        created_dt: Date.now(),
        created_by_id: userId,
      },
      event,
    );
    return toSummaryDto(row);
  }

  async update(
    userId: number,
    uuid: string,
    body: HouseLayoutUpdateBody,
    logContext?: IRequestLogContext,
  ): Promise<HouseLayoutSummaryDto> {
    const event = LoggingUtilities.request.branch(logContext, "SERVICE", "Update layout");
    await this.loadOrThrow(userId, uuid, event);
    const patch: Partial<ITB_HOUSE_LAYOUT> = { updated_dt: Date.now(), updated_by_id: userId };
    if (body.name !== undefined) patch.name = body.name;
    if (body.dataJson !== undefined) {
      patch.data = body.dataJson;
      patch.item_count = body.itemCount;
    }
    const [updated] = await this.db.update<ITB_HOUSE_LAYOUT>(
      HOUSE_LAYOUT_TABLE,
      { uuid, created_by_id: userId },
      patch,
      event,
    );
    return toSummaryDto(updated);
  }

  async delete(userId: number, uuid: string, logContext?: IRequestLogContext): Promise<HouseDeletedDto> {
    const event = LoggingUtilities.request.branch(logContext, "SERVICE", "Delete layout");
    await this.loadOrThrow(userId, uuid, event);
    await this.db.update<ITB_HOUSE_LAYOUT>(
      HOUSE_LAYOUT_TABLE,
      { uuid, created_by_id: userId },
      { record_status: RecordStatus.DELETED, updated_dt: Date.now(), updated_by_id: userId },
      event,
    );
    return { deleted: true };
  }

  private async loadOrThrow(userId: number, uuid: string, event?: IRequestLogEvent): Promise<ITB_HOUSE_LAYOUT> {
    const row = await this.db.findOne<ITB_HOUSE_LAYOUT>(
      HOUSE_LAYOUT_TABLE,
      { uuid, created_by_id: userId, record_status: RecordStatus.ACTIVE },
      ["*"],
      event,
    );
    if (!row) throw new Exceptions.NotFound("Layout not found");
    return row;
  }
}
