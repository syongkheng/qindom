import { Router, Response } from "express";
import KnexSqlUtilities from "../utils/KnexSqlUtilities";
import { ControllerResponse } from "../models/responses/ControllerResponse";
import { RequestWithUserInfo } from "../models/requests/RequestWithUserInfo";
import { handleException } from "../utils/requestUtils";

export default function createLogController(db: KnexSqlUtilities) {
  const router = Router();

  router.post("/log", async (req: RequestWithUserInfo, res: Response) => {
    const cr = new ControllerResponse(req, res);
    try {
      const { level = "INFO", tag = "", msg = "", data, ts } = req.body;
      const token = process.env.AWENSE_CDN_TELEGRAM_BOT_TOKEN;
      const chatId = process.env.TELEGRAM_CHAT_ID;
      if (!token || !chatId) return cr.ok({});

      const time = ts ? new Date(ts).toISOString() : new Date().toISOString();
      const text = `[${level}] ${tag} — ${time}\n${msg}${data ? "\n" + data : ""}`;
      await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text }),
      });

      return cr.ok({});
    } catch (err) {
      return handleException(err, cr, "LogController.POST /log", "Failed to forward log");
    }
  });

  return router;
}
