// `garmin-connect` is CJS with no dual ESM build — cjs-module-lexer fails to
// detect its named `GarminConnect` export under native ESM/nodenext, so pull
// it off the default import instead of `import { GarminConnect } from ...`.
import GarminConnectPkg from "garmin-connect";
const { GarminConnect } = GarminConnectPkg;
import KnexSqlUtilities from "../utils/KnexSqlUtilities.js";
import { ITb_garmin_session } from "../models/databases/tb_garmin_session.js";
import { LoggingUtilities } from "../utils/logging/LoggingUtilities.js";
import { Exceptions } from "../exceptions/AppExceptions.js";

type GarminClientInstance = InstanceType<typeof GarminConnect>;
type GarminTokens = ReturnType<GarminClientInstance["exportToken"]>;

// Undocumented — Garmin has no public API for personal accounts. These
// shapes were found the same way the `garmin-connect` library's own docs
// recommend for anything outside its predefined methods: inspecting Garmin
// Connect's network traffic. They can change without notice; every caller
// treats missing/renamed fields as "no data" rather than throwing.
export interface DailyStressResponse {
  calendarDate?: string;
  overallStressLevel?: number;
  maxStressLevel?: number;
  avgStressLevel?: number;
  stressValuesArray?: [number, number][]; // [timestampMs, stressLevel] (-1/-2 = no data/rest)
}

export interface DailyBodyBatteryResponse {
  date?: string;
  charged?: number;
  drained?: number;
  bodyBatteryValuesArray?: [number, number][]; // [timestampMs, level] — confirmed against a real response, not the (wrong) upstream shape some docs show
}

// The `garmin-connect` package's own .d.ts claims `heartRateValues:
// HeartRateEntry[][]` (array of {timestamp, heartrate} objects) but a real
// response is actually a flat array of [timestampMs, heartrate|null] tuples
// — sampling gaps show up as null, not missing entries. Verified live.
export type HeartRateValuePair = [number, number | null];

const GARMIN_STRESS_URL = "https://connectapi.garmin.com/wellness-service/wellness/dailyStress";
const GARMIN_BODY_BATTERY_URL = "https://connectapi.garmin.com/wellness-service/wellness/bodyBattery/reports/daily";

// Thin wrapper around the unofficial `garmin-connect` npm client. Caches the
// oauth1/oauth2 session in tb_garmin_session so the scheduler doesn't log in
// on every poll — repeated logins are what trip Garmin's bot detection.
export class GarminClient {
  private client: GarminClientInstance | null = null;

  constructor(private readonly db: KnexSqlUtilities) {}

  private toDateString(date: Date): string {
    return date.toISOString().slice(0, 10);
  }

  private getCredentials(): { username: string; password: string } {
    const username = process.env.GARMIN_EMAIL;
    const password = process.env.GARMIN_PASSWORD;
    if (!username || !password) {
      throw new Exceptions.ExternalRequest("Garmin Connect (GARMIN_EMAIL/GARMIN_PASSWORD not configured)");
    }
    return { username, password };
  }

  private async persistSession(client: GarminClientInstance): Promise<void> {
    const tokens = client.exportToken();
    const now = Date.now();
    const existing = await this.db.findOne<ITb_garmin_session>("tb_garmin_session", { provider: "garmin" });
    if (existing) {
      await this.db.update<Partial<ITb_garmin_session>>(
        "tb_garmin_session",
        { id: existing.id },
        { token_data_json: JSON.stringify(tokens), updated_dt: now },
      );
    } else {
      await this.db.insert<Partial<ITb_garmin_session>, ITb_garmin_session>("tb_garmin_session", {
        provider: "garmin",
        token_data_json: JSON.stringify(tokens),
        created_dt: now,
        updated_dt: now,
      });
    }
  }

  // Restores a cached session (refreshing it if expired) or logs in fresh
  // and caches the result. Kept in-memory across calls within one process
  // lifetime too, so most polls don't touch the DB at all.
  async getClient(): Promise<GarminClientInstance> {
    if (this.client) {
      await this.client.client.checkTokenVaild();
      await this.persistSession(this.client); // no-op unless checkTokenVaild just refreshed it
      return this.client;
    }

    const cached = await this.db.findOne<ITb_garmin_session>("tb_garmin_session", { provider: "garmin" });
    if (cached) {
      try {
        const tokens = JSON.parse(cached.token_data_json) as GarminTokens;
        const client = new GarminConnect(this.getCredentials());
        client.loadToken(tokens.oauth1, tokens.oauth2);
        await client.client.checkTokenVaild();
        this.client = client;
        await this.persistSession(client);
        return client;
      } catch (err) {
        LoggingUtilities.service.warn("GarminClient.getClient", `Cached session invalid, re-logging in — ${err}`);
      }
    }

    const client = new GarminConnect(this.getCredentials());
    await client.login();
    this.client = client;
    await this.persistSession(client);
    return client;
  }

  async getSleep(date: Date) {
    const client = await this.getClient();
    return client.getSleepData(date);
  }

  async getHeartRateSeries(date: Date) {
    const client = await this.getClient();
    return client.getHeartRate(date);
  }

  async getDailyStress(date: Date): Promise<DailyStressResponse | null> {
    const client = await this.getClient();
    try {
      return await client.get<DailyStressResponse>(`${GARMIN_STRESS_URL}/${this.toDateString(date)}`);
    } catch (err) {
      LoggingUtilities.service.error("GarminClient.getDailyStress", String(err));
      return null;
    }
  }

  async getDailyBodyBattery(date: Date): Promise<DailyBodyBatteryResponse | null> {
    const client = await this.getClient();
    const dateString = this.toDateString(date);
    try {
      const rows = await client.get<DailyBodyBatteryResponse[]>(GARMIN_BODY_BATTERY_URL, {
        params: { startDate: dateString, endDate: dateString },
      });
      return rows?.[0] ?? null;
    } catch (err) {
      LoggingUtilities.service.error("GarminClient.getDailyBodyBattery", String(err));
      return null;
    }
  }
}
