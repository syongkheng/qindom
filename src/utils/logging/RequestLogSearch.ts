import fs from "fs";
import path from "path";
import { REQUEST_LOG_DIR, REQUEST_LOG_FILE_PREFIX } from "./RequestLogFileWriter.js";

// Reads qindom's own request-log file (see RequestLogFileWriter.ts), not PM2's
// stdout capture — works identically in dev (tsx watch) and prod (PM2).
const LOG_DIR = REQUEST_LOG_DIR;
const LOG_FILE_PREFIX = REQUEST_LOG_FILE_PREFIX;

const HEADER_RE = /^\[\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3}\] (\S+) (\S+) (.+)$/;
const REQUEST_ID_LINE_RE = /^│ RequestId : (.+)$/;
const RESPONSE_LINE_RE = /^└─ RESPONSE (\d+)/;

const MAX_MATCHES = 20;

export interface IRequestLogMatch {
  raw: string;
  timestamp: string;
  method: string;
  path: string;
  statusCode: number | null;
}

function listLogFiles(): string[] {
  if (!fs.existsSync(LOG_DIR)) return [];

  return fs
    .readdirSync(LOG_DIR)
    .filter((name) => name.startsWith(LOG_FILE_PREFIX))
    .map((name) => path.join(LOG_DIR, name))
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
}

function parseMatch(lines: string[], headerIndex: number, endIndex: number): IRequestLogMatch {
  const headerLine = lines[headerIndex];
  const headerMatch = headerLine.match(HEADER_RE);

  let statusCode: number | null = null;
  for (let i = headerIndex; i < endIndex; i++) {
    const respMatch = lines[i].match(RESPONSE_LINE_RE);
    if (respMatch) {
      statusCode = Number(respMatch[1]);
      break;
    }
  }

  return {
    raw: lines.slice(headerIndex, endIndex).join("\n").trimEnd(),
    timestamp: headerLine.slice(1, headerLine.indexOf("]")),
    method: headerMatch?.[2] ?? "",
    path: headerMatch?.[3] ?? "",
    statusCode,
  };
}

function findInFile(filePath: string, requestId: string, remaining: number): IRequestLogMatch[] {
  const content = fs.readFileSync(filePath, "utf-8");
  const lines = content.split("\n");

  const requestIdLines: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(REQUEST_ID_LINE_RE);
    if (m && m[1] === requestId) requestIdLines.push(i);
  }

  const matches: IRequestLogMatch[] = [];

  // Newest occurrence first within the file.
  for (const reqIdLine of requestIdLines.reverse()) {
    if (matches.length >= remaining) break;

    const headerIndex = reqIdLine - 1;
    if (headerIndex < 0 || !HEADER_RE.test(lines[headerIndex])) continue;

    let endIndex = lines.length;
    for (let i = headerIndex + 1; i < lines.length; i++) {
      if (HEADER_RE.test(lines[i])) {
        endIndex = i;
        break;
      }
    }

    matches.push(parseMatch(lines, headerIndex, endIndex));
  }

  return matches;
}

function collectRecentInFile(filePath: string, remaining: number): IRequestLogMatch[] {
  const content = fs.readFileSync(filePath, "utf-8");
  const lines = content.split("\n");

  const headerIndices: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (HEADER_RE.test(lines[i])) headerIndices.push(i);
  }

  const matches: IRequestLogMatch[] = [];

  // Newest header first within the file.
  for (const headerIndex of headerIndices.reverse()) {
    if (matches.length >= remaining) break;

    let endIndex = lines.length;
    for (let i = headerIndex + 1; i < lines.length; i++) {
      if (HEADER_RE.test(lines[i])) {
        endIndex = i;
        break;
      }
    }

    matches.push(parseMatch(lines, headerIndex, endIndex));
  }

  return matches;
}

export class RequestLogSearch {
  static find(requestId: string): IRequestLogMatch[] {
    const matches: IRequestLogMatch[] = [];

    for (const file of listLogFiles()) {
      if (matches.length >= MAX_MATCHES) break;
      matches.push(...findInFile(file, requestId, MAX_MATCHES - matches.length));
    }

    return matches;
  }

  // Newest requests overall, regardless of Request ID — used by the dashboard's
  // compact "last N logs" widget.
  static recent(limit: number): IRequestLogMatch[] {
    const capped = Math.min(limit, MAX_MATCHES);
    const matches: IRequestLogMatch[] = [];

    for (const file of listLogFiles()) {
      if (matches.length >= capped) break;
      matches.push(...collectRecentInFile(file, capped - matches.length));
    }

    return matches;
  }
}
