import { UnknownException } from "../exceptions/UnknownException";
import { ITB_FND_EVENT } from "../models/databases/tb_fnd_event";

import KnexSqlUtilities from "../utils/KnexSqlUtilities";
import { LoggingUtilities } from "../utils/LoggingUtilities";

export class FndEventService {
  constructor(private db: KnexSqlUtilities) {}

  /**
   * 🟢 READ: Retrieve all active events
   */
  async getAllEvent(): Promise<ITB_FND_EVENT[]> {
    try {
      const existingRecords = await this.db.find<ITB_FND_EVENT>(
        "tb_fnd_event",
        { record_status: "A" },
        { orderBy: "created_dt", orderDirection: "desc" }
      );

      return existingRecords;
    } catch (error: any) {
      throw new UnknownException();
    }
  }

  /**
   * 🟡 CREATE: Add a new event
   */
  async createEvent({
    eventDt,
    title,
    content,
    createdBy,
  }: {
    eventDt: number;
    title: string;
    content: string;
    createdBy: string;
  }): Promise<ITB_FND_EVENT> {
    try {
      return await this.db.insert<ITB_FND_EVENT>("tb_fnd_event", {
        event_dt: eventDt,
        title: title,
        content: content,
        record_status: "A",
        created_dt: new Date().getTime(),
        created_by: createdBy,
      });
    } catch (error: any) {
      throw new UnknownException();
    }
  }

  /**
   * 🟠 UPDATE: Modify an existing event
   */
  async updateEvent({
    id,
    eventDt,
    title,
    content,
    updatedBy,
  }: {
    id: number;
    eventDt: number;
    title: string;
    content: string;
    updatedBy: string;
  }): Promise<ITB_FND_EVENT[]> {
    try {
      if (!id) throw new UnknownException();

      return await this.db.update<ITB_FND_EVENT>(
        "tb_fnd_event",
        { id: id },
        {
          event_dt: eventDt,
          title: title,
          content: content,
          updated_dt: new Date().getTime(),
          updated_by: updatedBy,
        }
      );
    } catch (error: any) {
      LoggingUtilities.service.error(
        "FndNoticeService.updateNotice",
        `Something went wrong: ${error}`
      );
      throw new UnknownException();
    }
  }

  /**
   * 🔴 DELETE: Soft delete (mark as deleted)
   */
  async deleteEvent(id: number, updatedBy: string): Promise<void> {
    try {
      const result = await this.db.update<ITB_FND_EVENT>(
        "tb_fnd_event",
        { id },
        {
          record_status: "D",
          updated_dt: new Date().getTime(),
          updated_by: updatedBy ?? "UNKNOWN",
        }
      );

      if (result.length === 0) {
        throw new UnknownException();
      }
    } catch (error: any) {
      throw new UnknownException();
    }
  }
}
