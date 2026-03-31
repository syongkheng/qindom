import { Router, Request, Response } from "express";
import { identityLimiter, apptLimiter } from "../middlewares/RateLimiter";
import { ControllerResponse } from "../models/responses/ControllerResponse";
import KnexSqlUtilities from "../utils/KnexSqlUtilities";
import crypto from "crypto";
import { google } from "googleapis";
import path from "path";
import { Exceptions } from "../exceptions/AppExceptions";
import { handleException } from "../utils/requestUtils";

const serviceAccountPath = path.join(__dirname, "../config/db/serviceAccountKey.json");

const auth = new google.auth.GoogleAuth({
  keyFile: serviceAccountPath,
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});

const sheets = google.sheets({ version: "v4", auth });

const SPREADSHEET_ID = process.env.KOP_SPREADSHEET_ID!;

export default function createFndController(db: KnexSqlUtilities) {
  const router = Router();
  const SECRET = process.env.KS_CLIENT_SECRET_PUB;

  router.get("/", async (_req: Request, res: Response) => {
    const cr = new ControllerResponse(res);
    try {
      return cr.ok("Ok");
    } catch (err) {
      return handleException(err, cr, "FndController.GET /", "Failed");
    }
  });

  router.post("/identity", [identityLimiter], async (req: Request, res: Response) => {
    const cr = new ControllerResponse(res);
    try {
      const { identity } = req.body;
      if (!identity) throw new Exceptions.InvalidRequest("identity");

      const payload: Record<string, any> = { fid: Number(identity), time: Date.now() };
      payload.sign = signPayload(payload);

      const formData = new URLSearchParams();
      formData.append("fid", payload.fid.toString());
      formData.append("time", payload.time.toString());
      formData.append("sign", payload.sign);

      const ksResponse    = await fetch("https://kingshot-giftcode.centurygame.com/api/player", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: formData.toString(),
      });
      const serverResponse = await ksResponse.json();

      if (serverResponse.code !== 0 || !serverResponse.data) {
        return cr.result(502, "ExternalRequestError", `Invalid KS Response: code: ${serverResponse.code}, data: ${serverResponse.data}`);
      }
      if (JSON.stringify(serverResponse.data.kid) !== "236") {
        return cr.result(502, "ExternalRequestError", "Invalid Server");
      }

      return cr.ok(JSON.stringify(serverResponse.data.nickname.replace(/"/g, "")) || "N/A");
    } catch (err) {
      return handleException(err, cr, "FndController.POST /identity", "Failed to fetch identity");
    }
  });

  router.post("/appt", [apptLimiter], async (req: Request, res: Response) => {
    const cr = new ControllerResponse(res);
    try {
      const { alliance, appointment, appointmentTiming, governorId, governorName, remarks } = req.body;
      if (!governorId) throw new Exceptions.InvalidRequest("governorId");
      if (!governorName) throw new Exceptions.InvalidRequest("governorName");
      if (!alliance) throw new Exceptions.InvalidRequest("alliance");

      const record = await db.insert("tb_fnd_kop_appt", {
        governor_id:          governorId,
        governor_name:        governorName,
        alliance,
        identity:             governorId,
        appointments:         JSON.stringify(appointment),
        appointment_timings:  JSON.stringify(appointmentTiming),
        status:               "PENDING",
        record_status:        "A",
        updated_by:           "system",
        remarks,
      });

      await sheets.spreadsheets.values.append({
        spreadsheetId: SPREADSHEET_ID,
        range: "KOP_Appt!A:H",
        valueInputOption: "RAW",
        requestBody: {
          values: [[
            governorId, governorName, alliance,
            JSON.stringify(appointment), JSON.stringify(appointmentTiming),
            JSON.stringify(remarks), "PENDING", new Date().toISOString(),
          ]],
        },
      });

      const { record_status, created_dt, ...safeRecord } = record as any;
      return cr.ok(safeRecord);
    } catch (err) {
      return handleException(err, cr, "FndController.POST /appt", "Failed to submit appointment");
    }
  });

  function signPayload(payload: Record<string, any>): string {
    const keys = Object.keys(payload).sort();
    const parts: string[] = [];
    for (const key of keys) {
      let value = payload[key];
      if (typeof value === "object") value = JSON.stringify(value);
      parts.push(`${key}=${value}`);
    }
    return crypto.createHash("md5").update(parts.join("&") + SECRET, "utf8").digest("hex");
  }

  return router;
}
