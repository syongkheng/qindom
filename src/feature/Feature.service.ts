import KnexSqlUtilities from '../utils/KnexSqlUtilities'
import { ITB_AA_FEATURE_FLAG } from '../models/databases/tb_aa_feature_flag'

const TABLE = 'tb_aa_feature_flag'

export interface FlagDto {
  id: number
  key: string
  label: string
  isEnabled: boolean
  remarks: string | null
  updatedDt: number | null
  updatedBy: string | null
  createdDt: number
  createdBy: string
}

export class FeatureService {
  constructor(private db: KnexSqlUtilities) {}

  private mapFlag(f: ITB_AA_FEATURE_FLAG): FlagDto {
    return {
      id:        f.id!,
      key:       f.feature_key,
      label:     f.label,
      isEnabled: f.is_enabled === 1,
      remarks:   f.remarks ?? null,
      updatedDt: f.updated_dt ?? null,
      updatedBy: f.updated_by ?? null,
      createdDt: f.created_dt,
      createdBy: f.created_by,
    }
  }

  /** Returns all active feature flags as a flat key→boolean map (public use) */
  async getAllFlags(): Promise<Record<string, boolean>> {
    const flags = await this.db.find<ITB_AA_FEATURE_FLAG>(TABLE, { record_status: 'A' })
    return Object.fromEntries(flags.map((f) => [f.feature_key, f.is_enabled === 1]))
  }

  /** Returns full flag data for admin dashboard */
  async getAllFlagsAdmin(): Promise<FlagDto[]> {
    const flags = await this.db.find<ITB_AA_FEATURE_FLAG>(TABLE, { record_status: 'A' }, {
      orderBy: 'created_dt',
      orderDirection: 'asc',
    })
    return flags.map(this.mapFlag.bind(this))
  }

  /** Creates a new flag, disabled by default */
  async createFlag(data: { key: string; label: string; remarks?: string | null }, createdBy: string): Promise<FlagDto> {
    const inserted = await this.db.insert<ITB_AA_FEATURE_FLAG>(TABLE, {
      feature_key:   data.key,
      label:         data.label,
      is_enabled:    0,
      remarks:       data.remarks ?? null,
      created_dt:    Date.now(),
      created_by:    createdBy,
      record_status: 'A',
    }) as ITB_AA_FEATURE_FLAG
    return this.mapFlag(inserted)
  }

  /** Updates label and/or remarks for an existing flag */
  async updateFlag(key: string, data: { label?: string; remarks?: string | null }, updatedBy: string): Promise<void> {
    await this.db.update<ITB_AA_FEATURE_FLAG>(
      TABLE,
      { feature_key: key },
      { ...data, updated_dt: Date.now(), updated_by: updatedBy }
    )
  }

  /** Flips is_enabled for the given feature_key. Creates the flag (enabled) if it does not yet exist. */
  async toggleFlag(key: string, updatedBy: string): Promise<{ feature_key: string; is_enabled: boolean }> {
    const [flag] = await this.db.find<ITB_AA_FEATURE_FLAG>(TABLE, { feature_key: key, record_status: 'A' })

    if (!flag) {
      await this.db.insert<ITB_AA_FEATURE_FLAG>(TABLE, {
        feature_key:   key,
        label:         key,
        is_enabled:    1,
        created_dt:    Date.now(),
        created_by:    updatedBy,
        record_status: 'A',
      })
      return { feature_key: key, is_enabled: true }
    }

    const newValue = flag.is_enabled === 1 ? 0 : 1
    await this.db.update<ITB_AA_FEATURE_FLAG>(
      TABLE,
      { feature_key: key },
      { is_enabled: newValue, updated_dt: Date.now(), updated_by: updatedBy }
    )

    return { feature_key: key, is_enabled: newValue === 1 }
  }
}
