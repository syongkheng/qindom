import { UnknownException } from "../exceptions/UnknownException";
import { ITB_FND_NOTICE } from "../models/databases/tb_fb_fnd_notice";
import KnexSqlUtilities from "../utils/KnexSqlUtilities";
import { LoggingUtilities } from "../utils/LoggingUtilities";

export class FndNoticeService {
  constructor(private db: KnexSqlUtilities) {}

  /**
   * 🟢 READ: Retrieve all active notices
   */
  async getAllNotice(): Promise<ITB_FND_NOTICE[]> {
    try {
      const existingRecords = await this.db.find<ITB_FND_NOTICE>(
        "tb_fnd_notice",
        { record_status: "A" },
        { orderBy: "created_dt", orderDirection: "desc" }
      );

      return existingRecords;
    } catch (error: any) {
      throw new UnknownException();
    }
  }

  /**
   * 🟡 CREATE: Add a new notice
   */
  async createNotice({
    type,
    title,
    content,
    classification,
    createdBy,
  }: {
    type: string;
    title: string;
    content: string;
    classification: string;
    createdBy: string;
  }): Promise<ITB_FND_NOTICE> {
    try {
      return await this.db.insert<ITB_FND_NOTICE>("tb_fnd_notice", {
        type: type,
        title: title,
        content: content,
        classification: classification,
        record_status: "A",
        created_dt: new Date().getTime(),
        created_by: createdBy,
      });
    } catch (error: any) {
      throw new UnknownException();
    }
  }

  /**
   * 🟠 UPDATE: Modify an existing notice
   */
  async updateNotice({
    id,
    type,
    title,
    content,
    classification,
    updatedBy,
  }: {
    id: number;
    type: string;
    title: string;
    content: string;
    classification: string;
    updatedBy: string;
  }): Promise<ITB_FND_NOTICE[]> {
    try {
      if (!id) throw new UnknownException();

      return await this.db.update<ITB_FND_NOTICE>(
        "tb_fnd_notice",
        { id: id },
        {
          type: type,
          title: title,
          content: content,
          classification: classification,
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
  async deleteNotice(id: number, updatedBy: string): Promise<void> {
    try {
      const result = await this.db.update<ITB_FND_NOTICE>(
        "tb_fnd_notice",
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
