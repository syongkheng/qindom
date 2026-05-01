import KnexSqlUtilities from "../utils/KnexSqlUtilities";
import { ITB_SCENIC_SPOT } from "../models/databases/tb_scenic_spot";
import { ITB_SCENIC_CHECKLIST } from "../models/databases/tb_scenic_checklist";

const TB_SCENIC_SPOT = "tb_scenic_spot";
const TB_SCENIC_CHECKLIST = "tb_scenic_checklist";

export interface ScenicSpotDto {
  id: number;
  nameZh: string;
  nameEn: string;
  province: string;
  city: string;
  provinceEn: string;
  cityEn: string;
  sortOrder: number;
}

export interface ScenicCheckDto {
  scenicId: number;
  visited: boolean;
}

export class ScenicService {
  constructor(private db: KnexSqlUtilities) {}

  // ─── Mappers ─────────────────────────────────────────────────────────────────

  private mapSpot(row: ITB_SCENIC_SPOT): ScenicSpotDto {
    return {
      id:         row.id!,
      nameZh:     row.name_zh,
      nameEn:     row.name_en,
      province:   row.province,
      city:       row.city,
      provinceEn: row.province_en,
      cityEn:     row.city_en,
      sortOrder:  row.sort_order,
    };
  }

  private mapCheck(row: ITB_SCENIC_CHECKLIST): ScenicCheckDto {
    return {
      scenicId: row.scenic_id,
      visited:  row.visited === 1,
    };
  }

  // ─── Methods ──────────────────────────────────────────────────────────────────

  async getAll(): Promise<ScenicSpotDto[]> {
    const rows = await this.db.find<ITB_SCENIC_SPOT>(
      TB_SCENIC_SPOT,
      { record_status: "A" },
      {
        orderBy: "province_en",
        orderDirection: "asc",
        extraWhere: (qb: any) => qb.orderBy("sort_order", "asc"),
      }
    );
    return rows.map((r) => this.mapSpot(r));
  }

  async getUserChecklist(username: string): Promise<ScenicCheckDto[]> {
    const rows = await this.db.find<ITB_SCENIC_CHECKLIST>(
      TB_SCENIC_CHECKLIST,
      { username, record_status: "A" }
    );
    return rows.map((r) => this.mapCheck(r));
  }

  async upsertCheck(username: string, scenicId: number, visited: boolean): Promise<void> {
    const now = Date.now();
    await this.db.raw(
      `INSERT INTO ${TB_SCENIC_CHECKLIST} (username, scenic_id, visited, created_dt, updated_dt, record_status)
       VALUES (?, ?, ?, ?, ?, 'A')
       ON DUPLICATE KEY UPDATE visited = VALUES(visited), updated_dt = VALUES(updated_dt)`,
      [username, scenicId, visited ? 1 : 0, now, now]
    );
  }
}
