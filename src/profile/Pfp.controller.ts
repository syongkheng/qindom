import { Router, Response } from "express";
import { ControllerResponse } from "../models/responses/ControllerResponse";
import KnexSqlUtilities from "../utils/KnexSqlUtilities";
import { PfpService } from "./Pfp.service";
import { MandatoryTokenFilter } from "../middlewares/TokenFilter";
import { RequestWithUserInfo } from "../models/requests/RequestWithUserInfo";
import { getUser, handleException } from "../utils/requestUtils";

export default function createPfpController(db: KnexSqlUtilities) {
  const router = Router();
  const pfpService = new PfpService(db);

  router.get("/user/country", MandatoryTokenFilter, async (req: RequestWithUserInfo, res: Response) => {
    const cr = new ControllerResponse(res);
    try {
      const { username, system } = getUser(req);
      return cr.ok(await pfpService.getCountry(`${username}_${system}`));
    } catch (err) {
      return handleException(err, cr, "PfpController.GET /user/country", "Failed to get country");
    }
  });

  router.post("/user/country", MandatoryTokenFilter, async (req: RequestWithUserInfo, res: Response) => {
    const cr = new ControllerResponse(res);
    try {
      const { username, system } = getUser(req);
      const { country } = req.body;
      return cr.ok(await pfpService.updateCountry(`${username}_${system}`, country));
    } catch (err) {
      return handleException(err, cr, "PfpController.POST /user/country", "Failed to update country");
    }
  });

  router.get("/user/photo", MandatoryTokenFilter, async (req: RequestWithUserInfo, res: Response) => {
    const cr = new ControllerResponse(res);
    try {
      const { username, system } = getUser(req);
      return cr.ok(await pfpService.getProfilePhoto(`${username}_${system}`));
    } catch (err) {
      return handleException(err, cr, "PfpController.GET /user/photo", "Failed to get profile photo");
    }
  });

  router.post("/user/photo", MandatoryTokenFilter, async (req: RequestWithUserInfo, res: Response) => {
    const cr = new ControllerResponse(res);
    try {
      const { username, system } = getUser(req);
      const { blobString } = req.body;
      return cr.ok(await pfpService.updateProfilePhoto(`${username}_${system}`, blobString));
    } catch (err) {
      return handleException(err, cr, "PfpController.POST /user/photo", "Failed to update profile photo");
    }
  });

  router.post("/user/username", MandatoryTokenFilter, async (req: RequestWithUserInfo, res: Response) => {
    const cr = new ControllerResponse(res);
    try {
      const { username, system } = getUser(req);
      const { newUsername } = req.body;
      if (!newUsername || String(newUsername).trim().length < 3)
        return cr.badRequest("Username must be at least 3 characters.");
      return cr.ok(await pfpService.updateUsername(`${username}_${system}`, String(newUsername).trim(), system));
    } catch (err) {
      return handleException(err, cr, "PfpController.POST /user/username", "Failed to update username");
    }
  });

  return router;
}
