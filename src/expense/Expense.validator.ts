import { Request } from "express";
import { InvalidRequestException } from "../exceptions/InvalidRequestException";

export class ExpenseValidator {
  static validateBalanceRequest(req: Request): { balance: number } {
    const { balance } = req.body;
    if (balance == null || isNaN(Number(balance))) throw new InvalidRequestException("balance");
    return { balance: Number(balance) };
  }

  static validateCreateTransactionRequest(req: Request): {
    type: string; amount: number; description: string;
    category: string; date: string; notes?: string | null; cardId?: number | null;
  } {
    const { type, amount, description, category, date, notes, cardId } = req.body;
    if (!type) throw new InvalidRequestException("type");
    if (!["expense", "earning"].includes(type)) throw new InvalidRequestException("type");
    if (amount == null || isNaN(Number(amount))) throw new InvalidRequestException("amount");
    if (!description) throw new InvalidRequestException("description");
    if (!category) throw new InvalidRequestException("category");
    if (!date) throw new InvalidRequestException("date");
    return { type, amount: Number(amount), description, category, date, notes, cardId };
  }

  static validateUpdateTransactionRequest(req: Request): {
    id: number; type: string; amount: number; description: string;
    category: string; date: string; notes?: string | null; cardId?: number | null;
  } {
    const { id } = req.body;
    if (!id) throw new InvalidRequestException("id");
    return { id: Number(id), ...this.validateCreateTransactionRequest(req) };
  }

  static validateCreateCardRequest(req: Request): {
    name: string; cycleEndDay: number; dueDay: number; color: string;
  } {
    const { name, cycleEndDay, dueDay, color } = req.body;
    if (!name) throw new InvalidRequestException("name");
    if (cycleEndDay == null) throw new InvalidRequestException("cycleEndDay");
    if (dueDay == null) throw new InvalidRequestException("dueDay");
    if (!color) throw new InvalidRequestException("color");
    return { name, cycleEndDay: Number(cycleEndDay), dueDay: Number(dueDay), color };
  }

  static validateUpdateCardRequest(req: Request): {
    id: number; name: string; cycleEndDay: number; dueDay: number; color: string;
  } {
    const { id } = req.body;
    if (!id) throw new InvalidRequestException("id");
    return { id: Number(id), ...this.validateCreateCardRequest(req) };
  }

  static validateIdRequest(req: Request): { id: number } {
    const { id } = req.body;
    if (!id) throw new InvalidRequestException("id");
    return { id: Number(id) };
  }
}
