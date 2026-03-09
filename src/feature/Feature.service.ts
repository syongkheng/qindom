import KnexSqlUtilities from '../utils/KnexSqlUtilities'
import { ITB_AA_FEATURE_FLAG } from '../models/databases/tb_aa_feature_flag'
import { EntityNotFoundException } from '../exceptions/EntityNotFoundException'

const TABLE = 'tb_aa_feature_flag'

export class FeatureService {
  constructor(private db: KnexSqlUtilities) {}

  /** Returns all active feature flags as a flat key→boolean map */
  async getAllFlags(): Promise<Record<string, boolean>> {
    const flags = await this.db.find<ITB_AA_FEATURE_FLAG>(TABLE, { record_status: 'A' })
    return Object.fromEntries(flags.map((f) => [f.feature_key, f.is_enabled === 1]))
  }

  /** Flips is_enabled for the given feature_key. Throws if key not found. */
  async toggleFlag(key: string, updatedBy: string): Promise<{ feature_key: string; is_enabled: boolean }> {
    const [flag] = await this.db.find<ITB_AA_FEATURE_FLAG>(TABLE, { feature_key: key, record_status: 'A' })
    if (!flag) throw new EntityNotFoundException()

    const newValue = flag.is_enabled === 1 ? 0 : 1
    await this.db.update<ITB_AA_FEATURE_FLAG>(
      TABLE,
      { feature_key: key },
      { is_enabled: newValue, updated_dt: Date.now(), updated_by: updatedBy }
    )

    return { feature_key: key, is_enabled: newValue === 1 }
  }
}
