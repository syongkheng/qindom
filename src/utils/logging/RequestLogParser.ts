import { STATUS_CODES } from "http";
import { RequestLogEntryDto, RequestLogEventDto } from "../../models/dtos/RequestLogDto.js";

// Parses the verbose text written by LoggingUtilities.request.render() back
// into structure for the Log Searcher. Lives next to the writer so the two
// formats stay in sync — if render() changes, update the patterns here.

const HEADER_RE = /^\[(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3})\] (\S+) (\S+) (.+)$/;
const FIELD_RE = /^│ (RequestId|IP|Payload)\s*: (.*)$/;
const EVENT_RE = /^(├─|✖) (\S+)\s+(.*)$/;
const CHILD_RE = /^│  [├└]─ (.*)$/;
const STACK_FRAME_RE = /^│ {7}(.*)$/;
const DURATION_LINE_RE = /^(\d+)ms$/;
const RESPONSE_RE = /^└─ RESPONSE (\d+)/;
const RESPONSE_FIRST_RE = /^ {3}└─ (.*)$/;
const RESPONSE_CONT_RE = /^ {3}(.*)$/;
const TOTAL_DURATION_RE = /^Duration: (\d+)ms/;
const STAGE_RE = /^│ ── (middleware|controller|service)$/;

type Stage = RequestLogEventDto["stage"];

// Entries written before stage markers existed: infer from what's known about
// where each event type/message comes from.
const LEGACY_MIDDLEWARE_EVENTS = new Set(["General headers", "Specific headers", "JWT"]);
const CONTROLLER_TYPES = new Set(["VALIDATION", "ERROR", "WARN"]);

function inferStage(type: string, message: string): Stage {
  if (type === "VALIDATION" && LEGACY_MIDDLEWARE_EVENTS.has(message)) return "middleware";
  return CONTROLLER_TYPES.has(type) ? "controller" : "service";
}

export function parseRequestLogEntry(raw: string): RequestLogEntryDto | null {
  const lines = raw.split("\n");
  const headerIndex = lines.findIndex((line) => HEADER_RE.test(line));
  if (headerIndex === -1) return null;

  const header = lines[headerIndex].match(HEADER_RE)!;
  const entry: RequestLogEntryDto = {
    requestId: null,
    timestamp: header[1],
    method: header[3],
    path: header[4],
    ip: null,
    payload: null,
    events: [],
    statusCode: null,
    statusText: null,
    response: null,
    durationMs: null,
  };

  let current: RequestLogEventDto | null = null;
  let markedStage: Stage | null = null;
  let inStack = false;
  let responseLines: string[] | null = null;

  const finishResponse = () => {
    if (responseLines?.length) entry.response = responseLines.join("\n");
    responseLines = null;
  };

  for (const line of lines.slice(headerIndex + 1)) {
    const total = line.match(TOTAL_DURATION_RE);
    if (total) {
      entry.durationMs = Number(total[1]);
      finishResponse();
      continue;
    }

    // Response body runs until the blank line / Duration
    if (responseLines) {
      const first = responseLines.length === 0 ? line.match(RESPONSE_FIRST_RE) : null;
      const cont = line.match(RESPONSE_CONT_RE);
      if (first) responseLines.push(first[1]);
      else if (cont && line.trim()) responseLines.push(cont[1]);
      continue;
    }

    const field = line.match(FIELD_RE);
    if (field) {
      if (field[1] === "RequestId") entry.requestId = field[2].trim();
      else if (field[1] === "IP") entry.ip = field[2].trim();
      else entry.payload = field[2];
      continue;
    }

    const response = line.match(RESPONSE_RE);
    if (response) {
      entry.statusCode = Number(response[1]);
      entry.statusText = STATUS_CODES[entry.statusCode] ?? null;
      current = null;
      responseLines = [];
      continue;
    }

    const stageMarker = line.match(STAGE_RE);
    if (stageMarker) {
      markedStage = stageMarker[1] as Stage;
      current = null;
      continue;
    }

    const event = line.match(EVENT_RE);
    if (event) {
      current = {
        stage: markedStage ?? inferStage(event[2], event[3].trim()),
        type: event[2],
        message: event[3].trim(),
        isError: event[1] === "✖" || event[2] === "ERROR",
        lines: [],
        durationMs: null,
        stack: [],
      };
      entry.events.push(current);
      inStack = false;
      continue;
    }

    if (!current) continue;

    if (inStack) {
      const frame = line.match(STACK_FRAME_RE);
      if (frame) {
        current.stack.push(frame[1].trim());
        continue;
      }
      inStack = false;
    }

    const child = line.match(CHILD_RE);
    if (child) {
      const text = child[1].trim();
      const duration = text.match(DURATION_LINE_RE);
      if (text === "stack") inStack = true;
      else if (duration) current.durationMs = Number(duration[1]);
      else current.lines.push(text);
    }
  }

  finishResponse();
  return entry;
}
