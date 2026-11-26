import crypto from "crypto";
import KnexSqlUtilities from "../utils/KnexSqlUtilities.js";
import { ITB_BUDGET_TABLE } from "../models/databases/tb_budget_table.js";
import { ITB_BUDGET_ITEM } from "../models/databases/tb_budget_item.js";
import { ITB_BUDGET_COLLABORATOR } from "../models/databases/tb_budget_collaborator.js";
import { ITB_AA_USER } from "../models/databases/tb_aa_user.js";
import { IRequestLogContext, IRequestLogEvent } from "../models/IRequestLogContext.js";
import { Exceptions } from "../exceptions/AppExceptions.js";
import { RecordStatus } from "../constants/RecordStatus.js";
import { LoggingUtilities } from "../utils/logging/LoggingUtilities.js";
import {
  BudgetCollaboratorDto,
  BudgetCollaboratorRemovedDto,
  BudgetDeletedDto,
  BudgetItemBody,
  BudgetItemDto,
  BudgetItemUpdateBody,
  BudgetLeftDto,
  BudgetRenamedDto,
  BudgetTableCreatedDto,
  BudgetTableDto,
  BudgetTableListDto,
  BudgetTableSummaryDto,
  BudgetTemplate,
} from "./Budget.types.js";

const BUDGET_TABLE_TABLE = "tb_budget_table";
const BUDGET_ITEM_TABLE = "tb_budget_item";
const BUDGET_COLLABORATOR_TABLE = "tb_budget_collaborator";
const USER_TABLE = "tb_aa_user";

const SUMMARY_ITEM_COLUMNS = ["table_id", "budget_amount", "actual_amount"] as const;
const INVITEE_COLUMNS = ["id", "username", "email"];
/** `tb_aa_user.email_verified` of an account that confirmed its email. */
const EMAIL_VERIFIED = 1;

/** One message for every "no usable account" case (unknown, unverified, soft-deleted): no email enumeration. */
const NO_INVITABLE_ACCOUNT = "No account available for that email";
const OWNER_CANNOT_LEAVE = "The owner can't leave their own table";

/**
 * Active collaborator rows whose user row is active too: a soft-deleted user counts as gone
 * (CODING_STYLE §7). Bindings: user status, collaborator status, then the optional filters.
 */
const ACTIVE_COLLABORATORS_SQL = `SELECT c.id, c.table_id, c.user_id, u.username, u.email
       FROM ${BUDGET_COLLABORATOR_TABLE} c
       JOIN ${USER_TABLE} u ON u.id = c.user_id AND u.record_status = ?
       WHERE c.record_status = ?`;

type CollaboratorRow = Pick<ITB_BUDGET_COLLABORATOR, "id" | "table_id" | "user_id"> &
  Pick<ITB_AA_USER, "username" | "email">;
type SummaryItemRow = Pick<ITB_BUDGET_ITEM, "table_id" | "budget_amount" | "actual_amount">;

/** DECIMAL columns come back from mysql2 as strings. */
const toAmount = (value: number | string | null | undefined): number | undefined =>
  value != null ? Number(value) : undefined;

export function toBudgetItemDto(item: ITB_BUDGET_ITEM): BudgetItemDto {
  return {
    id: item.uuid,
    name: item.name,
    category: item.category ?? undefined,
    status: item.status,
    budgetAmount: toAmount(item.budget_amount),
    actualAmount: toAmount(item.actual_amount),
    notes: item.notes ?? undefined,
    sortOrder: item.sort_order,
  };
}

export function toBudgetCollaboratorDto(
  row: Pick<CollaboratorRow, "user_id" | "username" | "email">,
): BudgetCollaboratorDto {
  return { userId: Number(row.user_id), username: row.username, email: row.email };
}

export function toBudgetTableSummaryDto(table: ITB_BUDGET_TABLE, items: SummaryItemRow[]): BudgetTableSummaryDto {
  return {
    sessionId: table.session_id,
    name: table.name,
    template: table.template,
    createdDt: Number(table.created_dt),
    itemCount: items.length,
    sumBudget: items.reduce((acc, i) => acc + (toAmount(i.budget_amount) ?? 0), 0),
    sumActual: items.reduce((acc, i) => acc + (toAmount(i.actual_amount) ?? 0), 0),
  };
}

/**
 * Shared budget tables. Access rules:
 * - owner (`created_by_id`): everything;
 * - active collaborator (collaborator row and user row both active): read the table, create/edit/
 *   delete/restore its items, and leave it;
 * - only the owner renames/deletes the table and adds/removes collaborators;
 * - anyone else: 403 (404 if the table doesn't exist or was deleted).
 * A soft-deleted user is treated as nonexistent everywhere: not listed, no access, not invitable.
 * Items are always looked up inside the table they were addressed through.
 */
export class BudgetService {
  constructor(private db: KnexSqlUtilities) {}

  // ─── Tables ──────────────────────────────────────────────────────────────────

  async listTables(userId: number, logContext?: IRequestLogContext): Promise<BudgetTableListDto> {
    const event = LoggingUtilities.request.branch(logContext, "SERVICE", "List budget tables");
    const owned = await this.db.find<ITB_BUDGET_TABLE>(
      BUDGET_TABLE_TABLE,
      { created_by_id: userId, record_status: RecordStatus.ACTIVE },
      { orderBy: "created_dt", orderDirection: "desc" },
      event,
    );

    const collaborations = await this.activeCollaborators({ userId }, event);
    const sharedTableIds = collaborations.map((c) => c.table_id);
    const shared = sharedTableIds.length
      ? await this.db.find<ITB_BUDGET_TABLE>(
          BUDGET_TABLE_TABLE,
          { record_status: RecordStatus.ACTIVE },
          { extraWhere: (qb) => qb.whereIn("id", sharedTableIds), orderBy: "created_dt", orderDirection: "desc" },
          event,
        )
      : [];

    const itemsByTable = await this.activeItemsByTable([...owned, ...shared], event);
    const summarise = (t: ITB_BUDGET_TABLE) => toBudgetTableSummaryDto(t, itemsByTable.get(Number(t.id)) ?? []);
    return { myTables: owned.map(summarise), sharedTables: shared.map(summarise) };
  }

  async createTable(
    userId: number,
    name: string,
    template: BudgetTemplate,
    logContext?: IRequestLogContext,
  ): Promise<BudgetTableCreatedDto> {
    const event = LoggingUtilities.request.branch(logContext, "SERVICE", "Create budget table");
    const table = await this.db.insert<ITB_BUDGET_TABLE>(
      BUDGET_TABLE_TABLE,
      {
        session_id: crypto.randomUUID(),
        name,
        template,
        created_dt: Date.now(),
        created_by_id: userId,
        record_status: RecordStatus.ACTIVE,
      },
      event,
    );
    return { sessionId: table.session_id };
  }

  async renameTable(
    userId: number,
    sessionId: string,
    name: string,
    logContext?: IRequestLogContext,
  ): Promise<BudgetRenamedDto> {
    const event = LoggingUtilities.request.branch(logContext, "SERVICE", "Rename budget table");
    const table = await this.loadOwnedTable(userId, sessionId, event);
    await this.db.update<ITB_BUDGET_TABLE>(BUDGET_TABLE_TABLE, { id: table.id }, { name }, event);
    return { renamed: true };
  }

  /** Soft-deletes the table and all of its items. Collaborator rows are left as they are. */
  async deleteTable(userId: number, sessionId: string, logContext?: IRequestLogContext): Promise<BudgetDeletedDto> {
    const event = LoggingUtilities.request.branch(logContext, "SERVICE", "Delete budget table");
    const table = await this.loadOwnedTable(userId, sessionId, event);
    await this.db.update<ITB_BUDGET_TABLE>(
      BUDGET_TABLE_TABLE,
      { id: table.id },
      { record_status: RecordStatus.DELETED },
      event,
    );
    await this.db.update<ITB_BUDGET_ITEM>(
      BUDGET_ITEM_TABLE,
      { table_id: table.id },
      { record_status: RecordStatus.DELETED },
      event,
    );
    return { deleted: true };
  }

  async getBySessionId(userId: number, sessionId: string, logContext?: IRequestLogContext): Promise<BudgetTableDto> {
    const event = LoggingUtilities.request.branch(logContext, "SERVICE", "Get budget table");
    const table = await this.loadTable(sessionId, event);
    const isOwner = await this.assertAccess(userId, table, event);

    const items = await this.db.find<ITB_BUDGET_ITEM>(
      BUDGET_ITEM_TABLE,
      { table_id: table.id, record_status: RecordStatus.ACTIVE },
      { orderBy: "sort_order", orderDirection: "asc" },
      event,
    );
    const collaborators = await this.activeCollaborators({ tableId: table.id! }, event);

    return {
      sessionId: table.session_id,
      name: table.name,
      template: table.template,
      createdDt: Number(table.created_dt),
      isOwner,
      items: items.map(toBudgetItemDto),
      collaborators: collaborators.map(toBudgetCollaboratorDto),
    };
  }

  // ─── Items ───────────────────────────────────────────────────────────────────

  async createItem(
    userId: number,
    sessionId: string,
    input: BudgetItemBody,
    logContext?: IRequestLogContext,
  ): Promise<BudgetItemDto> {
    const event = LoggingUtilities.request.branch(logContext, "SERVICE", "Create budget item");
    const table = await this.loadTable(sessionId, event);
    await this.assertAccess(userId, table, event);

    const [last] = await this.db.find<ITB_BUDGET_ITEM>(
      BUDGET_ITEM_TABLE,
      { table_id: table.id, record_status: RecordStatus.ACTIVE },
      { orderBy: "sort_order", orderDirection: "desc", limit: 1, columns: ["sort_order"] },
      event,
    );

    const item = await this.db.insert<ITB_BUDGET_ITEM>(
      BUDGET_ITEM_TABLE,
      {
        uuid: crypto.randomUUID(),
        table_id: table.id,
        name: input.name,
        category: input.category,
        status: input.status,
        budget_amount: input.budgetAmount,
        actual_amount: input.actualAmount,
        notes: input.notes,
        sort_order: (last?.sort_order ?? -1) + 1,
        created_dt: Date.now(),
        created_by_id: userId,
        record_status: RecordStatus.ACTIVE,
      },
      event,
    );
    return toBudgetItemDto(item);
  }

  async editItem(
    userId: number,
    sessionId: string,
    itemUuid: string,
    input: BudgetItemUpdateBody,
    logContext?: IRequestLogContext,
  ): Promise<BudgetItemDto> {
    const event = LoggingUtilities.request.branch(logContext, "SERVICE", "Update budget item");
    const table = await this.loadTable(sessionId, event);
    await this.assertAccess(userId, table, event);
    await this.loadItem(table, itemUuid, RecordStatus.ACTIVE, event);

    const patch: Partial<ITB_BUDGET_ITEM> = {};
    if (input.name !== undefined) patch.name = input.name;
    if (input.category !== undefined) patch.category = input.category;
    if (input.status !== undefined) patch.status = input.status;
    if (input.budgetAmount !== undefined) patch.budget_amount = input.budgetAmount;
    if (input.actualAmount !== undefined) patch.actual_amount = input.actualAmount;
    if (input.notes !== undefined) patch.notes = input.notes;

    const [updated] = await this.db.update<ITB_BUDGET_ITEM>(
      BUDGET_ITEM_TABLE,
      { uuid: itemUuid, table_id: table.id },
      patch,
      event,
    );
    return toBudgetItemDto(updated);
  }

  async deleteItem(
    userId: number,
    sessionId: string,
    itemUuid: string,
    logContext?: IRequestLogContext,
  ): Promise<BudgetDeletedDto> {
    const event = LoggingUtilities.request.branch(logContext, "SERVICE", "Delete budget item");
    const table = await this.loadTable(sessionId, event);
    await this.assertAccess(userId, table, event);
    await this.loadItem(table, itemUuid, RecordStatus.ACTIVE, event);
    await this.db.update<ITB_BUDGET_ITEM>(
      BUDGET_ITEM_TABLE,
      { uuid: itemUuid, table_id: table.id },
      { record_status: RecordStatus.DELETED },
      event,
    );
    return { deleted: true };
  }

  /**
   * Undo of delete. The 10 s undo window is enforced client-side; this just flips the
   * soft-delete flag back, so a late undo click still works rather than silently failing.
   */
  async restoreItem(
    userId: number,
    sessionId: string,
    itemUuid: string,
    logContext?: IRequestLogContext,
  ): Promise<BudgetItemDto> {
    const event = LoggingUtilities.request.branch(logContext, "SERVICE", "Restore budget item");
    const table = await this.loadTable(sessionId, event);
    await this.assertAccess(userId, table, event);
    await this.loadItem(table, itemUuid, RecordStatus.DELETED, event);
    const [restored] = await this.db.update<ITB_BUDGET_ITEM>(
      BUDGET_ITEM_TABLE,
      { uuid: itemUuid, table_id: table.id },
      { record_status: RecordStatus.ACTIVE },
      event,
    );
    return toBudgetItemDto(restored);
  }

  // ─── Collaborators ───────────────────────────────────────────────────────────

  /**
   * Owner only. The invitee needs an active, email-verified account with that email; unknown,
   * unverified and soft-deleted accounts all get the same 404 through the same single lookup, so
   * the answer doesn't reveal which. Inviting yourself is a 400. Re-adding a removed collaborator
   * reactivates them.
   */
  async addCollaborator(
    userId: number,
    sessionId: string,
    email: string,
    logContext?: IRequestLogContext,
  ): Promise<BudgetCollaboratorDto> {
    const event = LoggingUtilities.request.branch(logContext, "SERVICE", "Add budget collaborator");
    const table = await this.loadOwnedTable(userId, sessionId, event);

    const invitee = await this.db.findOne<ITB_AA_USER>(
      USER_TABLE,
      { email, email_verified: EMAIL_VERIFIED, record_status: RecordStatus.ACTIVE },
      INVITEE_COLUMNS,
      event,
    );
    if (!invitee) throw new Exceptions.NotFound(NO_INVITABLE_ACCOUNT);
    if (invitee.id === userId) throw new Exceptions.InvalidRequest("email", "format");

    const existing = await this.db.findOne<ITB_BUDGET_COLLABORATOR>(
      BUDGET_COLLABORATOR_TABLE,
      { table_id: table.id, user_id: invitee.id },
      ["id", "record_status"],
      event,
    );
    if (!existing) {
      await this.db.insert<ITB_BUDGET_COLLABORATOR>(
        BUDGET_COLLABORATOR_TABLE,
        {
          table_id: table.id,
          user_id: invitee.id,
          added_by_id: userId,
          created_dt: Date.now(),
          record_status: RecordStatus.ACTIVE,
        },
        event,
      );
    } else if (existing.record_status !== RecordStatus.ACTIVE) {
      await this.db.update<ITB_BUDGET_COLLABORATOR>(
        BUDGET_COLLABORATOR_TABLE,
        { id: existing.id },
        { record_status: RecordStatus.ACTIVE, added_by_id: userId },
        event,
      );
    }

    return toBudgetCollaboratorDto({ user_id: invitee.id!, username: invitee.username, email: invitee.email });
  }

  /** Owner only. Answers `{ removed: true }` even when the user wasn't a collaborator (idempotent). */
  async removeCollaborator(
    userId: number,
    sessionId: string,
    collaboratorUserId: number,
    logContext?: IRequestLogContext,
  ): Promise<BudgetCollaboratorRemovedDto> {
    const event = LoggingUtilities.request.branch(logContext, "SERVICE", "Remove budget collaborator");
    const table = await this.loadOwnedTable(userId, sessionId, event);
    await this.db.update<ITB_BUDGET_COLLABORATOR>(
      BUDGET_COLLABORATOR_TABLE,
      { table_id: table.id, user_id: collaboratorUserId },
      { record_status: RecordStatus.DELETED },
      event,
    );
    return { removed: true };
  }

  /**
   * A collaborator removes themselves (soft-deletes their own collaborator row). The owner can't
   * leave (they delete the table instead): 403. Not a member: 404.
   */
  async leaveTable(userId: number, sessionId: string, logContext?: IRequestLogContext): Promise<BudgetLeftDto> {
    const event = LoggingUtilities.request.branch(logContext, "SERVICE", "Leave budget table");
    const table = await this.loadTable(sessionId, event);
    if (table.created_by_id === userId) throw new Exceptions.ForbiddenAccess(OWNER_CANNOT_LEAVE);
    const [membership] = await this.activeCollaborators({ tableId: table.id!, userId }, event);
    if (!membership) throw new Exceptions.NotFound();
    await this.db.update<ITB_BUDGET_COLLABORATOR>(
      BUDGET_COLLABORATOR_TABLE,
      { id: membership.id, record_status: RecordStatus.ACTIVE },
      { record_status: RecordStatus.DELETED },
      event,
    );
    return { left: true };
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  /** Active table by session id, or 404. */
  private async loadTable(sessionId: string, event?: IRequestLogEvent): Promise<ITB_BUDGET_TABLE> {
    const table = await this.db.findOne<ITB_BUDGET_TABLE>(
      BUDGET_TABLE_TABLE,
      { session_id: sessionId, record_status: RecordStatus.ACTIVE },
      ["*"],
      event,
    );
    if (!table) throw new Exceptions.NotFound();
    return table;
  }

  /** Active table the caller owns: 404 if missing, 403 for anyone else (collaborators included). */
  private async loadOwnedTable(userId: number, sessionId: string, event?: IRequestLogEvent): Promise<ITB_BUDGET_TABLE> {
    const table = await this.loadTable(sessionId, event);
    if (table.created_by_id !== userId) throw new Exceptions.ForbiddenAccess();
    return table;
  }

  /** Owner or active collaborator (with an active user row), else 403. Returns whether the caller is the owner. */
  private async assertAccess(userId: number, table: ITB_BUDGET_TABLE, event?: IRequestLogEvent): Promise<boolean> {
    if (table.created_by_id === userId) return true;
    const [collaborator] = await this.activeCollaborators({ tableId: table.id!, userId }, event);
    if (!collaborator) throw new Exceptions.ForbiddenAccess();
    return false;
  }

  /** Active collaborations of active users in one table and/or of one user (at least one filter is required). */
  private async activeCollaborators(
    { tableId, userId }: { tableId: number; userId?: number } | { tableId?: undefined; userId: number },
    event?: IRequestLogEvent,
  ): Promise<CollaboratorRow[]> {
    let sql = ACTIVE_COLLABORATORS_SQL;
    const bindings: unknown[] = [RecordStatus.ACTIVE, RecordStatus.ACTIVE];
    if (tableId !== undefined) {
      sql += " AND c.table_id = ?";
      bindings.push(tableId);
    }
    if (userId !== undefined) {
      sql += " AND c.user_id = ?";
      bindings.push(userId);
    }
    return this.db.raw<CollaboratorRow[]>(sql, bindings, event);
  }

  /** Item in this table with the given status, or 404. */
  private async loadItem(
    table: ITB_BUDGET_TABLE,
    itemUuid: string,
    status: RecordStatus,
    event?: IRequestLogEvent,
  ): Promise<void> {
    const item = await this.db.findOne<ITB_BUDGET_ITEM>(
      BUDGET_ITEM_TABLE,
      { uuid: itemUuid, table_id: table.id, record_status: status },
      ["id"],
      event,
    );
    if (!item) throw new Exceptions.NotFound();
  }

  /** Active items of the given tables in one query, grouped by table id (for the list sums). */
  private async activeItemsByTable(
    tables: ITB_BUDGET_TABLE[],
    event?: IRequestLogEvent,
  ): Promise<Map<number, SummaryItemRow[]>> {
    const byTable = new Map<number, SummaryItemRow[]>();
    if (!tables.length) return byTable;
    const items: SummaryItemRow[] = await this.db.find<ITB_BUDGET_ITEM>(
      BUDGET_ITEM_TABLE,
      { record_status: RecordStatus.ACTIVE },
      {
        columns: SUMMARY_ITEM_COLUMNS,
        extraWhere: (qb) =>
          qb.whereIn(
            "table_id",
            tables.map((t) => t.id!),
          ),
      },
      event,
    );
    for (const item of items) {
      const key = Number(item.table_id);
      const group = byTable.get(key);
      if (group) group.push(item);
      else byTable.set(key, [item]);
    }
    return byTable;
  }
}
