import KnexSqlUtilities from "../utils/KnexSqlUtilities.js";
import { ITB_AA_USER } from "../models/databases/tb_aa_user.js";
import { IRequestLogContext } from "../models/IRequestLogContext.js";
import { RecentRequestLogDto, RequestLogMatchDto } from "../utils/logging/RequestLog.types.js";
import { Exceptions } from "../exceptions/AppExceptions.js";
import { RecordStatus } from "../constants/RecordStatus.js";
import { LoggingUtilities } from "../utils/logging/LoggingUtilities.js";
import { RequestLogSearch } from "../utils/logging/RequestLogSearch.js";
import { parseRoles } from "./Permission.js";
import { AA_USER_TABLE } from "./AuthSession.service.js";
import { AuthAdminUserDto, AuthUpdatedDto } from "./Auth.types.js";

const ADMIN_USER_COLUMNS = ["id", "username", "email", "system", "roles", "state", "last_logged_in_dt", "created_dt"];

export function toAdminUserDto(user: ITB_AA_USER): AuthAdminUserDto {
  return {
    id: user.id!,
    username: user.username,
    email: user.email ?? null,
    system: user.system,
    roles: parseRoles(user.roles),
    state: user.state,
    lastLoggedInDt: user.last_logged_in_dt ?? null,
    createdDt: user.created_dt,
  };
}

function toRecentRequestLogDto({ requestId, timestamp, method, path, statusCode }: RequestLogMatchDto) {
  return { requestId, timestamp, method, path, statusCode } satisfies RecentRequestLogDto;
}

/** OWNER-only user management and request-log search. The controller enforces the role. */
export class AuthAdminService {
  constructor(private db: KnexSqlUtilities) {}

  async listUsers(logContext?: IRequestLogContext): Promise<AuthAdminUserDto[]> {
    const event = LoggingUtilities.request.branch(logContext, "SERVICE", "List users");
    const rows = await this.db.find<ITB_AA_USER>(
      AA_USER_TABLE,
      { record_status: RecordStatus.ACTIVE },
      { columns: ADMIN_USER_COLUMNS, orderBy: "created_dt", orderDirection: "asc" },
      event,
    );
    if (event) event.detail = `${rows.length} users`;
    return rows.map(toAdminUserDto);
  }

  async updateUserRoles(userId: number, roles: string[], logContext?: IRequestLogContext): Promise<AuthUpdatedDto> {
    const event = LoggingUtilities.request.branch(logContext, "SERVICE", "Update user roles");
    await this.db.update<ITB_AA_USER>(AA_USER_TABLE, { id: userId }, { roles: JSON.stringify(roles) }, event);
    return { updated: true };
  }

  /** Newest `limit` requests overall (summary fields only, for the dashboard widget). */
  recentRequestLogs(limit: number): RecentRequestLogDto[] {
    return RequestLogSearch.recent(limit).map(toRecentRequestLogDto);
  }

  /** Every logged entry for one request id; 404 when the log files have none. */
  findRequestLogs(requestId: string): RequestLogMatchDto[] {
    const matches = RequestLogSearch.find(requestId);
    if (!matches.length) throw new Exceptions.NotFound("No log entries found for that Request ID");
    return matches;
  }
}
