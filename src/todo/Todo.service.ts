import crypto from "crypto";
import KnexSqlUtilities from "../utils/KnexSqlUtilities.js";
import { ITB_TODO_TASK } from "../models/databases/tb_todo_task.js";
import { Exceptions } from "../exceptions/AppExceptions.js";
import { UpdateTodoBody } from "./Todo.validator.js";

const TB_TODO_TASK = "tb_todo_task";
export const TODO_MAX_PINNED = 3;
const WIDGET_TASK_LIMIT = 3;

function buildResponse(task: ITB_TODO_TASK) {
  return {
    id: task.uuid,
    title: task.title,
    done: !!task.done,
    doneAt: task.done_dt != null ? Number(task.done_dt) : null,
    pinned: !!task.pinned,
    createdAt: Number(task.created_dt),
    sortOrder: task.sort_order,
  };
}

export class TodoService {
  constructor(private db: KnexSqlUtilities) {}

  private async loadOrThrow(userId: number, uuid: string, status: "A" | "D" = "A"): Promise<ITB_TODO_TASK> {
    const task = (await this.db.findOne<ITB_TODO_TASK>(TB_TODO_TASK, {
      uuid,
      created_by_id: userId,
      record_status: status,
    })) as ITB_TODO_TASK | undefined;
    if (!task) throw new Exceptions.NotFound();
    return task;
  }

  private async pinnedCount(userId: number): Promise<number> {
    return this.db.count<ITB_TODO_TASK>(TB_TODO_TASK, { created_by_id: userId, record_status: "A", pinned: 1 });
  }

  async list(userId: number): Promise<{ tasks: any[] }> {
    const rows = await this.db.find<ITB_TODO_TASK>(
      TB_TODO_TASK,
      { created_by_id: userId, record_status: "A" },
      { orderBy: "sort_order", orderDirection: "asc" },
    );
    return { tasks: rows.map(buildResponse) };
  }

  async create(userId: number, title: string): Promise<any> {
    const last = await this.db.find<ITB_TODO_TASK>(
      TB_TODO_TASK,
      { created_by_id: userId },
      { orderBy: "sort_order", orderDirection: "desc", limit: 1, columns: ["sort_order"] },
    );
    const task = await this.db.insert<ITB_TODO_TASK>(TB_TODO_TASK, {
      uuid: crypto.randomUUID(),
      title,
      done: 0,
      done_dt: null,
      pinned: 0,
      sort_order: (last[0]?.sort_order ?? 0) + 1,
      record_status: "A",
      created_dt: Date.now(),
      created_by_id: userId,
    });
    return buildResponse(task);
  }

  async update(userId: number, uuid: string, input: UpdateTodoBody): Promise<any> {
    const existing = await this.loadOrThrow(userId, uuid);
    const patch: Partial<ITB_TODO_TASK> = { updated_dt: Date.now(), updated_by_id: userId };

    if (input.title !== undefined) patch.title = input.title;

    if (input.done !== undefined && input.done !== !!existing.done) {
      patch.done = input.done ? 1 : 0;
      patch.done_dt = input.done ? Date.now() : null;
    }
    const willBeDone = patch.done !== undefined ? !!patch.done : !!existing.done;

    // Completing a task un-pins it; done tasks can't be pinned.
    if (willBeDone) {
      patch.pinned = 0;
    } else if (input.pinned !== undefined && input.pinned !== !!existing.pinned) {
      if (input.pinned && (await this.pinnedCount(userId)) >= TODO_MAX_PINNED) {
        throw new Exceptions.InvalidRequest("pin limit reached");
      }
      patch.pinned = input.pinned ? 1 : 0;
    }

    const [updated] = await this.db.update<ITB_TODO_TASK>(TB_TODO_TASK, { uuid, created_by_id: userId }, patch);
    return buildResponse(updated);
  }

  async delete(userId: number, uuid: string): Promise<{ deleted: true }> {
    await this.loadOrThrow(userId, uuid);
    await this.db.update<ITB_TODO_TASK>(
      TB_TODO_TASK,
      { uuid, created_by_id: userId },
      { record_status: "D", updated_dt: Date.now(), updated_by_id: userId },
    );
    return { deleted: true };
  }

  // The undo window is enforced client-side; this just flips the soft-delete flag back.
  async restore(userId: number, uuid: string): Promise<any> {
    const existing = await this.loadOrThrow(userId, uuid, "D");
    const patch: Partial<ITB_TODO_TASK> = { record_status: "A", updated_dt: Date.now(), updated_by_id: userId };
    // A pin taken since the delete may have used up the cap.
    if (existing.pinned && (await this.pinnedCount(userId)) >= TODO_MAX_PINNED) patch.pinned = 0;
    const [restored] = await this.db.update<ITB_TODO_TASK>(TB_TODO_TASK, { uuid, created_by_id: userId }, patch);
    return buildResponse(restored);
  }

  // Receives the client's full manual order; ids it doesn't know about are ignored.
  async reorder(userId: number, ids: string[]): Promise<{ tasks: any[] }> {
    await this.db.transaction(async (trx) => {
      for (let i = 0; i < ids.length; i++) {
        await trx(TB_TODO_TASK)
          .where({ uuid: ids[i], created_by_id: userId, record_status: "A" })
          .update({ sort_order: i + 1, updated_dt: Date.now(), updated_by_id: userId });
      }
    });
    return this.list(userId);
  }

  // Read-only payload for the Scriptable lock-screen widget: pinned first, then
  // oldest open tasks, at most WIDGET_TASK_LIMIT titles.
  async widget(userId: number): Promise<{ tasks: string[]; openCount: number }> {
    const rows = await this.db.find<ITB_TODO_TASK>(
      TB_TODO_TASK,
      { created_by_id: userId, record_status: "A", done: 0 },
      { orderBy: "sort_order", orderDirection: "asc" },
    );
    const ordered = [...rows.filter((r) => r.pinned), ...rows.filter((r) => !r.pinned)];
    return { tasks: ordered.slice(0, WIDGET_TASK_LIMIT).map((r) => r.title), openCount: rows.length };
  }
}
