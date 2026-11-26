/** Preset category list a table was created with (fndom `BudgetTemplates.ts`). Not editable after creation. */
export const BudgetTemplate = {
  HOME_RENO: "home_reno",
  WEDDING: "wedding",
  TRAVEL: "travel",
  OTHER: "other",
} as const;

export type BudgetTemplate = (typeof BudgetTemplate)[keyof typeof BudgetTemplate];

export const BudgetItemStatus = {
  TO_BUY: "to_buy",
  BOUGHT: "bought",
} as const;

export type BudgetItemStatus = (typeof BudgetItemStatus)[keyof typeof BudgetItemStatus];

/** One row of `GET /budget` (`myTables` / `sharedTables`). */
export interface BudgetTableSummaryDto {
  sessionId: string;
  name: string;
  template: BudgetTemplate;
  createdDt: number;
  /** Active items only. */
  itemCount: number;
  sumBudget: number;
  sumActual: number;
}

export interface BudgetTableListDto {
  /** Tables the caller owns, newest first. */
  myTables: BudgetTableSummaryDto[];
  /** Tables the caller is an active collaborator on, newest first. */
  sharedTables: BudgetTableSummaryDto[];
}

/** Optional fields are omitted (not `null`) when empty; fndom's `BudgetItem` relies on that. */
export interface BudgetItemDto {
  /** The item's uuid (public id); the auto-increment id is never exposed. */
  id: string;
  name: string;
  category?: string;
  status: BudgetItemStatus;
  budgetAmount?: number;
  actualAmount?: number;
  notes?: string;
  sortOrder: number;
}

export interface BudgetCollaboratorDto {
  userId: number;
  username?: string;
  email?: string | null;
}

export interface BudgetTableDto {
  sessionId: string;
  name: string;
  template: BudgetTemplate;
  createdDt: number;
  /** `false` for collaborators: fndom hides rename and collaborator management. */
  isOwner: boolean;
  /** Active items by `sortOrder`. */
  items: BudgetItemDto[];
  /** Active collaborators with an active account (never the owner; soft-deleted users are left out). */
  collaborators: BudgetCollaboratorDto[];
}

export interface BudgetTableCreatedDto {
  sessionId: string;
}

export interface BudgetRenamedDto {
  renamed: true;
}

export interface BudgetDeletedDto {
  deleted: true;
}

export interface BudgetCollaboratorRemovedDto {
  removed: true;
}

export interface BudgetLeftDto {
  left: true;
}

export interface BudgetTableBody {
  name: string;
  template: BudgetTemplate;
}

export interface BudgetRenameBody {
  name: string;
}

export interface BudgetItemBody {
  name: string;
  category: string | null;
  status: BudgetItemStatus;
  budgetAmount: number | null;
  actualAmount: number | null;
  notes: string | null;
}

/** At least one field is present; `null` (or a blank string) clears an optional field. */
export interface BudgetItemUpdateBody {
  name?: string;
  category?: string | null;
  status?: BudgetItemStatus;
  budgetAmount?: number | null;
  actualAmount?: number | null;
  notes?: string | null;
}

export interface BudgetCollaboratorBody {
  email: string;
}
