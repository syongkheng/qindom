import { IRequestLogEvent } from "../models/IRequestLogContext.js";
import { StructuralValidationUtilities as V } from "../utils/StructualValidationUtilities.js";
import { BudgetItemStatus } from "../models/databases/tb_budget_item.js";
import { BudgetTemplate } from "../models/databases/tb_budget_table.js";

const BUDGET_ITEM_STATUSES: readonly BudgetItemStatus[] = ["to_buy", "bought"];
const BUDGET_TEMPLATES: readonly BudgetTemplate[] = ["home_reno", "wedding", "travel", "other"];

export class BudgetValidator {
  static validateCreateTableRequest(
    body: Record<string, unknown>,
    loggingEvent?: IRequestLogEvent,
  ): { name: string; template: BudgetTemplate } {
    const { name, template } = body as any;
    V.requiredString(name, "name", loggingEvent);
    if (template !== undefined) V.oneOf(template, BUDGET_TEMPLATES, "template", loggingEvent, "(O)");
    return { name, template: template ?? "other" };
  }

  static validateRenameTableRequest(
    body: Record<string, unknown>,
    loggingEvent?: IRequestLogEvent,
  ): { name: string } {
    const { name } = body as any;
    V.requiredString(name, "name", loggingEvent);
    return { name };
  }

  static validateCreateItemRequest(
    body: Record<string, unknown>,
    loggingEvent?: IRequestLogEvent,
  ): {
    name: string;
    category?: string;
    status?: BudgetItemStatus;
    budgetAmount?: number;
    actualAmount?: number;
    notes?: string;
  } {
    const { name, category, status, budgetAmount, actualAmount, notes } = body as any;
    V.requiredString(name, "name", loggingEvent);
    V.optionalString(category, "category", loggingEvent);
    if (status !== undefined) V.oneOf(status, BUDGET_ITEM_STATUSES, "status", loggingEvent, "(O)");
    if (budgetAmount !== undefined) V.number(budgetAmount, "budgetAmount", loggingEvent, "(O)");
    if (actualAmount !== undefined) V.number(actualAmount, "actualAmount", loggingEvent, "(O)");
    V.optionalString(notes, "notes", loggingEvent);
    return { name, category, status, budgetAmount, actualAmount, notes };
  }

  static validateEditItemRequest(
    body: Record<string, unknown>,
    loggingEvent?: IRequestLogEvent,
  ): {
    name?: string;
    category?: string;
    status?: BudgetItemStatus;
    budgetAmount?: number | null;
    actualAmount?: number | null;
    notes?: string;
  } {
    const { name, category, status, budgetAmount, actualAmount, notes } = body as any;
    if (name !== undefined) V.string(name, "name", loggingEvent, "(O)");
    if (category !== undefined) V.optionalString(category, "category", loggingEvent);
    if (status !== undefined) V.oneOf(status, BUDGET_ITEM_STATUSES, "status", loggingEvent, "(O)");
    if (budgetAmount !== undefined && budgetAmount !== null) V.number(budgetAmount, "budgetAmount", loggingEvent, "(O)");
    if (actualAmount !== undefined && actualAmount !== null) V.number(actualAmount, "actualAmount", loggingEvent, "(O)");
    if (notes !== undefined) V.optionalString(notes, "notes", loggingEvent);
    return { name, category, status, budgetAmount, actualAmount, notes };
  }

  static validateAddCollaboratorRequest(
    body: Record<string, unknown>,
    loggingEvent?: IRequestLogEvent,
  ): { email: string } {
    const { email } = body as any;
    V.requiredEmail(email, "email", loggingEvent);
    return { email };
  }
}
