import { parse, HTMLElement } from "node-html-parser";
import { PphsFlatTypes, PphsRecord } from "./Hdb.types.js";

// The HDB page is a Next.js app: the PPHS table is HTML inside one accordion item of the
// page's __NEXT_DATA__ JSON (props.pageProps.componentProps.<uid>.props.accordionItems[].bodyContentVal).
const NEXT_DATA_SELECTOR = "script#__NEXT_DATA__";
const TABLE_MARKER = "<table>";

// Table layout: two header rows, then data rows. A row that starts a new town has a town
// cell (rowspan) first; the following rows of that town don't. The 4-room column is only
// there in some batches; the second header row then has ≥ 3 cells (2-room, 3-room, 4-room).
const HEADER_ROW_COUNT = 2;
const FOUR_ROOM_HEADER_MIN_CELLS = 3;
/** Printed instead of a unit count when a flat type isn't offered. */
const NOT_OFFERED = "-";

interface AccordionComponent {
  props?: { accordionItems?: { bodyContentVal?: unknown }[] };
}

/** The accordion HTML that holds the PPHS table, or null when the page doesn't have it (layout changed). */
export function extractPphsTableHtml(pageHtml: string): string | null {
  const script = parse(pageHtml).querySelector(NEXT_DATA_SELECTOR);
  if (!script) return null;

  let componentProps: Record<string, unknown>;
  try {
    componentProps = JSON.parse(script.text)?.props?.pageProps?.componentProps ?? {};
  } catch {
    return null;
  }

  for (const component of Object.values(componentProps)) {
    const items = (component as AccordionComponent | null)?.props?.accordionItems;
    if (!Array.isArray(items)) continue;
    const match = items.find(
      (item) => typeof item.bodyContentVal === "string" && item.bodyContentVal.includes(TABLE_MARKER),
    );
    if (match) return match.bodyContentVal as string;
  }
  return null;
}

const cellText = (cell: HTMLElement | null | undefined) => cell?.textContent?.trim() ?? "";

/** Rows of the first table in `tableHtml`, or null when there is no table. */
export function parsePphsTable(tableHtml: string): PphsRecord[] | null {
  const table = parse(tableHtml).querySelector("table");
  if (!table) return null;

  const allRows = table.querySelectorAll("tbody > tr");
  const hasFourRoom = (allRows[1]?.querySelectorAll("td").length ?? 0) >= FOUR_ROOM_HEADER_MIN_CELLS;
  // town, address, 2-room, 3-room, [4-room], expiry
  const cellsWithTown = hasFourRoom ? 6 : 5;

  const records: PphsRecord[] = [];
  let currentTown = "";

  for (const row of allRows.slice(HEADER_ROW_COUNT)) {
    const cells = row.querySelectorAll("td");
    if (cells.length < cellsWithTown - 1) continue;

    const hasTown = cells.length >= cellsWithTown;
    if (hasTown && cellText(cells[0])) currentTown = cellText(cells[0]);
    const [address, twoRoom, threeRoom, ...rest] = hasTown ? cells.slice(1) : cells;
    const fourRoom = hasFourRoom ? rest[0] : null;
    const expiry = hasFourRoom ? rest[1] : rest[0];

    const flatTypes: PphsFlatTypes = {};
    const offered = (cell: HTMLElement | null | undefined) => {
      const text = cellText(cell);
      return text && text !== NOT_OFFERED ? text : undefined;
    };
    if (offered(twoRoom)) flatTypes["2-room"] = offered(twoRoom);
    if (offered(threeRoom)) flatTypes["3-room"] = offered(threeRoom);
    if (offered(fourRoom)) flatTypes["4-room"] = offered(fourRoom);

    records.push({ town: currentTown, address: cellText(address), flatTypes, siteExpiry: cellText(expiry) });
  }
  return records;
}

/** The PPHS records on the HDB page, or null when the page layout isn't what we expect. */
export function parsePphsPage(pageHtml: string): PphsRecord[] | null {
  const tableHtml = extractPphsTableHtml(pageHtml);
  return tableHtml === null ? null : parsePphsTable(tableHtml);
}
