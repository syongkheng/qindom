import { Router } from "express";
import KnexSqlUtilities from "../utils/KnexSqlUtilities.js";
import { getUser, route } from "../utils/requestUtils.js";
import { setAuthCookies } from "../utils/AuthCookieUtilities.js";
import { LoggingUtilities } from "../utils/logging/LoggingUtilities.js";
import { ProfileService } from "./Profile.service.js";
import { validateCountryBody, validatePhotoBody, validateUsernameBody } from "./Profile.validator.js";
import { ProfileCountryDto, ProfilePhotoDto, ProfilePhotoUpdatedDto, ProfileUsernameDto } from "./Profile.types.js";

/** Mounted under `mw.auth` (JWT required for every route). */
export default function createProfileController(db: KnexSqlUtilities): Router {
  const router = Router();
  const svc = new ProfileService(db);

  router.get(
    "/user/country",
    route("ProfileController.GET /user/country", "Failed to get country", async (req, cr) =>
      cr.ok<ProfileCountryDto>(await svc.getCountry(getUser(req).id, req.logContext)),
    ),
  );

  router.post(
    "/user/country",
    route("ProfileController.POST /user/country", "Failed to update country", async (req, cr) => {
      const event = LoggingUtilities.request.branch(req.logContext, "VALIDATION", "Request body");
      const { country } = validateCountryBody(req.body, event);
      return cr.ok<ProfileCountryDto>(await svc.updateCountry(getUser(req).id, country, req.logContext));
    }),
  );

  router.get(
    "/user/photo",
    route("ProfileController.GET /user/photo", "Failed to get profile photo", async (req, cr) =>
      cr.ok<ProfilePhotoDto>(await svc.getProfilePhoto(getUser(req).id, req.logContext)),
    ),
  );

  router.post(
    "/user/photo",
    route("ProfileController.POST /user/photo", "Failed to update profile photo", async (req, cr) => {
      const event = LoggingUtilities.request.branch(req.logContext, "VALIDATION", "Request body");
      const { blobString } = validatePhotoBody(req.body, event);
      return cr.ok<ProfilePhotoUpdatedDto>(await svc.updateProfilePhoto(getUser(req).id, blobString, req.logContext));
    }),
  );

  router.post(
    "/user/username",
    route("ProfileController.POST /user/username", "Failed to update username", async (req, cr, res) => {
      const event = LoggingUtilities.request.branch(req.logContext, "VALIDATION", "Request body");
      const { newUsername } = validateUsernameBody(req.body, event);
      const { id, system } = getUser(req);
      const { token, ...result } = await svc.updateUsername(id, newUsername, system, req.logContext);
      setAuthCookies(res, token);
      return cr.ok<ProfileUsernameDto>(result);
    }),
  );

  return router;
}
