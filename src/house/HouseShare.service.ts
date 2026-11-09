import crypto from "crypto";
import KnexSqlUtilities from "../utils/KnexSqlUtilities.js";
import { ITB_HOUSE_SHARE } from "../models/databases/tb_house_share.js";
import { Exceptions } from "../exceptions/AppExceptions.js";
import { CreateLayoutInput } from "./HouseLayout.validator.js";

const TB_HOUSE_SHARE = "tb_house_share";
export const SHARE_MAX_PER_USER = 20;

const summary = (row: ITB_HOUSE_SHARE) => ({
  token: row.token,
  name: row.name,
  itemCount: row.item_count,
  createdAt: Number(row.created_dt),
});

export class HouseShareService {
  constructor(private db: KnexSqlUtilities) {}

  async list(userId: number): Promise<{ shares: any[] }> {
    const rows = await this.db.find<ITB_HOUSE_SHARE>(
      TB_HOUSE_SHARE,
      { created_by_id: userId, record_status: "A" },
      { columns: ["token", "name", "item_count", "created_dt"] },
    );
    return { shares: rows.map(summary).sort((a, b) => b.createdAt - a.createdAt) };
  }

  async create(userId: number, input: CreateLayoutInput): Promise<any> {
    const count = await this.db.count<ITB_HOUSE_SHARE>(TB_HOUSE_SHARE, { created_by_id: userId, record_status: "A" });
    if (count >= SHARE_MAX_PER_USER) throw new Exceptions.InvalidRequest("share limit reached");
    const row = await this.db.insert<ITB_HOUSE_SHARE>(TB_HOUSE_SHARE, {
      token: crypto.randomUUID(),
      name: input.name,
      data: input.json,
      item_count: input.itemCount,
      record_status: "A",
      created_dt: Date.now(),
      created_by_id: userId,
    });
    return summary(row);
  }

  /** Public read by token: the name, the snapshot and the date only — never who made it. */
  async view(token: string): Promise<any> {
    const row = (await this.db.findOne<ITB_HOUSE_SHARE>(TB_HOUSE_SHARE, { token, record_status: "A" })) as ITB_HOUSE_SHARE | undefined;
    if (!row) throw new Exceptions.NotFound();
    return { name: row.name, createdAt: Number(row.created_dt), data: JSON.parse(row.data) };
  }

  async revoke(userId: number, token: string): Promise<{ deleted: true }> {
    const row = (await this.db.findOne<ITB_HOUSE_SHARE>(TB_HOUSE_SHARE, { token, created_by_id: userId, record_status: "A" })) as ITB_HOUSE_SHARE | undefined;
    if (!row) throw new Exceptions.NotFound();
    await this.db.update<ITB_HOUSE_SHARE>(TB_HOUSE_SHARE, { token, created_by_id: userId }, { record_status: "D" });
    return { deleted: true };
  }
}
