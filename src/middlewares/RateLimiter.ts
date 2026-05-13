import rateLimit from "express-rate-limit";

const rateLimitResponse = (message: string) => ({
  success: false,
  message,
});

/** Global fallback — all routes */
export const globalLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,       // 1 minute
  limit: 100,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: rateLimitResponse("Too many requests. Please slow down."),
});

/** POST /api/auth/login */
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,      // 15 minutes
  limit: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: rateLimitResponse("Too many login attempts. Please try again in 15 minutes."),
});

/** POST /api/auth/register */
export const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,      // 1 hour
  limit: 5,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: rateLimitResponse("Too many registration attempts. Please try again in an hour."),
});

/** POST /api/auth/verify-email */
export const verifyEmailLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,      // 15 minutes
  limit: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: rateLimitResponse("Too many verification attempts. Please try again in 15 minutes."),
});

/** POST /api/auth/resend-verify */
export const resendVerifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,      // 15 minutes
  limit: 3,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: rateLimitResponse("Too many resend requests. Please try again in 15 minutes."),
});

/** GET /api/douyin/live */
export const douyinLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,       // 1 minute
  limit: 15,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: rateLimitResponse("Too many Douyin requests. Please slow down."),
});

/** POST /api/log — 10 req/sec */
export const logLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,       // 1 minute
  limit: 600,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: rateLimitResponse("Too many log events. Please slow down."),
});

/** GET /api/feature */
export const featureLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,       // 1 minute
  limit: 60,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: rateLimitResponse("Too many requests."),
});
