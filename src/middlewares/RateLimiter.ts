import rateLimit, { ipKeyGenerator } from "express-rate-limit";

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

/** GET|POST /api/auth/admin/* */
export const adminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,      // 15 minutes
  limit: 60,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: rateLimitResponse("Too many admin requests. Please slow down."),
});

/** POST /api/llm/trial/chat — 20 req/hour per IP, always applied */
export const publicTrialLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 20,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: rateLimitResponse("Trial limit reached. Please create an API key to continue."),
});

/** POST /api/llm/chat — keyed by X-API-Key when present, IP otherwise */
export const chatLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,       // 1 minute
  limit: 20,                      // 20 messages per minute per key / per IP
  standardHeaders: "draft-7",
  legacyHeaders: false,
  keyGenerator: (req) => {
    const key = req.headers["x-api-key"];
    if (typeof key === "string" && key) return `apikey:${key}`;
    return ipKeyGenerator(req.ip ?? "unknown");
  },
  message: rateLimitResponse("Too many chat requests. Please slow down."),
});
