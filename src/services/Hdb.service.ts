import axios from "axios";
import { parse, HTMLElement } from "node-html-parser";
import { LoggingUtilities } from "../utils/LoggingUtilities";
import { CoordinateService } from "./Coordinate.service";
import { ITB_HDB_PPHS } from "../models/databases/tb_hdb_pphs";
import KnexSqlUtilities from "../utils/KnexSqlUtilities";

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
  async retrieveListOfPphs(): Promise<{
    records: FlatRecord[];
    source: "database" | "website" | "error";
  }> {
    const currentBatch = this.generateBatch();

    // Check if we already have data for the current batch
    const existingRecords = await this.db.find<ITB_HDB_PPHS>(
      "tb_hdb_pphs",
      { batch: currentBatch },
      {
        limit: 1,
        orderBy: "created_dt",
        orderDirection: "desc",
        columns: ["json_string", "batch", "created_dt"],
      }
    );

    if (existingRecords.length > 0) {
      LoggingUtilities.service.info(
        "HdbService.statistics",
        `Found existing records for batch ${currentBatch} in database`
      );
      try {
        const records = JSON.parse(
          existingRecords[0].json_string
        ) as FlatRecord[];
        return {
          records,
          source: "database",
        };
      } catch (parseError) {
        LoggingUtilities.service.error(
          "HdbService.statistics",
          "Failed to parse JSON from database"
        );
      }
    }

    LoggingUtilities.service.info(
      "HdbService.statistics",
      `No existing records found for batch ${currentBatch}, fetching from HDB website...`
    );

    // Fetch from HDB website
    const url =
      "https://www.hdb.gov.sg/residential/renting-a-flat/renting-from-hdb/parenthood-provisional-housing-schemepphs/application-procedure/flats-available-for-application-";

    const response = await axios.get(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.3",
      },
    });

    const root = parse(response.data);
    const tables = root.querySelectorAll("table");

    if (tables.length === 0) {
      throw new Error("No tables found on the page.");
    }

    const pphsTable = tables[0];
    const records = this.parseTable(pphsTable);

    // Store the new records in database
    try {
      await this.db.insert<ITB_HDB_PPHS>("tb_hdb_pphs", {
        batch: currentBatch,
        json_string: JSON.stringify(records),
        created_dt: new Date().getTime(),
        created_by: "SYSTEM",
      });
      LoggingUtilities.service.info(
        "HdbService.statistics",
        `Successfully stored ${records.length} records for batch ${currentBatch} in database`
      );
    } catch (error) {
      LoggingUtilities.service.error(
        "HdbService.statistics",
        "Failed to insert records into database"
      );
    }

    return {
      records,
      source: "website",
    };
  }

  async retrieveListOfPphsWithCoordinates(): Promise<{
    records: (FlatRecord & { formedUrl: string; lat: string; lng: string })[];
    source: "database" | "website" | "error";
  }> {
    const { records, source } = await this.retrieveListOfPphs();

    const recordsWithCoordinates = await Promise.all(
      records.map(async (record) => {
        LoggingUtilities.service.info(
          "HdbService.retrieveListOfPphsWithCoordinates",
          `Fetching coordinates for address: ${record.address}`
        );
        const { source, formed_url, lat, lng } =
          await this.coordinateService.getCoordinatesOfAddress(record.address);

        return {
          ...record,
          formedUrl: formed_url,
          lat: lat,
          lng: lng,
          source: source,
        };
      })
    );

    return {
      records: recordsWithCoordinates,
      source,
    };
  }

  private parseTable(table: HTMLElement): FlatRecord[] {
    const allRows = table.querySelectorAll("tbody > tr");
    const rows = allRows.slice(2);
    const results: FlatRecord[] = [];

    let currentTown = "";

    for (const row of rows) {
      const cells = row.querySelectorAll("td");

      if (cells.length < 5) {
        continue; // skip malformed rows
      }

      let addressCell: HTMLElement;
      let twoCell: HTMLElement;
      let threeCell: HTMLElement;
      let fourCell: HTMLElement;
      let expiryCell: HTMLElement;

      if (cells.length === 6) {
        // Town is included in this row
        const townText = cells[0].textContent?.trim();
        if (townText) {
          currentTown = townText;
        }

        addressCell = cells[1];
        twoCell = cells[2];
        threeCell = cells[3];
        fourCell = cells[4];
        expiryCell = cells[5];
      } else {
        // Town is from previous row
        addressCell = cells[0];
        twoCell = cells[1];
        threeCell = cells[2];
        fourCell = cells[3];
        expiryCell = cells[4];
      }

      const record: FlatRecord = {
        town: currentTown,
        address: addressCell.textContent?.trim() || "",
        flatTypes: {},
        siteExpiry: expiryCell.textContent?.trim() || "",
      };

      const t2 = twoCell.textContent?.trim();
      const t3 = threeCell.textContent?.trim();
      const t4 = fourCell.textContent?.trim();

      if (t2 && t2 !== "-") {
        record.flatTypes["2-room"] = t2;
      }
      if (t3 && t3 !== "-") {
        record.flatTypes["3-room"] = t3;
      }
      if (t4 && t4 !== "-") {
        record.flatTypes["4-room"] = t4;
      }

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

  // Optional: Method to get historical batches
  async getAvailableBatches(): Promise<string[]> {
    try {
      const batches = await this.db.find<ITB_HDB_PPHS>(
        "tb_hdb_pphs",
        {},
        {
          columns: ["batch"],
          orderBy: "batch",
          orderDirection: "desc",
        }
      );

      return [...new Set(batches.map((b) => b.batch))];
    } catch (error) {
      console.error("Error fetching available batches:", error);
      return [];
    }
  }
}
