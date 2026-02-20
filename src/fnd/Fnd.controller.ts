// src/controllers/Fnd.controller.ts
import { Router, Request, Response } from "express";
import { ControllerResponse } from "../models/responses/ControllerResponse";
import KnexSqlUtilities from "../utils/KnexSqlUtilities";
import crypto from "crypto";
import { google } from "googleapis";
import path from "path";

// Path to your service account key JSON
const serviceAccountPath = path.join(__dirname, "../config/db/serviceAccountKey.json");

const auth = new google.auth.GoogleAuth({
  keyFile: serviceAccountPath,
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});

// Create Google Sheets client
const sheets = google.sheets({ version: "v4", auth });

// Replace with your actual Sheet ID
const SPREADSHEET_ID = "1NFMWxbwj5REfT9EOTL3CXErvEyrqnLIpuAiDW9d4urg";

export default function createFndController() {
  const router = Router();
  const SECRET = process.env.KS_CLIENT_SECRET_PUB;

  router.get("/", async (req: Request, res: Response) => {
    const response = new ControllerResponse(res);
    try {
      return response.ok("Ok");
    } catch (error: any) {
      return response.ko(error.message);
    }
  });

  router.post("/identity", async (req: Request, res: Response) => {
    const response = new ControllerResponse(res);
    try {
      const { identity } = req.body;

      if (!identity) return response.ko("Invalid Identity");

      const payload: Record<string, any> = {
        fid: Number(identity),
        time: Date.now(),
      };

      payload.sign = signPayload(payload);

      const formData = new URLSearchParams();
      formData.append("fid", payload.fid.toString());
      formData.append("time", payload.time.toString());
      formData.append("sign", payload.sign);

      const ksResponse = await fetch("https://kingshot-giftcode.centurygame.com/api/player", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: formData.toString(),
      });

      const serverResponse = await ksResponse.json();

      if (serverResponse.code !== 0 || !serverResponse.data) {
        return response.ko(`Invalid KS Response: code: ${serverResponse.code}, data: ${serverResponse.data}`);
      }

      if (JSON.stringify(serverResponse.data.kid) !== "236") {
        return response.ko("Invalid Server");
      }

      const governorName = JSON.stringify(serverResponse.data.nickname.replace(/"/g, "")) || "N/A";
      return response.ok(governorName);
    } catch (error: any) {
      return response.ko(error.message);
    }
  });

  router.post("/appt", async (req: Request, res: Response) => {
    const response = new ControllerResponse(res);
    try {
      const { alliance, appointment, appointmentTiming, governorId, governorName, remarks } = req.body;

      if (!governorId || !governorName || !alliance) {
        return response.ko("Missing required fields");
      }

      // Insert into database
      // const record = await db.insert("tb_fnd_kop_appt", {
      //   governor_id: governorId,
      //   governor_name: governorName,
      //   alliance,
      //   identity: governorId,
      //   appointments: JSON.stringify(appointment),
      //   appointment_timings: JSON.stringify(appointmentTiming),
      //   status: "PENDING",
      //   record_status: "A",
      //   updated_by: "system",
      //   remarks: remarks
      // });

      // Append row to Google Sheet
      const row = [
        governorId,
        governorName,
        alliance,
        JSON.stringify(appointment),
        JSON.stringify(appointmentTiming),
        JSON.stringify(remarks),
        "PENDING",
        new Date().toISOString(),
      ];

      await sheets.spreadsheets.values.append({
        spreadsheetId: SPREADSHEET_ID,
        range: "KOP_Appt!A:H", // adjust sheet name if needed
        valueInputOption: "RAW",
        requestBody: {
          values: [row],
        },
      });

      return response.ok("Appointment recorded successfully");
    } catch (error: any) {
      return response.ko(error.message);
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

    const baseString = parts.join("&") + SECRET;
    return crypto.createHash("md5").update(baseString, "utf8").digest("hex");
  }

  return router;
}
