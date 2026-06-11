import { NextFunction, Response } from "express";
import db from "../config/db/mysql";
import { RequestWithUserInfo } from "../models/requests/RequestWithUserInfo";
import { ITbMarketplaceApiKey } from "../models/databases/tb_marketplace_api_key";
import { ITB_AA_USER } from "../models/databases/tb_aa_user";
import { MandatoryTokenFilter } from "./TokenFilter";

// Resolve req.user from a validated API key row
async function resolveUserFromKey(
  row: ITbMarketplaceApiKey,
  req: RequestWithUserInfo,
  res: Response,
  next: NextFunction,
): Promise<void | Response> {
  const user = await db.findOne<ITB_AA_USER>(
    "tb_aa_user",
    // username_system composite key matches the pattern used in MandatoryTokenFilter
    { username_system: `${row.username}_fnd`, record_status: "A" },
    ["username", "system", "roles", "last_logged_in_dt"],
  );
  if (!user) {
    return res.status(401).json({ message: "API key owner not found" });
  }

  req.user = {
    username:       user.username,
    system:         user.system,
    roles:          JSON.parse(user.roles || "[]"),
    lastLoggedInDt: user.last_logged_in_dt,
  };
  next();
}

const PUBLIC_USER: import("../models/IDecodedTokenUser").IDecodedTokenUser = {
  username:       "__public__",
  system:         "fnd",
  roles:          [],
  lastLoggedInDt: 0,
};

/**
 * ApiKeyOrJwtFilter
 * - X-API-Key present → API key path (authoritative; a bad key is rejected, no JWT fallback)
 *   - is_public = 1 → trial mode; req.isPublicKey set, no tb_aa_user lookup
 *   - is_public = 0 → personal key; resolves req.user from tb_aa_user
 * - X-API-Key absent  → delegates to MandatoryTokenFilter (JWT path, unchanged)
 */
export const ApiKeyOrJwtFilter = async (
  req: RequestWithUserInfo,
  res: Response,
  next: NextFunction,
): Promise<void | Response> => {
  const apiKey = req.headers["x-api-key"] as string | undefined;
  if (!apiKey) return MandatoryTokenFilter(req, res, next);

  try {
    const row = await db.findOne<ITbMarketplaceApiKey>(
      "tb_marketplace_api_key",
      { api_key: apiKey, record_status: "A" },
    );
    if (!row) return res.status(401).json({ message: "Invalid or revoked API key" });

    if (row.is_public === 1) {
      req.user         = PUBLIC_USER;
      req.isPublicKey  = true;
      return next();
    }

    return resolveUserFromKey(row, req, res, next);
  } catch {
    return res.status(401).json({ message: "API key authentication failed" });
  }
};

/**
 * ApiKeyFilter
 * Requires a valid X-API-Key header — no JWT fallback.
 * Reserved for future dedicated API-only route prefixes.
 */
export const ApiKeyFilter = async (
  req: RequestWithUserInfo,
  res: Response,
  next: NextFunction,
): Promise<void | Response> => {
  const apiKey = req.headers["x-api-key"] as string | undefined;
  if (!apiKey) return res.status(401).json({ message: "Missing X-API-Key header" });

  try {
    const row = await db.findOne<ITbMarketplaceApiKey>(
      "tb_marketplace_api_key",
      { api_key: apiKey, record_status: "A" },
    );
    if (!row) return res.status(401).json({ message: "Invalid or revoked API key" });

    return resolveUserFromKey(row, req, res, next);
  } catch {
    return res.status(401).json({ message: "API key authentication failed" });
  }
};
