import crypto from "crypto";
import KnexSqlUtilities from "../utils/KnexSqlUtilities.js";
import { ITB_BUDGET_TABLE, BudgetTemplate } from "../models/databases/tb_budget_table.js";
import { ITB_BUDGET_ITEM, BudgetItemStatus } from "../models/databases/tb_budget_item.js";
import { ITB_BUDGET_COLLABORATOR } from "../models/databases/tb_budget_collaborator.js";
import { ITB_AA_USER } from "../models/databases/tb_aa_user.js";
import { Exceptions } from "../exceptions/AppExceptions.js";

const TB_BUDGET_TABLE = "tb_budget_table";
const TB_BUDGET_ITEM = "tb_budget_item";
const TB_BUDGET_COLLABORATOR = "tb_budget_collaborator";
const TB_AA_USER = "tb_aa_user";

export function generateSessionId(): string {
  return crypto.randomUUID();
}

function buildItemResponse(item: ITB_BUDGET_ITEM) {
  return {
    id: item.uuid,
    name: item.name,
    category: item.category ?? undefined,
    status: item.status,
    budgetAmount: item.budget_amount != null ? Number(item.budget_amount) : undefined,
    actualAmount: item.actual_amount != null ? Number(item.actual_amount) : undefined,
    notes: item.notes ?? undefined,
    sortOrder: item.sort_order,
  };
}

function buildCollaboratorResponse(collaborator: ITB_BUDGET_COLLABORATOR & { username?: string; email?: string }) {
  return {
    userId: collaborator.user_id,
    username: collaborator.username,
    email: collaborator.email,
  };
}

export class BudgetService {
  constructor(private db: KnexSqlUtilities) {}

  // ─── Access control ──────────────────────────────────────────────────────────

  private async assertAccess(userId: number, table: ITB_BUDGET_TABLE): Promise<boolean> {
    if (table.created_by_id === userId) return true;
    const collaborator = await this.db.findOne<ITB_BUDGET_COLLABORATOR>(TB_BUDGET_COLLABORATOR, {
      table_id: table.id!,
      user_id: userId,
      record_status: "A",
    });
    if (!collaborator) throw new Exceptions.ForbiddenAccess();
    return false;
  }

  private async loadTableOrThrow(sessionId: string): Promise<ITB_BUDGET_TABLE> {
    const table = (await this.db.findOne<ITB_BUDGET_TABLE>(TB_BUDGET_TABLE, {
      session_id: sessionId,
      record_status: "A",
    })) as ITB_BUDGET_TABLE | undefined;
    if (!table) throw new Exceptions.NotFound();
    return table;
  }

  // ─── Tables ──────────────────────────────────────────────────────────────────

  async listTables(userId: number): Promise<{ myTables: any[]; sharedTables: any[] }> {
    const owned = await this.db.find<ITB_BUDGET_TABLE>(
      TB_BUDGET_TABLE,
      { record_status: "A", created_by_id: userId },
      { orderBy: "created_dt", orderDirection: "desc" },
    );

    const collaborations = await this.db.find<ITB_BUDGET_COLLABORATOR>(TB_BUDGET_COLLABORATOR, {
      user_id: userId,
      record_status: "A",
    });
    const sharedTableIds = collaborations.map((c) => c.table_id);
    const shared = sharedTableIds.length
      ? await this.db.find<ITB_BUDGET_TABLE>(
          TB_BUDGET_TABLE,
          { record_status: "A" },
          { extraWhere: (qb) => qb.whereIn("id", sharedTableIds), orderBy: "created_dt", orderDirection: "desc" },
        )
      : [];

    const summarise = async (t: ITB_BUDGET_TABLE) => {
      const items = await this.db.find<ITB_BUDGET_ITEM>(TB_BUDGET_ITEM, { table_id: t.id!, record_status: "A" });
      const sumBudget = items.reduce((acc, i) => acc + (i.budget_amount != null ? Number(i.budget_amount) : 0), 0);
      const sumActual = items.reduce((acc, i) => acc + (i.actual_amount != null ? Number(i.actual_amount) : 0), 0);
      return {
        sessionId: t.session_id,
        name: t.name,
        template: t.template,
        createdDt: t.created_dt,
        itemCount: items.length,
        sumBudget,
        sumActual,
      };
    };

    return {
      myTables: await Promise.all(owned.map(summarise)),
      sharedTables: await Promise.all(shared.map(summarise)),
    };
  }

  async createTable(userId: number, name: string, template: BudgetTemplate): Promise<{ sessionId: string }> {
    const table = await this.db.insert<ITB_BUDGET_TABLE>(TB_BUDGET_TABLE, {
      session_id: generateSessionId(),
      name,
      template,
      created_dt: Date.now(),
      created_by_id: userId,
      record_status: "A",
    });
    return { sessionId: table.session_id };
  }

  async renameTable(userId: number, sessionId: string, name: string): Promise<void> {
    const table = await this.loadTableOrThrow(sessionId);
    if (table.created_by_id !== userId) throw new Exceptions.ForbiddenAccess();
    await this.db.update<ITB_BUDGET_TABLE>(TB_BUDGET_TABLE, { id: table.id! }, { name });
  }

  async deleteTable(userId: number, sessionId: string): Promise<void> {
    const table = await this.loadTableOrThrow(sessionId);
    if (table.created_by_id !== userId) throw new Exceptions.ForbiddenAccess();
    await this.db.update<ITB_BUDGET_TABLE>(TB_BUDGET_TABLE, { id: table.id! }, { record_status: "D" });
    await this.db.update<ITB_BUDGET_ITEM>(TB_BUDGET_ITEM, { table_id: table.id! }, { record_status: "D" });
  }

  async getBySessionId(userId: number, sessionId: string): Promise<any> {
    const table = await this.loadTableOrThrow(sessionId);
    const isOwner = await this.assertAccess(userId, table);

    const items = await this.db.find<ITB_BUDGET_ITEM>(
      TB_BUDGET_ITEM,
      { table_id: table.id!, record_status: "A" },
      { orderBy: "sort_order", orderDirection: "asc" },
    );

    const collaborators = await this.db.raw<(ITB_BUDGET_COLLABORATOR & { username: string; email: string })[]>(
      `SELECT c.user_id, u.username, u.email
       FROM tb_budget_collaborator c
       JOIN tb_aa_user u ON u.id = c.user_id
       WHERE c.table_id = ? AND c.record_status = 'A'`,
      [table.id!],
    );

    return {
      sessionId: table.session_id,
      name: table.name,
      template: table.template,
      createdDt: table.created_dt,
      isOwner,
      items: items.map(buildItemResponse),
      collaborators: collaborators.map(buildCollaboratorResponse),
    };
  }

  // ─── Items ───────────────────────────────────────────────────────────────────

  async createItem(
    userId: number,
    sessionId: string,
    input: {
      name: string;
      category?: string;
      status?: BudgetItemStatus;
      budgetAmount?: number;
      actualAmount?: number;
      notes?: string;
    },
  ): Promise<any> {
    const table = await this.loadTableOrThrow(sessionId);
    await this.assertAccess(userId, table);

    const maxSortOrder = await this.db.find<ITB_BUDGET_ITEM>(
      TB_BUDGET_ITEM,
      { table_id: table.id!, record_status: "A" },
      { orderBy: "sort_order", orderDirection: "desc", limit: 1, columns: ["sort_order"] },
    );

    const item = await this.db.insert<ITB_BUDGET_ITEM>(TB_BUDGET_ITEM, {
      uuid: crypto.randomUUID(),
      table_id: table.id!,
      name: input.name,
      category: input.category ?? null,
      status: input.status ?? "to_buy",
      budget_amount: input.budgetAmount ?? null,
      actual_amount: input.actualAmount ?? null,
      notes: input.notes ?? null,
      sort_order: (maxSortOrder[0]?.sort_order ?? -1) + 1,
      created_dt: Date.now(),
      created_by_id: userId,
      record_status: "A",
    });

    return buildItemResponse(item);
  }

  async editItem(
    userId: number,
    sessionId: string,
    itemUuid: string,
    input: {
      name?: string;
      category?: string;
      status?: BudgetItemStatus;
      budgetAmount?: number | null;
      actualAmount?: number | null;
      notes?: string;
    },
  ): Promise<any> {
    const table = await this.loadTableOrThrow(sessionId);
    await this.assertAccess(userId, table);

    const existing = (await this.db.findOne<ITB_BUDGET_ITEM>(TB_BUDGET_ITEM, {
      uuid: itemUuid,
      table_id: table.id!,
      record_status: "A",
    })) as ITB_BUDGET_ITEM | undefined;
    if (!existing) throw new Exceptions.NotFound();

    const update: Partial<ITB_BUDGET_ITEM> = {};
    if (input.name !== undefined) update.name = input.name;
    if (input.category !== undefined) update.category = input.category;
    if (input.status !== undefined) update.status = input.status;
    if (input.budgetAmount !== undefined) update.budget_amount = input.budgetAmount;
    if (input.actualAmount !== undefined) update.actual_amount = input.actualAmount;
    if (input.notes !== undefined) update.notes = input.notes;

    const [updated] = await this.db.update<ITB_BUDGET_ITEM>(TB_BUDGET_ITEM, { uuid: itemUuid }, update);
    return buildItemResponse(updated);
  }

  async deleteItem(userId: number, sessionId: string, itemUuid: string): Promise<void> {
    const table = await this.loadTableOrThrow(sessionId);
    await this.assertAccess(userId, table);

    const existing = (await this.db.findOne<ITB_BUDGET_ITEM>(TB_BUDGET_ITEM, {
      uuid: itemUuid,
      table_id: table.id!,
      record_status: "A",
    })) as ITB_BUDGET_ITEM | undefined;
    if (!existing) throw new Exceptions.NotFound();

    await this.db.update<ITB_BUDGET_ITEM>(TB_BUDGET_ITEM, { uuid: itemUuid }, { record_status: "D" });
  }

  // Undo window is enforced client-side (10s) — this just flips the soft-delete
  // flag back, same as any other edit, so a stale/expired undo click still
  // works rather than silently failing.
  async restoreItem(userId: number, sessionId: string, itemUuid: string): Promise<any> {
    const table = await this.loadTableOrThrow(sessionId);
    await this.assertAccess(userId, table);

    const existing = (await this.db.findOne<ITB_BUDGET_ITEM>(TB_BUDGET_ITEM, {
      uuid: itemUuid,
      table_id: table.id!,
      record_status: "D",
    })) as ITB_BUDGET_ITEM | undefined;
    if (!existing) throw new Exceptions.NotFound();

    const [restored] = await this.db.update<ITB_BUDGET_ITEM>(TB_BUDGET_ITEM, { uuid: itemUuid }, { record_status: "A" });
    return buildItemResponse(restored);
  }

  // ─── Collaborators ───────────────────────────────────────────────────────────

  async addCollaborator(userId: number, sessionId: string, email: string): Promise<any> {
    const table = await this.loadTableOrThrow(sessionId);
    if (table.created_by_id !== userId) throw new Exceptions.ForbiddenAccess();

    const invitee = (await this.db.findOne<ITB_AA_USER>(TB_AA_USER, {
      email,
      record_status: "A",
    })) as ITB_AA_USER | undefined;
    if (!invitee) throw new Exceptions.NotFound();
    if (invitee.id === userId) throw new Exceptions.InvalidRequest("email", "format");

    const existing = (await this.db.findOne<ITB_BUDGET_COLLABORATOR>(TB_BUDGET_COLLABORATOR, {
      table_id: table.id!,
      user_id: invitee.id!,
    })) as ITB_BUDGET_COLLABORATOR | undefined;

    if (existing) {
      if (existing.record_status !== "A") {
        await this.db.update<ITB_BUDGET_COLLABORATOR>(
          TB_BUDGET_COLLABORATOR,
          { id: existing.id! },
          { record_status: "A", added_by_id: userId },
        );
      }
    } else {
      await this.db.insert<ITB_BUDGET_COLLABORATOR>(TB_BUDGET_COLLABORATOR, {
        table_id: table.id!,
        user_id: invitee.id!,
        added_by_id: userId,
        created_dt: Date.now(),
        record_status: "A",
      });
    }

    return { userId: invitee.id, username: invitee.username, email: invitee.email };
  }

  async removeCollaborator(userId: number, sessionId: string, collaboratorUserId: number): Promise<void> {
    const table = await this.loadTableOrThrow(sessionId);
    if (table.created_by_id !== userId) throw new Exceptions.ForbiddenAccess();

    await this.db.update<ITB_BUDGET_COLLABORATOR>(
      TB_BUDGET_COLLABORATOR,
      { table_id: table.id!, user_id: collaboratorUserId },
      { record_status: "D" },
    );
  }
}
