import { Router, Response } from "express";
import { ControllerResponse } from "../models/responses/ControllerResponse";
import KnexSqlUtilities from "../utils/KnexSqlUtilities";
import { RequestWithUserInfo } from "../models/requests/RequestWithUserInfo";
import { MealService } from "./Meal.service";
import { MealValidator } from "./Meal.validator";
import { getUser, handleException } from "../utils/requestUtils";

export default function createMealController(db: KnexSqlUtilities): Router {
  const router = Router();
  const svc = new MealService(db);

  router.get("/range", async (req: RequestWithUserInfo, res: Response) => {
    const cr = new ControllerResponse(res);
    try {
      const { from, to } = MealValidator.validateRangeRequest(req);
      const result = await svc.getRange(getUser(req).username, from, to);
      return cr.ok(result);
    } catch (err) {
      return handleException(err, cr, "MealController.GET /range", "Failed to fetch meal range");
    }
  });

  router.get("/", async (req: RequestWithUserInfo, res: Response) => {
    const cr = new ControllerResponse(res);
    try {
      const date = (req.query.date as string) || new Date().toISOString().slice(0, 10);
      const result = await svc.getByDate(getUser(req).username, date);
      return cr.ok(result);
    } catch (err) {
      return handleException(err, cr, "MealController.GET /", "Failed to fetch meals");
    }
  });

  router.post("/", async (req: RequestWithUserInfo, res: Response) => {
    const cr = new ControllerResponse(res);
    try {
      const body = MealValidator.validateCreateRequest(req);
      const result = await svc.create(getUser(req).username, body);
      return cr.ok(result);
    } catch (err) {
      return handleException(err, cr, "MealController.POST /", "Failed to create meal");
    }
  });

  router.post("/update", async (req: RequestWithUserInfo, res: Response) => {
    const cr = new ControllerResponse(res);
    try {
      const { id, plannedName, notes } = MealValidator.validateUpdateRequest(req);
      const updated = await svc.update(getUser(req).username, id, plannedName, notes);
      if (!updated) return cr.result(404, "Not Found", "Meal not found");
      return cr.ok(null);
    } catch (err) {
      return handleException(err, cr, "MealController.POST /update", "Failed to update meal");
    }
  });

  router.post("/delete", async (req: RequestWithUserInfo, res: Response) => {
    const cr = new ControllerResponse(res);
    try {
      const { id } = MealValidator.validateIdRequest(req);
      const deleted = await svc.delete(getUser(req).username, id);
      if (!deleted) return cr.result(404, "Not Found", "Meal not found");
      return cr.ok(null);
    } catch (err) {
      return handleException(err, cr, "MealController.POST /delete", "Failed to delete meal");
    }
  });

  router.post("/photo", async (req: RequestWithUserInfo, res: Response) => {
    const cr = new ControllerResponse(res);
    try {
      const { mealLogId, blob, mimeType, name } = MealValidator.validatePhotoUploadRequest(req);
      const result = await svc.uploadPhoto(getUser(req).username, mealLogId, blob, mimeType, name);
      return cr.ok(result);
    } catch (err) {
      return handleException(err, cr, "MealController.POST /photo", "Failed to upload photo");
    }
  });

  router.post("/photo/delete", async (req: RequestWithUserInfo, res: Response) => {
    const cr = new ControllerResponse(res);
    try {
      const { mealLogId } = req.body;
      if (!mealLogId) return cr.badRequest("mealLogId is required");
      const deleted = await svc.deletePhoto(getUser(req).username, Number(mealLogId));
      if (!deleted) return cr.result(404, "Not Found", "Meal not found");
      return cr.ok(null);
    } catch (err) {
      return handleException(err, cr, "MealController.POST /photo/delete", "Failed to delete photo");
    }
  });

  return router;
}
