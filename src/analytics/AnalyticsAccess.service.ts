import KnexSqlUtilities from "../utils/KnexSqlUtilities.js";
import { LoggingUtilities } from "../utils/logging/LoggingUtilities.js";
import { Exceptions } from "../exceptions/AppExceptions.js";
import { IRequestLogContext } from "../models/IRequestLogContext.js";
import { IDecodedTokenUser } from "../token/Token.types.js";
import { ITB_AA_USER } from "../models/databases/tb_aa_user.js";
import { RecordStatus } from "../constants/RecordStatus.js";
import { PermissionService, ResourceType, userIsOwner } from "../auth/Permission.js";
import { AnalyticsSystemService, toSystemDto } from "./AnalyticsSystem.service.js";
import { AnalyticsGrantDto, AnalyticsSystemDto, RegisteredSystem } from "./Analytics.types.js";

const USER_TABLE = "tb_aa_user";
/** Accounts that shared viewers log in with (awense.com). */
const VIEWER_ACCOUNT_SYSTEM = "fnd";
const NO_VIEWER_ACCOUNT = "No awense.com account with that username";

/**
 * Who may view which analytics system. OWNER (SYSTEM_R5) sees every active system; anyone else needs a
 * resource grant (tb_aa_resource_access via PermissionService). Grants never confer roles.
 */
export class AnalyticsAccessService {
  constructor(
    private db: KnexSqlUtilities,
    private systems: AnalyticsSystemService,
    private permissions: PermissionService = new PermissionService(db),
  ) {}

  /** `GET /analytics/systems`: active systems the user may view, in registry order. */
  async visibleSystems(user: IDecodedTokenUser, logContext?: IRequestLogContext): Promise<AnalyticsSystemDto[]> {
    const active = await this.systems.listActive(logContext);
    if (userIsOwner(user)) return active.map(toSystemDto);
    const event = LoggingUtilities.request.branch(logContext, "SERVICE", "Analytics grants of user");
    const keys = await this.permissions.grantedKeys(user.id, ResourceType.ANALYTICS_SYSTEM);
    if (event) event.detail = `${keys.length} grants`;
    return active.filter((s) => keys.includes(s.key)).map(toSystemDto);
  }

  /** The system's dashboard, or 403. The same 403 for "doesn't exist" and "not yours", so keys can't be probed. */
  async viewableSystem(
    user: IDecodedTokenUser,
    key: string,
    logContext?: IRequestLogContext,
  ): Promise<RegisteredSystem> {
    const allowed = await this.permissions.canAccessResource(user, ResourceType.ANALYTICS_SYSTEM, key);
    const system = allowed ? await this.systems.getActive(key, logContext) : undefined;
    if (!system) throw new Exceptions.ForbiddenAccess();
    return system;
  }

  listGrants(key: string): Promise<AnalyticsGrantDto[]> {
    return this.permissions.listGrants(ResourceType.ANALYTICS_SYSTEM, key);
  }

  /** 404 unless a system with this key exists (active or disabled). */
  async requireSystem(key: string, logContext?: IRequestLogContext): Promise<void> {
    if (!(await this.systems.exists(key, logContext))) throw new Exceptions.NotFound();
  }

  /**
   * Grants an awense.com account viewer access to one system (idempotent). Call `requireSystem` first.
   * No active `fnd` account with that username → 404.
   */
  async grant(
    key: string,
    username: string,
    grantedById: number,
    logContext?: IRequestLogContext,
  ): Promise<AnalyticsGrantDto[]> {
    const event = LoggingUtilities.request.branch(logContext, "SERVICE", "Grant analytics access", key);
    const target = await this.db.findOne<ITB_AA_USER>(
      USER_TABLE,
      { username_system: `${username}_${VIEWER_ACCOUNT_SYSTEM}`, record_status: RecordStatus.ACTIVE },
      ["id"],
      event,
    );
    if (!target?.id) throw new Exceptions.NotFound(NO_VIEWER_ACCOUNT);
    await this.permissions.grant(ResourceType.ANALYTICS_SYSTEM, key, target.id, grantedById);
    return this.listGrants(key);
  }

  /** Soft revoke; revoking a grant that doesn't exist is a no-op. */
  async revoke(key: string, userId: number): Promise<AnalyticsGrantDto[]> {
    await this.permissions.revoke(ResourceType.ANALYTICS_SYSTEM, key, userId);
    return this.listGrants(key);
  }
}
