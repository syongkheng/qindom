import crypto from "crypto";
import { Response } from "express";

export const JWT_COOKIE = "jwt_token";
export const CSRF_COOKIE = "csrf_token";

const isPrd = process.env.NODE_ENV === "prd";
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30d — matches Token.service.ts jwtExpiration

const baseCookieOptions = {
  secure: isPrd,
  sameSite: "lax" as const,
  path: "/",
  maxAge: MAX_AGE_MS,
};

export function setAuthCookies(res: Response, token: string): void {
  res.cookie(JWT_COOKIE, token, { ...baseCookieOptions, httpOnly: true });
  res.cookie(CSRF_COOKIE, crypto.randomBytes(32).toString("hex"), { ...baseCookieOptions, httpOnly: false });
}

export function clearAuthCookies(res: Response): void {
  res.clearCookie(JWT_COOKIE, { ...baseCookieOptions, httpOnly: true });
  res.clearCookie(CSRF_COOKIE, { ...baseCookieOptions, httpOnly: false });
}
