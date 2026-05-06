import { parse, HTMLElement } from "node-html-parser";
import { LoggingUtilities } from "../utils/LoggingUtilities";
import { CoordinateService } from "./Coordinate.service";
import { ITB_HDB_PPHS } from "../models/databases/tb_hdb_pphs";
import KnexSqlUtilities from "../utils/KnexSqlUtilities";
import { InvalidRequestException } from "../exceptions/InvalidRequestException";
import { UnknownException } from "../exceptions/UnknownException";
import { toMessage } from "../utils/errorUtils";

interface FlatRecord {
  town: string;
  address: string;
  flatTypes: {
    "2-room"?: string;
    "3-room"?: string;
    "4-room"?: string;
  };
  siteExpiry: string;
}

export class HdbService {
  private coordinateService: CoordinateService;
  constructor(private db: KnexSqlUtilities) {
    this.coordinateService = new CoordinateService(db);
  }

  async retrieveListOfPphs(batch: string | undefined): Promise<{
    records: FlatRecord[];
    source: "database" | "website" | "error";
  }> {
    const currentBatch = batch || this.generateBatch();

    if (typeof currentBatch !== "string" || !/^\d{6}$/.test(currentBatch)) {
      LoggingUtilities.service.error("HdbService.statistics", `Invalid batch format: ${currentBatch}`);
      throw new InvalidRequestException("Invalid batch format. Expected 'YYYYMM'.");
    }

    // 1️⃣ Check if data exists in DB
    const existingRecords = await this.db.find<ITB_HDB_PPHS>(
      "tb_hdb_pphs",
      { batch: currentBatch },
      {
        limit: 1,
        orderBy: "created_dt",
        orderDirection: "desc",
        columns: ["json_string", "batch", "created_dt"],
      },
    );

    if (existingRecords.length > 0) {
      LoggingUtilities.service.info(
        "HdbService.statistics",
        `Found existing records for batch ${currentBatch} in database`,
      );
      try {
        const records = JSON.parse(existingRecords[0].json_string) as FlatRecord[];
        return { records, source: "database" };
      } catch (parseError) {
        LoggingUtilities.service.error("HdbService.statistics", "Failed to parse JSON from database");
      }
    }

    LoggingUtilities.service.info(
      "HdbService.statistics",
      `No existing records found for batch ${currentBatch}, fetching from HDB website...`,
    );

    // 2️⃣ Fetch from HDB website using fetch()
    const url =
      "https://www.hdb.gov.sg/renting-a-flat/parenthood-provisional-housing-scheme/application-process/pphs-flats-available-for-application";
    let html: string;
    try {
      const response = await fetch(url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.3",
        },
      });

      if (!response.ok) {
        throw new UnknownException();
      }

      html = await response.text();
    } catch (error) {
      LoggingUtilities.service.error("HdbService.statistics", `Failed to fetch from HDB website: ${toMessage(error)}`);
      return { records: [], source: "error" };
    }

    // 3️⃣ Parse HTML response — table is embedded inside __NEXT_DATA__ JSON
    const root = parse(html);
    const nextDataScript = root.querySelector("script#__NEXT_DATA__");

    if (!nextDataScript) {
      LoggingUtilities.service.error("HdbService.statistics", "Could not find __NEXT_DATA__ script on HDB page.");
      throw new UnknownException();
    }

    let bodyContentHtml: string | null = null;
    try {
      const nextData = JSON.parse(nextDataScript.text);
      const componentProps: Record<string, unknown> = nextData?.props?.pageProps?.componentProps ?? {};

      for (const uid of Object.keys(componentProps)) {
        const items = (componentProps[uid] as { props?: { accordionItems?: { bodyContentVal?: string }[] } })?.props?.accordionItems;
        if (Array.isArray(items)) {
          for (const item of items) {
            if (typeof item.bodyContentVal === "string" && item.bodyContentVal.includes("<table>")) {
              bodyContentHtml = item.bodyContentVal;
              break;
            }
          }
        }
        if (bodyContentHtml) break;
      }
    } catch {
      LoggingUtilities.service.error("HdbService.statistics", "Failed to parse __NEXT_DATA__ JSON.");
      throw new UnknownException();
    }

    if (!bodyContentHtml) {
      LoggingUtilities.service.error("HdbService.statistics", "No accordion body content with table found in __NEXT_DATA__.");
      throw new UnknownException();
    }

    const bodyRoot = parse(bodyContentHtml);
    const tables = bodyRoot.querySelectorAll("table");

    if (tables.length === 0) {
      LoggingUtilities.service.error("HdbService.statistics", "No tables found in accordion body content.");
      throw new UnknownException();
    }

    const pphsTable = tables[0];
    const records: FlatRecord[] = this.parseTable(pphsTable);

    // 4️⃣ Store records into DB
    try {
      await this.db.insert<ITB_HDB_PPHS>("tb_hdb_pphs", {
        batch: currentBatch,
        json_string: JSON.stringify(records),
        created_dt: new Date().getTime(),
        created_by: "SYSTEM",
      });
      LoggingUtilities.service.info(
        "HdbService.statistics",
        `Successfully stored ${records.length} records for batch ${currentBatch} in database`,
      );
    } catch (error) {
      LoggingUtilities.service.error(
        "HdbService.statistics",
        `Failed to insert records into database: ${toMessage(error)}`,
      );
    }

    return { records, source: "website" };
  }

  async retrieveListOfPphsWithCoordinates(batch: string | undefined): Promise<{
    records: (FlatRecord & { formedUrl: string; lat: string; lng: string })[];
    source: "database" | "website" | "error";
  }> {
    const { records, source } = await this.retrieveListOfPphs(batch);

    const recordsWithCoordinates = (
      await Promise.all(
        records.flatMap((record) => {
          const expandedAddresses = [record.address];

          return expandedAddresses.map(async (address) => {
            LoggingUtilities.service.info(
              "HdbService.retrieveListOfPphsWithCoordinates",
              `Fetching coordinates for address: ${address}`,
            );

            const transformedAddress = await this.coordinateService.replaceWhitespaceWithPlus(address);

            const { formed_url, lat, lng, source } =
              await this.coordinateService.getCoordinatesOfAddress(transformedAddress);

            return {
              ...record,
              address, // keep expanded address
              formedUrl: formed_url,
              lat,
              lng,
              source,
            };
          });
        }),
      )
    ).flat();

    return { records: recordsWithCoordinates, source };
  }

  async clearCoordinatesOfAddress(address: string): Promise<void> {
    const transformedAddress = await this.coordinateService.replaceWhitespaceWithPlus(address);
    await this.coordinateService.clearCoordinates(transformedAddress);
  }

  async getAllCoordinateOptions(address: string): Promise<Array<{
    source: 'onemap' | 'nominatim';
    lat: string;
    lng: string;
    formedUrl: string;
  }>> {
    const transformedAddress = await this.coordinateService.replaceWhitespaceWithPlus(address);
    return this.coordinateService.fetchAllCoordinateOptions(transformedAddress);
  }

  async refreshCoordinatesOfAddress(address: string): Promise<{
    lat: string; lng: string; formedUrl: string; source: string;
  }> {
    const transformedAddress = await this.coordinateService.replaceWhitespaceWithPlus(address);
    await this.coordinateService.deleteCache(transformedAddress);
    const { lat, lng, formed_url, source } = await this.coordinateService.getCoordinatesOfAddress(transformedAddress);
    return { lat, lng, formedUrl: formed_url, source };
  }

  async retrieveBusstopWithinRadiusOfLatLng(lat: string, lng: string, radius: number) {
    try {
      return await this.db.pphs.findBusStopsWithinRadiusOfLatLng(lat, lng, radius);
    } catch (error) {
      throw new UnknownException();
    }
  }

  async retrieveNearestMrtStationsOfLatLng(lat: string, lng: string, limit?: number) {
    try {
      return await this.db.pphs.findMrtStationsWithinRadiusOfLatLng(lat, lng, limit ?? 3);
    } catch (error) {
      throw new UnknownException();
    }
  }

  private parseTable(table: HTMLElement): FlatRecord[] {
    const allRows = table.querySelectorAll("tbody > tr");
    const results: FlatRecord[] = [];

    // Detect whether the table has a 4-room column by inspecting the second header row
    const headerRow2Cells = allRows[1]?.querySelectorAll("td") ?? [];
    const has4Room = headerRow2Cells.length >= 3;

    // Number of cells in a data row that includes the town cell
    const rowWithTown = has4Room ? 6 : 5;
    // Minimum cells in a data row (no town cell)
    const rowWithoutTown = rowWithTown - 1;

    const rows = allRows.slice(2);
    let currentTown = "";

    for (const row of rows) {
      const cells = row.querySelectorAll("td");
      if (cells.length < rowWithoutTown) continue;

      let addressCell: HTMLElement;
      let twoCell: HTMLElement;
      let threeCell: HTMLElement;
      let fourCell: HTMLElement | null = null;
      let expiryCell: HTMLElement;

      if (cells.length >= rowWithTown) {
        // Row includes the town cell
        const townText = cells[0].textContent?.trim();
        if (townText) currentTown = townText;

        addressCell = cells[1];
        twoCell = cells[2];
        threeCell = cells[3];
        if (has4Room) {
          fourCell = cells[4];
          expiryCell = cells[5];
        } else {
          expiryCell = cells[4];
        }
      } else {
        // Row without town cell (rowspan from previous row)
        addressCell = cells[0];
        twoCell = cells[1];
        threeCell = cells[2];
        if (has4Room) {
          fourCell = cells[3];
          expiryCell = cells[4];
        } else {
          expiryCell = cells[3];
        }
      }

      const record: FlatRecord = {
        town: currentTown,
        address: addressCell.textContent?.trim() || "",
        flatTypes: {},
        siteExpiry: expiryCell.textContent?.trim() || "",
      };

      const t2 = twoCell.textContent?.trim();
      const t3 = threeCell.textContent?.trim();
      const t4 = fourCell?.textContent?.trim();

      if (t2 && t2 !== "-") record.flatTypes["2-room"] = t2;
      if (t3 && t3 !== "-") record.flatTypes["3-room"] = t3;
      if (t4 && t4 !== "-") record.flatTypes["4-room"] = t4;

      results.push(record);
    }

    return results;
  }

  private generateBatch(): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    return `${year}${month}`;
  }

  async getAvailableBatches(): Promise<string[]> {
    try {
      const batches = await this.db.find<ITB_HDB_PPHS>(
        "tb_hdb_pphs",
        {},
        {
          columns: ["batch"],
          orderBy: "batch",
          orderDirection: "desc",
        },
      );

      return [...new Set(batches.map((b) => b.batch))];
    } catch (error) {
      LoggingUtilities.service.error("HdbService.getAvailableBatches", `${error}`);
      return [];
    }
  }
}
