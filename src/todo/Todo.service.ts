import crypto from "crypto";
import KnexSqlUtilities from "../utils/KnexSqlUtilities.js";
import { ITB_TODO_TASK } from "../models/databases/tb_todo_task.js";
import { IRequestLogContext, IRequestLogEvent } from "../models/IRequestLogContext.js";
import { Exceptions } from "../exceptions/AppExceptions.js";
import { RecordStatus } from "../constants/RecordStatus.js";
import { LoggingUtilities } from "../utils/logging/LoggingUtilities.js";
import { TodoDeletedDto, TodoListDto, TodoTaskDto, TodoUpdateBody, TodoWidgetDto } from "./Todo.types.js";

const TODO_TASK_TABLE = "tb_todo_task";
/** fndom enforces the same cap client-side (`stores/todo.ts` MAX_PINNED). */
const MAX_PINNED = 3;
const WIDGET_TASK_LIMIT = 3;

function toTaskDto(task: ITB_TODO_TASK): TodoTaskDto {
  return {
    id: task.uuid,
    title: task.title,
    done: !!task.done,
    // BIGINT columns can come back as strings.
    doneAt: task.done_dt != null ? Number(task.done_dt) : null,
    pinned: !!task.pinned,
    createdAt: Number(task.created_dt),
    sortOrder: task.sort_order,
  };
}

/** Personal to-do list. Every query is scoped to `created_by_id = userId`; the uuid is the public id. */
export class TodoService {
  constructor(private db: KnexSqlUtilities) {}

  async list(userId: number, logContext?: IRequestLogContext): Promise<TodoListDto> {
    const event = LoggingUtilities.request.branch(logContext, "SERVICE", "List tasks");
    return { tasks: (await this.activeTasks(userId, event)).map(toTaskDto) };
  }

  async create(userId: number, title: string, logContext?: IRequestLogContext): Promise<TodoTaskDto> {
    const event = LoggingUtilities.request.branch(logContext, "SERVICE", "Create task");
    // Includes deleted rows on purpose so sort_order only ever grows.
    const [last] = await this.db.find<ITB_TODO_TASK>(
      TODO_TASK_TABLE,
      { created_by_id: userId },
      { orderBy: "sort_order", orderDirection: "desc", limit: 1, columns: ["sort_order"] },
      event,
    );
    const task = await this.db.insert<ITB_TODO_TASK>(
      TODO_TASK_TABLE,
      {
        uuid: crypto.randomUUID(),
        title,
        done: 0,
        done_dt: null,
        pinned: 0,
        sort_order: (last?.sort_order ?? 0) + 1,
        record_status: RecordStatus.ACTIVE,
        created_dt: Date.now(),
        created_by_id: userId,
      },
      event,
    );
    return toTaskDto(task);
  }

  /** Completing a task sets done_dt and un-pins it; done tasks can't be pinned; at most MAX_PINNED pins. */
  async update(
    userId: number,
    uuid: string,
    input: TodoUpdateBody,
    logContext?: IRequestLogContext,
  ): Promise<TodoTaskDto> {
    const event = LoggingUtilities.request.branch(logContext, "SERVICE", "Update task");
    const existing = await this.loadOrThrow(userId, uuid, RecordStatus.ACTIVE, event);
    const now = Date.now();
    const patch: Partial<ITB_TODO_TASK> = { updated_dt: now, updated_by_id: userId };

    if (input.title !== undefined) patch.title = input.title;

    if (input.done !== undefined && input.done !== !!existing.done) {
      patch.done = input.done ? 1 : 0;
      patch.done_dt = input.done ? now : null;
    }
    const willBeDone = patch.done !== undefined ? !!patch.done : !!existing.done;

    if (willBeDone) {
      patch.pinned = 0;
    } else if (input.pinned !== undefined && input.pinned !== !!existing.pinned) {
      if (input.pinned && (await this.pinnedCount(userId, event)) >= MAX_PINNED) {
        throw new Exceptions.InvalidRequest("pinned", "limit");
      }
      patch.pinned = input.pinned ? 1 : 0;
    }

    const [updated] = await this.db.update<ITB_TODO_TASK>(
      TODO_TASK_TABLE,
      { uuid, created_by_id: userId },
      patch,
      event,
    );
    return toTaskDto(updated);
  }

  async delete(userId: number, uuid: string, logContext?: IRequestLogContext): Promise<TodoDeletedDto> {
    const event = LoggingUtilities.request.branch(logContext, "SERVICE", "Delete task");
    await this.loadOrThrow(userId, uuid, RecordStatus.ACTIVE, event);
    await this.db.update<ITB_TODO_TASK>(
      TODO_TASK_TABLE,
      { uuid, created_by_id: userId },
      { record_status: RecordStatus.DELETED, updated_dt: Date.now(), updated_by_id: userId },
      event,
    );
    return { deleted: true };
  }

  /** Undo of delete. The undo window is enforced client-side; this just flips the soft-delete flag back. */
  async restore(userId: number, uuid: string, logContext?: IRequestLogContext): Promise<TodoTaskDto> {
    const event = LoggingUtilities.request.branch(logContext, "SERVICE", "Restore task");
    const existing = await this.loadOrThrow(userId, uuid, RecordStatus.DELETED, event);
    const patch: Partial<ITB_TODO_TASK> = {
      record_status: RecordStatus.ACTIVE,
      updated_dt: Date.now(),
      updated_by_id: userId,
    };
    // A pin taken since the delete may have used up the cap.
    if (existing.pinned && (await this.pinnedCount(userId, event)) >= MAX_PINNED) patch.pinned = 0;
    const [restored] = await this.db.update<ITB_TODO_TASK>(
      TODO_TASK_TABLE,
      { uuid, created_by_id: userId },
      patch,
      event,
    );
    return toTaskDto(restored);
  }

  /** Applies the client's full manual order. Unknown ids are ignored. */
  async reorder(userId: number, ids: string[], logContext?: IRequestLogContext): Promise<TodoListDto> {
    const event = LoggingUtilities.request.branch(logContext, "SERVICE", `Reorder ${ids.length} task(s)`);
    const now = Date.now();
    await this.db.transaction(async (_trx, tx) => {
      for (const [index, uuid] of ids.entries()) {
        await tx.updateCount<ITB_TODO_TASK>(
          TODO_TASK_TABLE,
          { uuid, created_by_id: userId, record_status: RecordStatus.ACTIVE },
          { sort_order: index + 1, updated_dt: now, updated_by_id: userId },
          event,
        );
      }
    }, event);
    return { tasks: (await this.activeTasks(userId, event)).map(toTaskDto) };
  }

  /** Scriptable lock-screen widget: pinned first, then by manual order; at most WIDGET_TASK_LIMIT titles. */
  async widget(userId: number, logContext?: IRequestLogContext): Promise<TodoWidgetDto> {
    const event = LoggingUtilities.request.branch(logContext, "SERVICE", "Widget feed");
    const open = (await this.activeTasks(userId, event)).filter((task) => !task.done);
    const ordered = [...open.filter((task) => task.pinned), ...open.filter((task) => !task.pinned)];
    return { tasks: ordered.slice(0, WIDGET_TASK_LIMIT).map((task) => task.title), openCount: open.length };
  }

  private activeTasks(userId: number, event?: IRequestLogEvent): Promise<ITB_TODO_TASK[]> {
    return this.db.find<ITB_TODO_TASK>(
      TODO_TASK_TABLE,
      { created_by_id: userId, record_status: RecordStatus.ACTIVE },
      { orderBy: "sort_order", orderDirection: "asc" },
      event,
    );
  }

  private async loadOrThrow(
    userId: number,
    uuid: string,
    status: RecordStatus,
    event?: IRequestLogEvent,
  ): Promise<ITB_TODO_TASK> {
    const task = await this.db.findOne<ITB_TODO_TASK>(
      TODO_TASK_TABLE,
      { uuid, created_by_id: userId, record_status: status },
      ["*"],
      event,
    );
    if (!task) throw new Exceptions.NotFound("Task not found");
    return task;
  }

  private pinnedCount(userId: number, event?: IRequestLogEvent): Promise<number> {
    return this.db.count<ITB_TODO_TASK>(
      TODO_TASK_TABLE,
      { created_by_id: userId, record_status: RecordStatus.ACTIVE, pinned: 1 },
      event,
    );
  }
}
