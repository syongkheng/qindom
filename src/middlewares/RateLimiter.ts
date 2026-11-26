import { Request } from "express";
import rateLimit, { ipKeyGenerator, Options } from "express-rate-limit";
import { Time } from "../constants/Time.js";
import { RequestWithUserInfo } from "../models/requests/RequestWithUserInfo.js";

/**
 * Key limiters by the real client IP. nginx sets X-Real-IP to $remote_addr, so
 * req.ip would otherwise be nginx's address and every client would share one bucket.
 * ipKeyGenerator collapses IPv6 to its /56 so rotating addresses can't dodge limits.
 * (Display IPs use `clientIp()` in utils/requestUtils.ts; this is a bucket key, not a display value.)
 */
const clientIpKey = (req: Request) =>
  ipKeyGenerator(String(req.headers["x-real-ip"] || req.socket.remoteAddress || ""));

interface LimiterConfig {
  windowMs: number;
  /** Requests allowed per key per window. */
  limit: number;
  /** Body of the 429: `{ success: false, message }`. */
  message: string;
  /** Count only failed (status >= 400) requests. */
  skipSuccessfulRequests?: boolean;
  keyGenerator?: Options["keyGenerator"];
}

/** Every limiter: draft-7 `RateLimit` / `RateLimit-Policy` headers, no legacy `X-RateLimit-*`, per-IP unless told otherwise. */
const limiter = ({
  windowMs,
  limit,
  message,
  skipSuccessfulRequests = false,
  keyGenerator = clientIpKey,
}: LimiterConfig) =>
  rateLimit({
    windowMs,
    limit,
    skipSuccessfulRequests,
    keyGenerator,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    message: { success: false, message },
  });

/** Global fallback, all routes. */
export const globalLimiter = limiter({
  windowMs: Time.MINUTE_MS,
  limit: 100,
  message: "Too many requests. Please slow down.",
});

/** POST /auth/login */
export const loginLimiter = limiter({
  windowMs: 15 * Time.MINUTE_MS,
  limit: 10,
  message: "Too many login attempts. Please try again in 15 minutes.",
});

/** POST /auth/register */
export const registerLimiter = limiter({
  windowMs: Time.HOUR_MS,
  limit: 5,
  message: "Too many registration attempts. Please try again in an hour.",
});

/** POST /auth/verify-email */
export const verifyEmailLimiter = limiter({
  windowMs: 15 * Time.MINUTE_MS,
  limit: 10,
  message: "Too many verification attempts. Please try again in 15 minutes.",
});

/** POST /auth/resend-verify */
export const resendVerifyLimiter = limiter({
  windowMs: 15 * Time.MINUTE_MS,
  limit: 3,
  message: "Too many resend requests. Please try again in 15 minutes.",
});

/** GET|POST /auth/admin/*, /analytics/admin/* */
export const adminLimiter = limiter({
  windowMs: 15 * Time.MINUTE_MS,
  limit: 60,
  message: "Too many admin requests. Please slow down.",
});

/** POST /itinerary/challenge: only failed guesses count toward the limit. */
export const itineraryChallengeLimiter = limiter({
  windowMs: 15 * Time.MINUTE_MS,
  limit: 10,
  skipSuccessfulRequests: true,
  message: "Too many access code attempts. Please try again in 15 minutes.",
});

/** POST /wedding/rsvp: each submission sends up to 11 emails (submitter + 10 guests). */
export const weddingRsvpLimiter = limiter({
  windowMs: 15 * Time.MINUTE_MS,
  limit: 10,
  message: "Too many RSVP submissions. Please try again in 15 minutes.",
});

/** GET /house/view/:token: public shared-house read. */
export const houseViewLimiter = limiter({
  windowMs: Time.MINUTE_MS,
  limit: 60,
  message: "Too many requests. Please slow down.",
});

/** POST /analytics/collect: public ingest; page views + a few interaction events per visitor. */
export const analyticsLimiter = limiter({
  windowMs: Time.MINUTE_MS,
  limit: 120,
  message: "Too many analytics events. Please slow down.",
});

/** POST /camera/device/register: phones register on launch and after their device is removed. */
export const cameraRegisterLimiter = limiter({
  windowMs: Time.HOUR_MS,
  limit: 30,
  message: "Too many device registrations. Please try again later.",
});

/** POST /camera/device/claim: only failed (wrong/expired) codes count. Per IP… */
export const cameraClaimIpLimiter = limiter({
  windowMs: 15 * Time.MINUTE_MS,
  limit: 10,
  skipSuccessfulRequests: true,
  message: "Too many pairing attempts. Please try again in 15 minutes.",
});

/** …and per logged-in user (runs after MandatoryTokenFilter), so rotating IPs doesn't help. */
export const cameraClaimUserLimiter = limiter({
  windowMs: 15 * Time.MINUTE_MS,
  limit: 5,
  skipSuccessfulRequests: true,
  keyGenerator: (req: Request) => `camera-claim-user:${(req as RequestWithUserInfo).user?.id ?? "none"}`,
  message: "Too many pairing attempts. Please try again in 15 minutes.",
});

/** POST /analytics/report: private dashboard reads (viewer key). */
export const analyticsReportLimiter = limiter({
  windowMs: Time.MINUTE_MS,
  limit: 30,
  message: "Too many report requests. Please slow down.",
});

/** POST /pdca/enquiry: PDCA website contact form. */
export const pdcaEnquiryLimiter = limiter({
  windowMs: 10 * Time.MINUTE_MS,
  limit: 5,
  message: "Too many messages. Please try again in 10 minutes, or WhatsApp us.",
});
