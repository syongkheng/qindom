import { Router, Response } from "express";
import { ControllerResponse } from "../models/responses/ControllerResponse";
import KnexSqlUtilities from "../utils/KnexSqlUtilities";
import { ITB_EXPENSE_TRANSACTION } from "../models/databases/tb_expense_transaction";
import { ITB_EXPENSE_CARD } from "../models/databases/tb_expense_card";
import { ITB_EXPENSE_BALANCE } from "../models/databases/tb_expense_balance";
import { RequestWithUserInfo } from "../models/requests/RequestWithUserInfo";
import { toMessage } from "../utils/errorUtils";
import { LoggingUtilities } from "../utils/LoggingUtilities";

const TABLE_TX   = "tb_expense_transaction";
const TABLE_CARD = "tb_expense_card";
const TABLE_BAL  = "tb_expense_balance";

function mapTx(row: ITB_EXPENSE_TRANSACTION) {
  return {
    id:          row.id,
    type:        row.type,
    amount:      Number(row.amount),
    description: row.description,
    category:    row.category,
    date:        row.date,
    notes:       row.notes ?? null,
    cardId:      row.card_id ?? null,
    createdAt:   row.created_dt,
  };
}

function mapCard(row: ITB_EXPENSE_CARD) {
  return {
    id:           row.id,
    name:         row.name,
    cycleEndDay:  row.cycle_end_day,
    dueDay:       row.due_day,
    color:        row.color,
  };
}

export default function createExpenseController(db: KnexSqlUtilities): Router {
  const router = Router();

  // GET /api/expense — init: returns balance + all transactions + all cards
  router.get("/", async (req: RequestWithUserInfo, res: Response) => {
    const cr = new ControllerResponse(res);
    try {
      const username = req.user!.username;

      const [balRow, txRows, cardRows] = await Promise.all([
        db.findOne<ITB_EXPENSE_BALANCE>(TABLE_BAL, { created_by: username }),
        db.find<ITB_EXPENSE_TRANSACTION>(
          TABLE_TX,
          { created_by: username, record_status: "A" },
          { orderBy: "date", orderDirection: "desc" }
        ),
        db.find<ITB_EXPENSE_CARD>(
          TABLE_CARD,
          { created_by: username, record_status: "A" },
          { orderBy: "created_dt", orderDirection: "asc" }
        ),
      ]);

      return cr.ok({
        balance:      balRow ? Number(balRow.balance) : 0,
        transactions: txRows.map(mapTx),
        cards:        cardRows.map(mapCard),
      });
    } catch (err) {
      LoggingUtilities.service.error("ExpenseController.GET /", toMessage(err));
      return cr.ko("Failed to load expense data");
    }
  });

  // POST /api/expense/balance — upsert current balance
  router.post("/balance", async (req: RequestWithUserInfo, res: Response) => {
    const cr = new ControllerResponse(res);
    try {
      const username = req.user!.username;
      const { balance } = req.body;

      if (balance == null || isNaN(Number(balance))) {
        return cr.badRequest("balance is required");
      }

      await db.raw(
        `INSERT INTO ${TABLE_BAL} (balance, created_by, updated_dt)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE balance = VALUES(balance), updated_dt = VALUES(updated_dt)`,
        [Number(balance), username, Date.now()]
      );

      return cr.ok(null);
    } catch (err) {
      LoggingUtilities.service.error("ExpenseController.POST /balance", toMessage(err));
      return cr.ko("Failed to save balance");
    }
  });

  // POST /api/expense/transaction — create
  router.post("/transaction", async (req: RequestWithUserInfo, res: Response) => {
    const cr = new ControllerResponse(res);
    try {
      const username = req.user!.username;
      const { type, amount, description, category, date, notes, cardId } = req.body;

      if (!type || amount == null || !description || !category || !date) {
        return cr.badRequest("type, amount, description, category, and date are required");
      }
      if (!["expense", "earning"].includes(type)) {
        return cr.badRequest("Invalid type");
      }

      const inserted = await db.insert<ITB_EXPENSE_TRANSACTION>(TABLE_TX, {
        type,
        amount: Number(amount),
        description: String(description).trim(),
        category,
        date,
        notes: notes ?? null,
        card_id: cardId ?? null,
        created_by: username,
        created_dt: Date.now(),
        record_status: "A",
      });

      return cr.ok(mapTx(inserted));
    } catch (err) {
      LoggingUtilities.service.error("ExpenseController.POST /transaction", toMessage(err));
      return cr.ko("Failed to create transaction");
    }
  });

  // POST /api/expense/transaction/update
  router.post("/transaction/update", async (req: RequestWithUserInfo, res: Response) => {
    const cr = new ControllerResponse(res);
    try {
      const username = req.user!.username;
      const { id, type, amount, description, category, date, notes, cardId } = req.body;

      if (!id || !type || amount == null || !description || !category || !date) {
        return cr.badRequest("id, type, amount, description, category, and date are required");
      }

      const existing = await db.findOne<ITB_EXPENSE_TRANSACTION>(TABLE_TX, { id, created_by: username, record_status: "A" });
      if (!existing) return cr.result(404, "Not Found", "Transaction not found");

      const updated = await db.update<ITB_EXPENSE_TRANSACTION>(TABLE_TX, { id }, {
        type,
        amount: Number(amount),
        description: String(description).trim(),
        category,
        date,
        notes: notes ?? null,
        card_id: cardId ?? null,
      });

      return cr.ok(mapTx(updated[0]));
    } catch (err) {
      LoggingUtilities.service.error("ExpenseController.POST /transaction/update", toMessage(err));
      return cr.ko("Failed to update transaction");
    }
  });

  // POST /api/expense/transaction/delete
  router.post("/transaction/delete", async (req: RequestWithUserInfo, res: Response) => {
    const cr = new ControllerResponse(res);
    try {
      const username = req.user!.username;
      const { id } = req.body;

      if (!id) return cr.badRequest("id is required");

      const existing = await db.findOne<ITB_EXPENSE_TRANSACTION>(TABLE_TX, { id, created_by: username, record_status: "A" });
      if (!existing) return cr.result(404, "Not Found", "Transaction not found");

      await db.update<ITB_EXPENSE_TRANSACTION>(TABLE_TX, { id }, { record_status: "D" });

      return cr.ok(null);
    } catch (err) {
      LoggingUtilities.service.error("ExpenseController.POST /transaction/delete", toMessage(err));
      return cr.ko("Failed to delete transaction");
    }
  });

  // POST /api/expense/card — create
  router.post("/card", async (req: RequestWithUserInfo, res: Response) => {
    const cr = new ControllerResponse(res);
    try {
      const username = req.user!.username;
      const { name, cycleEndDay, dueDay, color } = req.body;

      if (!name || cycleEndDay == null || dueDay == null || !color) {
        return cr.badRequest("name, cycleEndDay, dueDay, and color are required");
      }

      const inserted = await db.insert<ITB_EXPENSE_CARD>(TABLE_CARD, {
        name: String(name).trim(),
        cycle_end_day: Number(cycleEndDay),
        due_day: Number(dueDay),
        color,
        created_by: username,
        created_dt: Date.now(),
        record_status: "A",
      });

      return cr.ok(mapCard(inserted));
    } catch (err) {
      LoggingUtilities.service.error("ExpenseController.POST /card", toMessage(err));
      return cr.ko("Failed to create card");
    }
  });

  // POST /api/expense/card/update
  router.post("/card/update", async (req: RequestWithUserInfo, res: Response) => {
    const cr = new ControllerResponse(res);
    try {
      const username = req.user!.username;
      const { id, name, cycleEndDay, dueDay, color } = req.body;

      if (!id || !name || cycleEndDay == null || dueDay == null || !color) {
        return cr.badRequest("id, name, cycleEndDay, dueDay, and color are required");
      }

      const existing = await db.findOne<ITB_EXPENSE_CARD>(TABLE_CARD, { id, created_by: username, record_status: "A" });
      if (!existing) return cr.result(404, "Not Found", "Card not found");

      const updated = await db.update<ITB_EXPENSE_CARD>(TABLE_CARD, { id }, {
        name: String(name).trim(),
        cycle_end_day: Number(cycleEndDay),
        due_day: Number(dueDay),
        color,
      });

      return cr.ok(mapCard(updated[0]));
    } catch (err) {
      LoggingUtilities.service.error("ExpenseController.POST /card/update", toMessage(err));
      return cr.ko("Failed to update card");
    }
  });

  // POST /api/expense/card/delete
  router.post("/card/delete", async (req: RequestWithUserInfo, res: Response) => {
    const cr = new ControllerResponse(res);
    try {
      const username = req.user!.username;
      const { id } = req.body;

      if (!id) return cr.badRequest("id is required");

      const existing = await db.findOne<ITB_EXPENSE_CARD>(TABLE_CARD, { id, created_by: username, record_status: "A" });
      if (!existing) return cr.result(404, "Not Found", "Card not found");

      // Soft-delete card and null out its references on the user's transactions
      await db.update<ITB_EXPENSE_CARD>(TABLE_CARD, { id }, { record_status: "D" });
      await db.raw(
        `UPDATE ${TABLE_TX} SET card_id = NULL WHERE card_id = ? AND created_by = ? AND record_status = 'A'`,
        [id, username]
      );

      return cr.ok(null);
    } catch (err) {
      LoggingUtilities.service.error("ExpenseController.POST /card/delete", toMessage(err));
      return cr.ko("Failed to delete card");
    }
  });

  return router;
}
