import { Router, Response } from "express";
import { ControllerResponse } from "../models/responses/ControllerResponse";
import KnexSqlUtilities from "../utils/KnexSqlUtilities";
import { RequestWithUserInfo } from "../models/requests/RequestWithUserInfo";
import { ExpenseService } from "./Expense.service";
import { ExpenseValidator } from "./Expense.validator";
import { getUser, handleException } from "../utils/requestUtils";

export default function createExpenseController(db: KnexSqlUtilities): Router {
  const router = Router();
  const svc = new ExpenseService(db);

  router.get("/", async (req: RequestWithUserInfo, res: Response) => {
    const cr = new ControllerResponse(res);
    try {
      return cr.ok(await svc.init(getUser(req).username));
    } catch (err) {
      return handleException(err, cr, "ExpenseController.GET /", "Failed to load expense data");
    }
  });

  router.post("/balance", async (req: RequestWithUserInfo, res: Response) => {
    const cr = new ControllerResponse(res);
    try {
      const { balance } = ExpenseValidator.validateBalanceRequest(req);
      await svc.upsertBalance(getUser(req).username, balance);
      return cr.ok(null);
    } catch (err) {
      return handleException(err, cr, "ExpenseController.POST /balance", "Failed to save balance");
    }
  });

  router.post("/transaction", async (req: RequestWithUserInfo, res: Response) => {
    const cr = new ControllerResponse(res);
    try {
      const body = ExpenseValidator.validateCreateTransactionRequest(req);
      const result = await svc.createTransaction(getUser(req).username, body);
      return cr.ok(result);
    } catch (err) {
      return handleException(err, cr, "ExpenseController.POST /transaction", "Failed to create transaction");
    }
  });

  router.post("/transaction/update", async (req: RequestWithUserInfo, res: Response) => {
    const cr = new ControllerResponse(res);
    try {
      const { id, ...body } = ExpenseValidator.validateUpdateTransactionRequest(req);
      const result = await svc.updateTransaction(getUser(req).username, id, body);
      if (!result) return cr.result(404, "Not Found", "Transaction not found");
      return cr.ok(result);
    } catch (err) {
      return handleException(err, cr, "ExpenseController.POST /transaction/update", "Failed to update transaction");
    }
  });

  router.post("/transaction/delete", async (req: RequestWithUserInfo, res: Response) => {
    const cr = new ControllerResponse(res);
    try {
      const { id } = ExpenseValidator.validateIdRequest(req);
      const deleted = await svc.deleteTransaction(getUser(req).username, id);
      if (!deleted) return cr.result(404, "Not Found", "Transaction not found");
      return cr.ok(null);
    } catch (err) {
      return handleException(err, cr, "ExpenseController.POST /transaction/delete", "Failed to delete transaction");
    }
  });

  router.post("/card", async (req: RequestWithUserInfo, res: Response) => {
    const cr = new ControllerResponse(res);
    try {
      const body = ExpenseValidator.validateCreateCardRequest(req);
      const result = await svc.createCard(getUser(req).username, body);
      return cr.ok(result);
    } catch (err) {
      return handleException(err, cr, "ExpenseController.POST /card", "Failed to create card");
    }
  });

  router.post("/card/update", async (req: RequestWithUserInfo, res: Response) => {
    const cr = new ControllerResponse(res);
    try {
      const { id, ...body } = ExpenseValidator.validateUpdateCardRequest(req);
      const result = await svc.updateCard(getUser(req).username, id, body);
      if (!result) return cr.result(404, "Not Found", "Card not found");
      return cr.ok(result);
    } catch (err) {
      return handleException(err, cr, "ExpenseController.POST /card/update", "Failed to update card");
    }
  });

  router.post("/card/delete", async (req: RequestWithUserInfo, res: Response) => {
    const cr = new ControllerResponse(res);
    try {
      const { id } = ExpenseValidator.validateIdRequest(req);
      const deleted = await svc.deleteCard(getUser(req).username, id);
      if (!deleted) return cr.result(404, "Not Found", "Card not found");
      return cr.ok(null);
    } catch (err) {
      return handleException(err, cr, "ExpenseController.POST /card/delete", "Failed to delete card");
    }
  });

  return router;
}
