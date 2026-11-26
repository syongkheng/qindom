import { NextFunction, Request, Response } from "express";
import { LoggingUtilities } from "../utils/logging/LoggingUtilities.js";
import { ControllerResponse } from "../models/responses/ControllerResponse.js";
import { handleException } from "../utils/RequestUtilities.js";
import db from "../config/db/mysql.js";
import { LogEmoji } from "../constants/LogEmoji.js";
import { RecordStatus } from "../constants/RecordStatus.js";
import { sha256Hex } from "../utils/HashUtilities.js";
import { IRequestLogEvent } from "../models/IRequestLogContext.js";
import { ITB_SS_API_KEY } from "../models/databases/tb_ss_api_key.js";
import { ITB_AA_USER } from "../models/databases/tb_aa_user.js";

export type ApiKeyPrefix = "ss";

const API_KEY_HEADER = "x-api-key";
/**
 * Keys look like `<prefix>_<hex>` (hex never contains `_`): exactly one separator, so
 * `ss_<key>_anything` is an invalid key (user decision M4), not `ss_<key>`.
 */
const KEY_SEPARATOR = "_";
const KEY_SEGMENTS = 2;
const USER_TABLE = "tb_aa_user";
/** Where each key type is stored. Every allowed prefix is looked up; there is no unchecked prefix. */
const API_KEY_TABLES: Record<ApiKeyPrefix, string> = { ss: "tb_ss_api_key" };
/**
 * Shortcuts / Scriptable contract: any failure is this plain-string 401 (`{code:401,status:"Ko",data}`),
 * not the registry error shape.
 */
const INVALID_API_KEY_MESSAGE = "Unauthorized. Missing or invalid API key.";
const LOOKUP_FAILED_MESSAGE = "Failed to check the API key. Please try again later.";
const LOG_LABEL = "RequestApiKeyFilter";

/**
 * The key owner's user id, or null when the key is missing, malformed (not exactly `<prefix>_<value>`),
 * has the wrong prefix, is unknown/revoked, or its owner has no active user row (soft-deleted = gone,
 * CODING_STYLE §7). A failed lookup throws the DB's error.
 */
async function resolveApiKeyUserId(
  apiKey: string | undefined,
  allowedPrefixes: readonly ApiKeyPrefix[],
  event: IRequestLogEvent,
): Promise<number | null> {
  if (!apiKey) {
    event.children.push(`(M) '${API_KEY_HEADER}' ${LogEmoji.error} `);
    return null;
  }
  const segments = apiKey.split(KEY_SEPARATOR);
  const [prefix, value] = segments;
  event.children.push(`Prefix: '${prefix}'`);

  if (!(allowedPrefixes as readonly string[]).includes(prefix)) {
    event.children.push(
      `Key Prefix: ${LogEmoji.error} '${prefix}' not allowed here (expects ${allowedPrefixes.join("/")})`,
    );
    return null;
  }
  if (!value || segments.length !== KEY_SEGMENTS) {
    event.children.push(`Key Validity: ${LogEmoji.error} `);
    return null;
  }

  const key = await db.findOne<ITB_SS_API_KEY>(
    API_KEY_TABLES[prefix as ApiKeyPrefix],
    { api_key_prefix: prefix, api_key_hash: sha256Hex(value), record_status: RecordStatus.ACTIVE },
    ["user_id"],
    event,
  );
  if (!key) {
    event.children.push(`Key Validity: ${LogEmoji.error} `);
    return null;
  }
  event.children.push(`Key Validity: ${LogEmoji.success} `);

  const user = await db.findOne<ITB_AA_USER>(
    USER_TABLE,
    { id: key.user_id, record_status: RecordStatus.ACTIVE },
    ["id"],
    event,
  );
  if (!user) {
    event.children.push(`User Exists: ${LogEmoji.error} `);
    return null;
  }
  event.children.push(`User Exists: ${LogEmoji.success} `);
  return key.user_id;
}

/**
 * Builds an x-api-key filter that only accepts keys with one of the given prefixes.
 * Each route must name its own key type, so a key minted for one integration can never
 * authenticate another's routes (every key type resolves to the owner's userId).
 * On success the owner's id is in `logContext.metadata.userId` (read it with `getApiKeyUserId`).
 * A failed lookup (DB down) is a 500 (user decision M2), so a Shortcut doesn't look like it has a bad key.
 */
export const RequestApiKeyFilter = (...allowedPrefixes: ApiKeyPrefix[]) =>
  async function (req: Request, res: Response, next: NextFunction) {
    const event = LoggingUtilities.request.middleware(req.logContext, "VALIDATION", "Specific headers");
    const header = req.headers[API_KEY_HEADER];
    const apiKey = Array.isArray(header) ? header[0] : header;

    const cr = new ControllerResponse(req, res);
    let userId: number | null;
    try {
      userId = await resolveApiKeyUserId(apiKey, allowedPrefixes, event);
    } catch (err) {
      return handleException(err, cr, LOG_LABEL, LOOKUP_FAILED_MESSAGE);
    }
    if (userId === null) return cr.badAuthorization(INVALID_API_KEY_MESSAGE);

    req.logContext.metadata = { ...req.logContext.metadata, userId };
    next();
  };
