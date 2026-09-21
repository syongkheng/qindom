import crypto from "crypto";
import { Response } from "express";

export const JWT_COOKIE = "jwt_token";
export const CSRF_COOKIE = "csrf_token";

const isPrd = process.env.NODE_ENV === "prd";
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30d — matches Token.service.ts jwtExpiration

const commonCookieOptions = {
  secure: isPrd,
  sameSite: "lax" as const,
  path: "/",
  maxAge: MAX_AGE_MS,
};

const baseCookieOptions = {
  ...commonCookieOptions,
  // Frontend (awense.com) and API (api.awense.com) are sibling subdomains —
  // without an explicit domain, cookies default to api.awense.com only, so
  // the frontend's own JS can never read csrf_token via document.cookie
  // (the browser still sends it to api.awense.com, it just can't be read to
  // build the X-CSRF-Token header), and every mutating request 403s with
  // csrf_invalid. Scoping to .awense.com shares it across both.
  ...(isPrd ? { domain: ".awense.com" } : {}),
};

export function setAuthCookies(res: Response, token: string): void {
  res.cookie(JWT_COOKIE, token, { ...baseCookieOptions, httpOnly: true });
  res.cookie(CSRF_COOKIE, crypto.randomBytes(32).toString("hex"), { ...baseCookieOptions, httpOnly: false });
}

export function clearAuthCookies(res: Response): void {
  res.clearCookie(JWT_COOKIE, { ...baseCookieOptions, httpOnly: true });
  res.clearCookie(CSRF_COOKIE, { ...baseCookieOptions, httpOnly: false });

  // Browsers treat a host-only cookie (no Domain attribute — how these were
  // set before the .awense.com domain was added above) and a domain cookie
  // as distinct, coexisting cookies even with the same name. Anyone who
  // logged in before that change still carries the old host-only pair
  // alongside the new domain-scoped one; which one the server reads back is
  // effectively random, so it must also clear the old host-only variant here
  // or the stale cookie lingers and intermittently wins, failing the token/
  // CSRF check right after a fresh login. Harmless no-op in dev, where
  // baseCookieOptions never had a domain to begin with.
  if (isPrd) {
    res.clearCookie(JWT_COOKIE, { ...commonCookieOptions, httpOnly: true });
    res.clearCookie(CSRF_COOKIE, { ...commonCookieOptions, httpOnly: false });
  }
}
