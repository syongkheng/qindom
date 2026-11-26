import crypto from "crypto";
import KnexSqlUtilities from "../utils/KnexSqlUtilities.js";
import { ITB_HOUSE_SHARE } from "../models/databases/tb_house_share.js";
import { IRequestLogContext } from "../models/IRequestLogContext.js";
import { Exceptions } from "../exceptions/AppExceptions.js";
import { RecordStatus } from "../constants/RecordStatus.js";
import { LoggingUtilities } from "../utils/logging/LoggingUtilities.js";
import {
  HouseDeletedDto,
  HouseLayoutBody,
  HouseShareListDto,
  HouseShareSummaryDto,
  HouseShareViewDto,
} from "./House.types.js";

const HOUSE_SHARE_TABLE = "tb_house_share";
const MAX_SHARES_PER_USER = 20;
const SUMMARY_COLUMNS = ["token", "name", "item_count", "created_dt"] as const;

function toSummaryDto(row: Pick<ITB_HOUSE_SHARE, (typeof SUMMARY_COLUMNS)[number]>): HouseShareSummaryDto {
  return { token: row.token, name: row.name, itemCount: row.item_count, createdAt: Number(row.created_dt) };
}

/** Read-only snapshot links of a layout. Created/listed/revoked by the owner; viewed publicly by token. */
export class HouseShareService {
  constructor(private db: KnexSqlUtilities) {}

  async list(userId: number, logContext?: IRequestLogContext): Promise<HouseShareListDto> {
    const event = LoggingUtilities.request.branch(logContext, "SERVICE", "List share links");
    const rows = await this.db.find<ITB_HOUSE_SHARE>(
      HOUSE_SHARE_TABLE,
      { created_by_id: userId, record_status: RecordStatus.ACTIVE },
      { columns: SUMMARY_COLUMNS, orderBy: "created_dt", orderDirection: "desc" },
      event,
    );
    return { shares: rows.map(toSummaryDto) };
  }

  /** Stores a copy of the layout: later edits to the saved layout don't change the link. */
  async create(userId: number, body: HouseLayoutBody, logContext?: IRequestLogContext): Promise<HouseShareSummaryDto> {
    const event = LoggingUtilities.request.branch(logContext, "SERVICE", "Create share link");
    const count = await this.db.count<ITB_HOUSE_SHARE>(
      HOUSE_SHARE_TABLE,
      { created_by_id: userId, record_status: RecordStatus.ACTIVE },
      event,
    );
    if (count >= MAX_SHARES_PER_USER) throw new Exceptions.InvalidRequest("shares", "limit");

    const row = await this.db.insert<ITB_HOUSE_SHARE>(
      HOUSE_SHARE_TABLE,
      {
        token: crypto.randomUUID(),
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

  /** Public read by token: name, snapshot and date only, never who made it. */
  async view(token: string, logContext?: IRequestLogContext): Promise<HouseShareViewDto> {
    const event = LoggingUtilities.request.branch(logContext, "SERVICE", "View shared house");
    const row = await this.db.findOne<ITB_HOUSE_SHARE>(
      HOUSE_SHARE_TABLE,
      { token, record_status: RecordStatus.ACTIVE },
      ["name", "created_dt", "data"],
      event,
    );
    if (!row) throw new Exceptions.NotFound("Share link not found");
    return { name: row.name, createdAt: Number(row.created_dt), data: JSON.parse(row.data) };
  }

  /** Owner-only soft delete; the link stops working immediately. */
  async revoke(userId: number, token: string, logContext?: IRequestLogContext): Promise<HouseDeletedDto> {
    const event = LoggingUtilities.request.branch(logContext, "SERVICE", "Revoke share link");
    const owned = { token, created_by_id: userId, record_status: RecordStatus.ACTIVE };
    const row = await this.db.findOne<ITB_HOUSE_SHARE>(HOUSE_SHARE_TABLE, owned, ["id"], event);
    if (!row) throw new Exceptions.NotFound("Share link not found");
    await this.db.update<ITB_HOUSE_SHARE>(HOUSE_SHARE_TABLE, owned, { record_status: RecordStatus.DELETED }, event);
    return { deleted: true };
  }
}
