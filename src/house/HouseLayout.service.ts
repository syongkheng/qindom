import crypto from "crypto";
import KnexSqlUtilities from "../utils/KnexSqlUtilities.js";
import { ITB_HOUSE_LAYOUT } from "../models/databases/tb_house_layout.js";
import { Exceptions } from "../exceptions/AppExceptions.js";
import { CreateLayoutInput, UpdateLayoutInput } from "./HouseLayout.validator.js";

const TB_HOUSE_LAYOUT = "tb_house_layout";
export const LAYOUT_MAX_PER_USER = 30;

function buildSummary(row: ITB_HOUSE_LAYOUT) {
  return {
    id: row.uuid,
    name: row.name,
    itemCount: row.item_count,
    createdAt: Number(row.created_dt),
    updatedAt: Number(row.updated_dt ?? row.created_dt),
  };
}

function buildResponse(row: ITB_HOUSE_LAYOUT) {
  return { ...buildSummary(row), data: JSON.parse(row.data) };
}

export class HouseLayoutService {
  constructor(private db: KnexSqlUtilities) {}

  private async loadOrThrow(userId: number, uuid: string): Promise<ITB_HOUSE_LAYOUT> {
    const row = (await this.db.findOne<ITB_HOUSE_LAYOUT>(TB_HOUSE_LAYOUT, {
      uuid,
      created_by_id: userId,
      record_status: "A",
    })) as ITB_HOUSE_LAYOUT | undefined;
    if (!row) throw new Exceptions.NotFound();
    return row;
  }

  // Summaries only: the (up to 1 MB) layout body is fetched on demand.
  async list(userId: number): Promise<{ layouts: any[] }> {
    const rows = await this.db.find<ITB_HOUSE_LAYOUT>(
      TB_HOUSE_LAYOUT,
      { created_by_id: userId, record_status: "A" },
      { columns: ["uuid", "name", "item_count", "created_dt", "updated_dt"] },
    );
    const layouts = rows.map(buildSummary).sort((a, b) => b.updatedAt - a.updatedAt);
    return { layouts };
  }

  async get(userId: number, uuid: string): Promise<any> {
    return buildResponse(await this.loadOrThrow(userId, uuid));
  }

  async create(userId: number, input: CreateLayoutInput): Promise<any> {
    const count = await this.db.count<ITB_HOUSE_LAYOUT>(TB_HOUSE_LAYOUT, { created_by_id: userId, record_status: "A" });
    if (count >= LAYOUT_MAX_PER_USER) throw new Exceptions.InvalidRequest("layout limit reached");
    const row = await this.db.insert<ITB_HOUSE_LAYOUT>(TB_HOUSE_LAYOUT, {
      uuid: crypto.randomUUID(),
      name: input.name,
      data: input.json,
      item_count: input.itemCount,
      record_status: "A",
      created_dt: Date.now(),
      created_by_id: userId,
    });
    return buildSummary(row);
  }

  async update(userId: number, uuid: string, input: UpdateLayoutInput): Promise<any> {
    await this.loadOrThrow(userId, uuid);
    const patch: Partial<ITB_HOUSE_LAYOUT> = { updated_dt: Date.now(), updated_by_id: userId };
    if (input.name !== undefined) patch.name = input.name;
    if (input.json !== undefined) {
      patch.data = input.json;
      patch.item_count = input.itemCount;
    }
    const [updated] = await this.db.update<ITB_HOUSE_LAYOUT>(TB_HOUSE_LAYOUT, { uuid, created_by_id: userId }, patch);
    return buildSummary(updated);
  }

  async delete(userId: number, uuid: string): Promise<{ deleted: true }> {
    await this.loadOrThrow(userId, uuid);
    await this.db.update<ITB_HOUSE_LAYOUT>(
      TB_HOUSE_LAYOUT,
      { uuid, created_by_id: userId },
      { record_status: "D", updated_dt: Date.now(), updated_by_id: userId },
    );
    return { deleted: true };
  }
}
