import { IRequestLogEvent } from "../models/IRequestLogContext.js";
import { Exceptions } from "../exceptions/AppExceptions.js";
import { StructuralValidationUtilities as V } from "../utils/StructualValidationUtilities.js";
import {
  BudgetCollaboratorBody,
  BudgetItemBody,
  BudgetItemStatus,
  BudgetItemUpdateBody,
  BudgetRenameBody,
  BudgetTableBody,
  BudgetTemplate,
} from "./Budget.types.js";

// tb_budget_table.name / tb_budget_item.name are VARCHAR(255).
const NAME_MAX_LENGTH = 255;
// tb_budget_item.category is VARCHAR(64).
const CATEGORY_MAX_LENGTH = 64;
// tb_budget_item.notes is VARCHAR(1024).
const NOTES_MAX_LENGTH = 1024;
// tb_aa_user.email is VARCHAR(255).
const EMAIL_MAX_LENGTH = 255;
// tb_budget_item.budget_amount / actual_amount are DECIMAL(12,2).
const AMOUNT_MAX_ABS = 9_999_999_999.99;

const BUDGET_TEMPLATES = Object.values(BudgetTemplate);
const BUDGET_ITEM_STATUSES = Object.values(BudgetItemStatus);

/** A finite number within the DECIMAL(12,2) range (negatives allowed, e.g. refunds). */
function amount(value: unknown, field: string, event?: IRequestLogEvent): number {
  V.number(value, field, event, "(O)");
  if (!Number.isFinite(value) || Math.abs(value as number) > AMOUNT_MAX_ABS) {
    throw new Exceptions.InvalidRequest(field, "format");
  }
  return value as number;
}

function status(value: unknown, event?: IRequestLogEvent): BudgetItemStatus {
  V.oneOf(value, BUDGET_ITEM_STATUSES, "status", event, "(O)");
  return value as BudgetItemStatus;
}

/** `{ name, template? }`; template defaults to `other`. */
export function validateTableBody(body: Record<string, unknown>, event?: IRequestLogEvent): BudgetTableBody {
  const name = V.requiredText(body.name, "name", NAME_MAX_LENGTH, event);
  if (body.template === undefined) return { name, template: BudgetTemplate.OTHER };
  V.oneOf(body.template, BUDGET_TEMPLATES, "template", event, "(O)");
  return { name, template: body.template as BudgetTemplate };
}

export function validateRenameBody(body: Record<string, unknown>, event?: IRequestLogEvent): BudgetRenameBody {
  return { name: V.requiredText(body.name, "name", NAME_MAX_LENGTH, event) };
}

/** New item. Amounts are optional; `null` means none (same as on update). */
export function validateItemBody(body: Record<string, unknown>, event?: IRequestLogEvent): BudgetItemBody {
  return {
    name: V.requiredText(body.name, "name", NAME_MAX_LENGTH, event),
    category: V.optionalText(body.category, "category", CATEGORY_MAX_LENGTH, event),
    status: body.status === undefined ? BudgetItemStatus.TO_BUY : status(body.status, event),
    budgetAmount: body.budgetAmount == null ? null : amount(body.budgetAmount, "budgetAmount", event),
    actualAmount: body.actualAmount == null ? null : amount(body.actualAmount, "actualAmount", event),
    notes: V.optionalText(body.notes, "notes", NOTES_MAX_LENGTH, event),
  };
}

/** Partial item update: only the fields present change; `null` clears category, amounts and notes. */
export function validateItemUpdateBody(body: Record<string, unknown>, event?: IRequestLogEvent): BudgetItemUpdateBody {
  const update: BudgetItemUpdateBody = {};
  if (body.name !== undefined) update.name = V.requiredText(body.name, "name", NAME_MAX_LENGTH, event);
  if (body.category !== undefined) {
    update.category = V.optionalText(body.category, "category", CATEGORY_MAX_LENGTH, event);
  }
  if (body.status !== undefined) update.status = status(body.status, event);
  if (body.budgetAmount !== undefined) {
    update.budgetAmount = body.budgetAmount === null ? null : amount(body.budgetAmount, "budgetAmount", event);
  }
  if (body.actualAmount !== undefined) {
    update.actualAmount = body.actualAmount === null ? null : amount(body.actualAmount, "actualAmount", event);
  }
  if (body.notes !== undefined) update.notes = V.optionalText(body.notes, "notes", NOTES_MAX_LENGTH, event);
  if (Object.keys(update).length === 0) throw new Exceptions.InvalidRequest("body", "mandatory");
  return update;
}

export function validateCollaboratorBody(
  body: Record<string, unknown>,
  event?: IRequestLogEvent,
): BudgetCollaboratorBody {
  const email = V.requiredText(body.email, "email", EMAIL_MAX_LENGTH, event);
  V.email(email, "email", event);
  return { email };
}

/** `:userId` path segment of the collaborator routes. */
export function validateUserIdParam(params: Record<string, string>): { userId: number } {
  const userId = Number(params.userId);
  if (!Number.isInteger(userId) || userId <= 0) throw new Exceptions.InvalidRequest("userId", "format");
  return { userId };
}
