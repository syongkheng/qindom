import { Router, Response } from "express";
import { ControllerResponse } from "../models/responses/ControllerResponse";
import { MandatoryTokenFilter } from "../middlewares/TokenFilter";
import { RequestWithUserInfo } from "../models/requests/RequestWithUserInfo";
import { WeddingService } from "./Wedding.service";
import { WeddingValidator } from "./Wedding.validator";
import { getUser, handleException } from "../utils/requestUtils";

export function createWeddingTablesRouter(svc: WeddingService): Router {
  const router = Router();

  router.get("/", MandatoryTokenFilter, async (req: RequestWithUserInfo, res: Response) => {
    const cr = new ControllerResponse(res);
    try {
      const tables = await svc.listTables(getUser(req).username);
      return cr.ok(tables);
    } catch (err) {
      return handleException(err, cr, "WeddingTablesController.GET /", "Failed to load tables");
    }
  });

  router.post("/", MandatoryTokenFilter, async (req: RequestWithUserInfo, res: Response) => {
    const cr = new ControllerResponse(res);
    try {
      const body = WeddingValidator.validateCreateTableRequest(req);
      const table = await svc.createTable(getUser(req).username, body);
      return cr.ok(table);
    } catch (err) {
      return handleException(err, cr, "WeddingTablesController.POST /", "Failed to create table");
    }
  });

  router.post("/delete", MandatoryTokenFilter, async (req: RequestWithUserInfo, res: Response) => {
    const cr = new ControllerResponse(res);
    try {
      const { id } = WeddingValidator.validateIdRequest(req);
      const deleted = await svc.deleteTable(getUser(req).username, id);
      if (!deleted) return cr.result(404, "Not Found", "Table not found");
      return cr.ok(null);
    } catch (err) {
      return handleException(err, cr, "WeddingTablesController.POST /delete", "Failed to delete table");
    }
  });

  router.post("/assign", MandatoryTokenFilter, async (req: RequestWithUserInfo, res: Response) => {
    const cr = new ControllerResponse(res);
    try {
      const { guestId, tableId, seatNumber } = WeddingValidator.validateAssignTableRequest(req);
      const assigned = await svc.assignGuestTable(getUser(req).username, guestId, tableId, seatNumber);
      if (!assigned) return cr.result(404, "Not Found", "Guest or table not found");
      return cr.ok(null);
    } catch (err) {
      return handleException(err, cr, "WeddingTablesController.POST /assign", "Failed to assign table");
    }
  });

  return router;
}
