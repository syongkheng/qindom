// src/controllers/Hdb.controller.ts
import { Router, Request, Response } from "express";
import { ControllerResponse } from "../models/responses/ControllerResponse";
import KnexSqlUtilities from "../utils/KnexSqlUtilities";
import { PfpService } from "../services/Pfp.service";
import { MandatoryTokenFilter } from "../middlewares/TokenFilter";
import { RequestWithUserInfo } from "../models/requests/RequestWithUserInfo";

export default function createPfpController(db: KnexSqlUtilities) {
  const router = Router();
  const pfpService = new PfpService(db);

  router.get(
    "/user/country",
    [MandatoryTokenFilter],
    async (req: RequestWithUserInfo, res: Response) => {
      const response = new ControllerResponse(res);

      try {
        const username = req.user?.username ?? "UNKNOWN";
        const system = req.user?.system ?? "UNKNOWN";
        return response.ok(
          await pfpService.getCountry(`${username}_${system}`)
        );
      } catch (error: any) {
        return response.ko(error.message);
      }
    }
  );

  router.post(
    "/user/country",
    [MandatoryTokenFilter],
    async (_req: RequestWithUserInfo, res: Response) => {
      const response = new ControllerResponse(res);

      try {
        const username = _req.user?.username ?? "UNKNOWN";
        const { country, system } = _req.body;
        const result = await pfpService.updateCountry(
          `${username}_${system}`,
          country
        );
        return response.ok(result);
      } catch (error: any) {
        return response.ko(error.message);
      }
    }
  );

  router.get(
    "/user/photo",
    [MandatoryTokenFilter],
    async (req: RequestWithUserInfo, res: Response) => {
      const response = new ControllerResponse(res);
      try {
        const username = req.user?.username ?? "UNKNOWN";
        const system = req.user?.system ?? "UNKNOWN";

        const userRecord = await pfpService.getProfilePhoto(
          `${username}_${system}`
        );
        return response.ok(userRecord);
      } catch (error: any) {
        return response.ko(error.message);
      }
    }
  );

  router.post(
    "/user/photo",
    [MandatoryTokenFilter],
    async (req: RequestWithUserInfo, res: Response) => {
      const response = new ControllerResponse(res);
      try {
        const username = req.user?.username ?? "UNKNOWN";
        const system = req.user?.system ?? "UNKNOWN";
        const { blobString } = req.body;

        return response.ok(
          await pfpService.updateProfilePhoto(
            `${username}_${system}`,
            blobString
          )
        );
      } catch (error: any) {
        return response.ko(error.message);
      }
    }
  );

  return router;
}
