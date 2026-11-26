import { Router } from "express";
import KnexSqlUtilities from "../utils/KnexSqlUtilities.js";
import { MandatoryTokenFilter } from "../middlewares/TokenFilter.js";
import {
  countAsFailedAttempt,
  loginLimiter,
  passwordCheckLimiter,
  preflightLimiter,
  registerLimiter,
  resendVerifyLimiter,
  verifyEmailLimiter,
} from "../middlewares/RateLimiter.js";
import { getUser, route } from "../utils/RequestUtilities.js";
import { toMessage } from "../utils/ErrorUtilities.js";
import { LoggingUtilities } from "../utils/logging/LoggingUtilities.js";
import { setAuthCookies, clearAuthCookies, JWT_COOKIE } from "../utils/AuthCookieUtilities.js";
import { AuthRegistrationService } from "./AuthRegistration.service.js";
import { AuthSessionService } from "./AuthSession.service.js";
import createAuthAdminController from "./AuthAdmin.controller.js";
import {
  validateEmailBody,
  validateLoginBody,
  validatePasswordUpdateBody,
  validatePasswordValidateBody,
  validateRegisterBody,
  validateVerifyEmailBody,
} from "./Auth.validator.js";
import {
  AuthLoggedOutDto,
  AuthPasswordValidityDto,
  AuthPreflightDto,
  AuthRegisteredDto,
  AuthSessionDto,
  AuthUpdatedDto,
  AuthVerificationDto,
  AuthVerifyCodeSentDto,
} from "./Auth.types.js";

/**
 * `/auth` (mounted with `mw.std`): registration, login, session and password routes; the
 * OWNER-only `/auth/admin/*` routes live in `AuthAdmin.controller.ts`.
 * A JWT only ever leaves through `setAuthCookies` (httpOnly cookie), never in a response body.
 */
export default function createAuthController(db: KnexSqlUtilities): Router {
  const router = Router();
  const sessions = new AuthSessionService(db);
  const registration = new AuthRegistrationService(db, sessions);

  router.use("/admin", createAuthAdminController(db));

  // Tells the login form whether to show register or login next.
  router.post(
    "/preflight",
    preflightLimiter,
    route("AuthController.POST /preflight", "Failed to check email", async (req, cr) => {
      const event = LoggingUtilities.request.branch(req.logContext, "VALIDATION", "Request body");
      const body = validateEmailBody(req.body, event);
      return cr.ok<AuthPreflightDto>(await registration.preflight(body, req.logContext));
    }),
  );

  router.post(
    "/login",
    loginLimiter,
    route("AuthController.POST /login", "Failed to login", async (req, cr, res) => {
      const event = LoggingUtilities.request.branch(req.logContext, "VALIDATION", "Request body");
      const { token, session } = await sessions.login(validateLoginBody(req.body, event), req.logContext);
      setAuthCookies(res, token);
      return cr.ok<AuthSessionDto>(session);
    }),
  );

  // Creates an unverified account and emails a 6-digit code.
  router.post(
    "/register",
    registerLimiter,
    route("AuthController.POST /register", "Failed to register", async (req, cr) => {
      const event = LoggingUtilities.request.branch(req.logContext, "VALIDATION", "Request body");
      const body = validateRegisterBody(req.body, event);
      return cr.ok<AuthRegisteredDto>(await registration.register(body, req.logContext));
    }),
  );

  // Code + password → verified account and a session cookie.
  router.post(
    "/verify-email",
    verifyEmailLimiter,
    route("AuthController.POST /verify-email", "Failed to verify email", async (req, cr, res) => {
      const event = LoggingUtilities.request.branch(req.logContext, "VALIDATION", "Request body");
      const body = validateVerifyEmailBody(req.body, event);
      const { token, session } = await registration.verifyEmail(body, req.logContext);
      setAuthCookies(res, token);
      return cr.ok<AuthSessionDto>(session);
    }),
  );

  // Always answers 200 { sent: true }, whatever happened (bad body, unknown email, mail failure),
  // so the response never reveals whether an email is registered. Failures go to the request tree.
  router.post(
    "/resend-verify",
    resendVerifyLimiter,
    route("AuthController.POST /resend-verify", "Failed to resend code", async (req, cr) => {
      try {
        const event = LoggingUtilities.request.branch(req.logContext, "VALIDATION", "Request body");
        await registration.resendVerifyCode(validateEmailBody(req.body, event), req.logContext);
      } catch (err) {
        LoggingUtilities.request.branch(
          req.logContext,
          "WARN",
          "Resend failed (hidden from the client)",
          LoggingUtilities.sanitise(toMessage(err)),
        );
      }
      return cr.ok<AuthVerifyCodeSentDto>({ sent: true });
    }),
  );

  // Validates the session cookie (MandatoryTokenFilter already checked it; roles come from the DB row).
  router.post(
    "/verification",
    MandatoryTokenFilter,
    route("AuthController.POST /verification", "Failed to verify token", async (req, cr) => {
      const { username, roles } = getUser(req);
      return cr.ok<AuthVerificationDto>({ username, roles, exist: true });
    }),
  );

  // Clears the auth + CSRF cookies and, when the cookie holds a valid JWT, revokes it server-side
  // (best-effort, never fails). Deliberately not behind MandatoryTokenFilter: logout's job is to
  // reset a broken/expired session, so it must succeed even when the token or CSRF check would
  // fail (fndom's logout-on-401 depends on it).
  router.post(
    "/logout",
    route("AuthController.POST /logout", "Failed to log out", async (req, cr, res) => {
      const token = req.cookies?.[JWT_COOKIE];
      if (token) await sessions.invalidateSession(token, req.logContext);
      clearAuthCookies(res);
      return cr.ok<AuthLoggedOutDto>({ loggedOut: true });
    }),
  );

  // Re-checks the session user's password. A wrong one still answers 200 { isValid: false } but counts
  // toward passwordCheckLimiter (shared with /password/update).
  router.post(
    "/password/validate",
    MandatoryTokenFilter,
    passwordCheckLimiter,
    route("AuthController.POST /password/validate", "Failed to validate password", async (req, cr, res) => {
      const event = LoggingUtilities.request.branch(req.logContext, "VALIDATION", "Request body");
      const { password } = validatePasswordValidateBody(req.body, event);
      const validity = await sessions.validatePassword(getUser(req).id, password, req.logContext);
      if (!validity.isValid) countAsFailedAttempt(res);
      return cr.ok<AuthPasswordValidityDto>(validity);
    }),
  );

  // A wrong current password is a 401, so it counts toward passwordCheckLimiter.
  router.post(
    "/password/update",
    MandatoryTokenFilter,
    passwordCheckLimiter,
    route("AuthController.POST /password/update", "Failed to update password", async (req, cr, res) => {
      const event = LoggingUtilities.request.branch(req.logContext, "VALIDATION", "Request body");
      const body = validatePasswordUpdateBody(req.body, event);
      const { token } = await sessions.updatePassword(getUser(req).id, body, req.logContext);
      // The change rotated the token: refresh this session's cookie so the user who just changed
      // it stays logged in while every other session drops.
      setAuthCookies(res, token);
      return cr.ok<AuthUpdatedDto>({ updated: true });
    }),
  );

  return router;
}
