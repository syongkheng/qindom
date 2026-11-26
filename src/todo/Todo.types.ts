export interface TodoTaskDto {
  /** The task's uuid (public id). */
  id: string;
  title: string;
  done: boolean;
  doneAt: number | null;
  pinned: boolean;
  createdAt: number;
  sortOrder: number;
}

export interface TodoListDto {
  tasks: TodoTaskDto[];
}

export interface TodoDeletedDto {
  deleted: true;
}

/** Lock-screen widget feed (`GET /v1/ss/todo`). */
export interface TodoWidgetDto {
  /** Up to 3 open task titles, pinned first. */
  tasks: string[];
  openCount: number;
}

export interface TodoCreateBody {
  title: string;
}

/** At least one field is present. */
export interface TodoUpdateBody {
  title?: string;
  done?: boolean;
  pinned?: boolean;
}

export interface TodoReorderBody {
  /** Task uuids in the new manual order. */
  ids: string[];
}
