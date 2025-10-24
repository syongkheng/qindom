import { UnknownException } from "../exceptions/UnknownException";
import { ITB_FND_NOTICE } from "../models/databases/tb_fnd_notice";
import { ITB_FND_NOTICE_VIEW } from "../models/databases/tb_fnd_notice_view";
import KnexSqlUtilities from "../utils/KnexSqlUtilities";
import { LoggingUtilities } from "../utils/LoggingUtilities";

export class FndNoticeService {
  constructor(private db: KnexSqlUtilities) {}

  /**
   * 🟢 READ: Retrieve all active notices
   */
  async getAllNotice(
    classification: string
  ): Promise<(ITB_FND_NOTICE & { view_count: number })[]> {
    try {
      LoggingUtilities.service.info(
        "FndNoticeService.getAllNotice",
        `Fetching all active notices with view counts for classification: ${classification}`
      );

      // Define hierarchy
      const hierarchy = ["OPEN", "R1", "R2", "R3", "R4"];

      // Determine which classifications to include
      let allowedClassifications: string[];
      if (classification === "OPEN") {
        allowedClassifications = ["OPEN"];
      } else {
        const index = hierarchy.indexOf(classification);
        allowedClassifications = hierarchy.slice(0, index + 1);
      }

      // Retrieve matching records
      const existingRecords = await this.db.find<ITB_FND_NOTICE>(
        "tb_fnd_notice",
        { record_status: "A" },
        {
          orderBy: "created_dt",
          orderDirection: "desc",
        }
      );

      // Filter by allowed classifications
      const filteredRecords = existingRecords.filter((notice) =>
        allowedClassifications.includes(notice.classification ?? "")
      );

      // Attach view counts
      const noticesWithViewCount = await Promise.all(
        filteredRecords.map(async (notice) => {
          const views = await this.getNoticeViews(notice.id!);
          return {
            ...notice,
            view_count: views?.count ?? -1,
          };
        })
      );

      return noticesWithViewCount;
    } catch (error: any) {
      LoggingUtilities.service.error(
        "FndNoticeService.getAllNotice",
        `Something went wrong: ${error}`
      );
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
      LoggingUtilities.service.info(
        "FndNoticeService.createNotice",
        `Creating notice with title: ${title}`
      );
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
      LoggingUtilities.service.error(
        "FndNoticeService.createNotice",
        `Something went wrong: ${error}`
      );
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
      LoggingUtilities.service.info(
        "FndNoticeService.updateNotice",
        `Updating notice with ID: ${id}`
      );
      if (!id) {
        LoggingUtilities.service.error(
          "FndNoticeService.updateNotice",
          `Invalid ID provided: ${id}`
        );
        throw new UnknownException();
      }

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
      LoggingUtilities.service.info(
        "FndNoticeService.deleteNotice",
        `Deleting notice with ID: ${id}`
      );
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
        LoggingUtilities.service.error(
          "FndNoticeService.deleteNotice",
          `No notice found with ID: ${id} to delete`
        );
        throw new UnknownException();
      }
    } catch (error: any) {
      LoggingUtilities.service.error(
        "FndNoticeService.deleteNotice",
        `Something went wrong: ${error}`
      );
      throw new UnknownException();
    }
  }

  async viewNotice(id: number, username: string): Promise<ITB_FND_NOTICE_VIEW> {
    try {
      const isViewed = await this.db.findOne<ITB_FND_NOTICE_VIEW>(
        "tb_fnd_notice_view",
        {
          notice_id: id,
          username: username,
        }
      );

      if (isViewed) {
        LoggingUtilities.service.info(
          "FndNoticeService.viewNotice",
          `Notice ID: ${id} already viewed by user: ${username}`
        );
        return isViewed;
      }
      LoggingUtilities.service.info(
        "FndNoticeService.viewNotice",
        `Recording view for notice ID: ${id} by user: ${username}`
      );

      return await this.db.insert<ITB_FND_NOTICE_VIEW>("tb_fnd_notice_view", {
        notice_id: id,
        username: username,
        created_dt: new Date().getTime(),
      });
    } catch (error: any) {
      LoggingUtilities.service.error(
        "FndNoticeService.viewNotice",
        `Something went wrong: ${error}`
      );
      throw new UnknownException();
    }
  }

  private async getNoticeViews(noticeId: number): Promise<{ count: number }> {
    try {
      LoggingUtilities.service.info(
        "FndNoticeService.getNoticeViews",
        `Fetching view count for notice ID: ${noticeId}`
      );
      const res = await this.db.find<ITB_FND_NOTICE_VIEW>(
        "tb_fnd_notice_view",
        { notice_id: noticeId }
      );

      return { count: res.length };
    } catch (error: any) {
      LoggingUtilities.service.error(
        "FndNoticeService.getNoticeViews",
        `Something went wrong: ${error}`
      );
      throw new UnknownException();
    }
  }
}
