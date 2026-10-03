import { Request } from "express";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";

/**
 * Key limiters by the real client IP. nginx sets X-Real-IP to $remote_addr, so
 * req.ip would otherwise be nginx's address and every client would share one bucket.
 * ipKeyGenerator collapses IPv6 to its /56 so rotating addresses can't dodge limits.
 */
const clientIpKey = (req: Request) =>
  ipKeyGenerator(String(req.headers["x-real-ip"] || req.socket.remoteAddress || ""));

const rateLimitResponse = (message: string) => ({
  success: false,
  message,
});

/** Global fallback — all routes */
export const globalLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,       // 1 minute
  limit: 100,
  keyGenerator: clientIpKey,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: rateLimitResponse("Too many requests. Please slow down."),
});

/** POST /auth/login */
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,      // 15 minutes
  limit: 10,
  keyGenerator: clientIpKey,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: rateLimitResponse("Too many login attempts. Please try again in 15 minutes."),
});

/** POST /auth/register */
export const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,      // 1 hour
  limit: 5,
  keyGenerator: clientIpKey,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: rateLimitResponse("Too many registration attempts. Please try again in an hour."),
});

/** POST /auth/verify-email */
export const verifyEmailLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,      // 15 minutes
  limit: 10,
  keyGenerator: clientIpKey,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: rateLimitResponse("Too many verification attempts. Please try again in 15 minutes."),
});

/** POST /auth/resend-verify */
export const resendVerifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,      // 15 minutes
  limit: 3,
  keyGenerator: clientIpKey,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: rateLimitResponse("Too many resend requests. Please try again in 15 minutes."),
});

/** GET|POST /auth/admin/* */
export const adminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,      // 15 minutes
  limit: 60,
  keyGenerator: clientIpKey,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: rateLimitResponse("Too many admin requests. Please slow down."),
});

/** POST /itinerary/challenge — only failed guesses count toward the limit */
export const itineraryChallengeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,      // 15 minutes
  limit: 10,
  skipSuccessfulRequests: true,
  keyGenerator: clientIpKey,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: rateLimitResponse("Too many access code attempts. Please try again in 15 minutes."),
});
