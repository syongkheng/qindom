import KnexSqlUtilities from "../utils/KnexSqlUtilities";
import { ITB_EXPENSE_TRANSACTION } from "../models/databases/tb_expense_transaction";
import { ITB_EXPENSE_CARD } from "../models/databases/tb_expense_card";
import { ITB_EXPENSE_BALANCE } from "../models/databases/tb_expense_balance";
import { Exceptions } from "../exceptions/AppExceptions";

const TB_EXPENSE_TRANSACTION = "tb_expense_transaction";
const TB_EXPENSE_CARD        = "tb_expense_card";
const TB_EXPENSE_BALANCE     = "tb_expense_balance";

export interface TxDto {
  id:          number | undefined;
  type:        string;
  amount:      number;
  description: string;
  category:    string;
  date:        string;
  notes:       string | null;
  cardId:      number | null;
  createdAt:   number;
}

export interface CardDto {
  id:              number | undefined;
  name:            string;
  cycleEndDay:     number;
  dueDay:          number;
  color:           string;
  cycleStartDate:  string | null;
  dueDate:         string | null;
}

export interface CreateTxBody {
  type:        string;
  amount:      number;
  description: string;
  category:    string;
  date:        string;
  notes?:      string | null;
  cardId?:     number | null;
}

export interface CardBody {
  name:            string;
  cycleEndDay:     number;
  dueDay:          number;
  color:           string;
  cycleStartDate?: string | null;
  dueDate?:        string | null;
}

export class ExpenseService {
  constructor(private db: KnexSqlUtilities) {}

  // ─── Mappers ────────────────────────────────────────────────────────────────

  private mapTx(row: ITB_EXPENSE_TRANSACTION): TxDto {
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

  private mapCard(row: ITB_EXPENSE_CARD): CardDto {
    return {
      id:             row.id,
      name:           row.name,
      cycleEndDay:    row.cycle_end_day,
      dueDay:         row.due_day,
      color:          row.color,
      cycleStartDate: row.cycle_start_date ?? null,
      dueDate:        row.due_date ?? null,
    };
  }

  // ─── Init ───────────────────────────────────────────────────────────────────

  async init(username: string): Promise<{ balance: number; transactions: TxDto[]; cards: CardDto[] }> {
    const [balRow, txRows, cardRows] = await Promise.all([
      this.db.findOne<ITB_EXPENSE_BALANCE>(TB_EXPENSE_BALANCE, { created_by: username }),
      this.db.find<ITB_EXPENSE_TRANSACTION>(
        TB_EXPENSE_TRANSACTION,
        { created_by: username, record_status: "A" },
        { orderBy: "date", orderDirection: "desc" }
      ),
      this.db.find<ITB_EXPENSE_CARD>(
        TB_EXPENSE_CARD,
        { created_by: username, record_status: "A" },
        { orderBy: "created_dt", orderDirection: "asc" }
      ),
    ]);

    return {
      balance:      balRow ? Number(balRow.balance) : 0,
      transactions: txRows.map((r) => this.mapTx(r)),
      cards:        cardRows.map((r) => this.mapCard(r)),
    };
  }

  // ─── Balance ────────────────────────────────────────────────────────────────

  async upsertBalance(username: string, balance: number): Promise<void> {
    await this.db.raw(
      `INSERT INTO ${TB_EXPENSE_BALANCE} (balance, created_by, updated_dt)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE balance = VALUES(balance), updated_dt = VALUES(updated_dt)`,
      [balance, username, Date.now()]
    );
  }

  // ─── Helpers ────────────────────────────────────────────────────────────────

  private async verifyCardOwnership(username: string, cardId: number): Promise<void> {
    const card = await this.db.findOne<ITB_EXPENSE_CARD>(TB_EXPENSE_CARD, {
      id: cardId,
      created_by: username,
      record_status: "A",
    });
    if (!card) throw new Exceptions.NotFound();
  }

  // ─── Transactions ───────────────────────────────────────────────────────────

  async createTransaction(username: string, body: CreateTxBody): Promise<TxDto> {
    if (body.cardId != null) await this.verifyCardOwnership(username, body.cardId);
    const inserted = await this.db.insert<ITB_EXPENSE_TRANSACTION>(TB_EXPENSE_TRANSACTION, {
      type:          body.type,
      amount:        body.amount,
      description:   body.description.trim(),
      category:      body.category,
      date:          body.date,
      notes:         body.notes ?? null,
      card_id:       body.cardId ?? null,
      created_by:    username,
      created_dt:    Date.now(),
      record_status: "A",
    });
    return this.mapTx(inserted);
  }

  async updateTransaction(
    username: string,
    id: number,
    body: CreateTxBody
  ): Promise<TxDto | null> {
    const existing = await this.db.findOne<ITB_EXPENSE_TRANSACTION>(TB_EXPENSE_TRANSACTION, {
      id,
      created_by:    username,
      record_status: "A",
    });
    if (!existing) return null;

    if (body.cardId != null) await this.verifyCardOwnership(username, body.cardId);

    const updated = await this.db.update<ITB_EXPENSE_TRANSACTION>(TB_EXPENSE_TRANSACTION, { id }, {
      type:        body.type,
      amount:      body.amount,
      description: body.description.trim(),
      category:    body.category,
      date:        body.date,
      notes:       body.notes ?? null,
      card_id:     body.cardId ?? null,
    });
    return this.mapTx(updated[0]);
  }

  async deleteTransaction(username: string, id: number): Promise<boolean> {
    const existing = await this.db.findOne<ITB_EXPENSE_TRANSACTION>(TB_EXPENSE_TRANSACTION, {
      id,
      created_by:    username,
      record_status: "A",
    });
    if (!existing) return false;

    await this.db.update<ITB_EXPENSE_TRANSACTION>(TB_EXPENSE_TRANSACTION, { id }, { record_status: "D" });
    return true;
  }

  // ─── Cards ──────────────────────────────────────────────────────────────────

  async createCard(username: string, body: CardBody): Promise<CardDto> {
    const inserted = await this.db.insert<ITB_EXPENSE_CARD>(TB_EXPENSE_CARD, {
      name:             body.name.trim(),
      cycle_end_day:    body.cycleEndDay,
      due_day:          body.dueDay,
      color:            body.color,
      cycle_start_date: body.cycleStartDate ?? null,
      due_date:         body.dueDate ?? null,
      created_by:       username,
      created_dt:       Date.now(),
      record_status:    "A",
    });
    return this.mapCard(inserted);
  }

  async updateCard(username: string, id: number, body: CardBody): Promise<CardDto | null> {
    const existing = await this.db.findOne<ITB_EXPENSE_CARD>(TB_EXPENSE_CARD, {
      id,
      created_by:    username,
      record_status: "A",
    });
    if (!existing) return null;

    const updated = await this.db.update<ITB_EXPENSE_CARD>(TB_EXPENSE_CARD, { id }, {
      name:             body.name.trim(),
      cycle_end_day:    body.cycleEndDay,
      due_day:          body.dueDay,
      color:            body.color,
      cycle_start_date: body.cycleStartDate ?? null,
      due_date:         body.dueDate ?? null,
    });
    return this.mapCard(updated[0]);
  }

  async deleteCard(username: string, id: number): Promise<boolean> {
    const existing = await this.db.findOne<ITB_EXPENSE_CARD>(TB_EXPENSE_CARD, {
      id,
      created_by:    username,
      record_status: "A",
    });
    if (!existing) return false;

    await this.db.update<ITB_EXPENSE_CARD>(TB_EXPENSE_CARD, { id }, { record_status: "D" });
    await this.db.raw(
      `UPDATE ${TB_EXPENSE_TRANSACTION} SET card_id = NULL WHERE card_id = ? AND created_by = ? AND record_status = 'A'`,
      [id, username]
    );
    return true;
  }
}
