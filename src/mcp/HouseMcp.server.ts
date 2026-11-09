import crypto from "crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  CATALOGUE, CATALOGUE_IDS, CEILING, DEFAULT_WALLS, LAYOUT_MAX_BYTES, PLAN_DEPTH, PLAN_NAME, PLAN_WIDTH, ROOMS, ROOM_IDS,
  conflictsFor, fittedWardrobeParts, footprint, placeAgainstWall, roomOf, type Along, type PlacedItem, type Side, type Wall,
} from "./housePlan.js";

const FITTED = "fitted_wardrobe";
const r2 = (v: number) => Math.round(v * 100) / 100;

type ToolResult = { content: { type: "text"; text: string }[]; isError?: boolean };
const ok = (data: unknown): ToolResult => ({ content: [{ type: "text", text: JSON.stringify(data, null, 2) }] });
const fail = (message: string): ToolResult => ({ content: [{ type: "text", text: message }], isError: true });

interface LayoutData {
  version?: number;
  plan?: string;
  items: PlacedItem[];
  custom: unknown[];
  walls?: Wall[];
}

// The layout travels with every call (the server stores nothing): same JSON as the planner's Export JSON / Import JSON.
const itemSchema = z.looseObject({
  uid: z.string().max(100),
  catalogId: z.string().max(100),
  name: z.string().max(100),
  w: z.number().positive().max(20),
  d: z.number().positive().max(20),
  h: z.number().positive().max(20),
  category: z.string().max(40),
  x: z.number().min(-1).max(PLAN_WIDTH + 1),
  y: z.number().min(-1).max(PLAN_DEPTH + 1),
  rot: z.number(),
  parts: z.array(z.any()).max(40).optional(),
});
const wallSchema = z.looseObject({
  x1: z.number(), y1: z.number(), x2: z.number(), y2: z.number(),
  kind: z.enum(["wall", "door", "parapet"]),
});
const layoutSchema = z
  .looseObject({
    items: z.array(itemSchema).max(500),
    custom: z.array(z.any()).max(200).optional(),
    walls: z.array(wallSchema).max(400).optional(),
  })
  .describe("A house layout: the JSON from the planner's Export JSON, or one returned by another tool here");

type LayoutIn = z.infer<typeof layoutSchema>;

/** Public, stateless MCP server: tools take a layout and return the edited layout; nothing is stored or tied to a user. */
export function buildHouseMcpServer(): McpServer {
  const server = new McpServer({ name: "awense-house", version: "1.0.0" });

  const toData = (layout: LayoutIn): LayoutData => ({ ...(layout as object), items: layout.items as unknown as PlacedItem[], custom: layout.custom ?? [] }) as LayoutData;

  /** The layout to hand back to the user (the planner's Import JSON accepts it as is). */
  const out = (data: LayoutData): LayoutData => {
    const layout: LayoutData = { version: 1, plan: data.plan ?? PLAN_NAME, items: data.items, custom: data.custom, ...(data.walls ? { walls: data.walls } : {}) };
    if (Buffer.byteLength(JSON.stringify(layout), "utf8") > LAYOUT_MAX_BYTES) throw new Error("layout too large");
    return layout;
  };

  const wallsOf = (data: LayoutData): Wall[] => (Array.isArray(data.walls) ? data.walls : DEFAULT_WALLS);

  const brief = (it: PlacedItem, all: PlacedItem[], walls: Wall[]) => {
    const c = conflictsFor(it, all, walls);
    const f = footprint(it);
    return {
      id: it.uid,
      name: it.name,
      kind: it.catalogId,
      room: roomOf(it.x, it.y),
      centre: { x: r2(it.x), y: r2(it.y) },
      rotation: it.rot,
      size: { w: it.w, d: it.d, h: it.h },
      footprint: { x0: r2(f.x0), y0: r2(f.y0), x1: r2(f.x1), y1: r2(f.y1) },
      ...(c.wall || c.items.length ? { conflicts: { wall: c.wall, withItems: c.items } } : {}),
    };
  };

  const run = (fn: () => Promise<ToolResult>) => async (): Promise<ToolResult> => {
    try {
      return await fn();
    } catch (err: any) {
      return fail(err?.message ? `Failed: ${err.message}` : "Failed: layout not found or invalid");
    }
  };

  server.registerTool(
    "new_layout",
    { description: `Start an empty layout on the ${PLAN_NAME} plan. Pass the result as 'layout' to add_furniture etc.` },
    run(async () => ok(out({ items: [], custom: [] }))),
  );

  server.registerTool(
    "describe_layout",
    {
      description:
        `Describe a layout on the ${PLAN_NAME} plan (${PLAN_WIDTH} m x ${PLAN_DEPTH} m, ceiling ${CEILING} m): the rooms you can place into, ` +
        "every placed item with its room, position, size and any conflicts. Metres; x runs west to east, y runs north to south.",
      inputSchema: { layout: layoutSchema },
    },
    async ({ layout }) =>
      run(async () => {
        const data = toData(layout);
        const walls = wallsOf(data);
        return ok({
          plan: { name: PLAN_NAME, width: PLAN_WIDTH, depth: PLAN_DEPTH, ceiling: CEILING, wallsEdited: Array.isArray(data.walls) },
          rooms: Object.fromEntries(Object.entries(ROOMS).map(([id, r]) => [id, { name: r.name, ...r.bounds }])),
          items: data.items.map((it) => brief(it, data.items, walls)),
        });
      })(),
  );

  server.registerTool(
    "check_fit",
    {
      description: "List items in a layout that overlap a wall or each other.",
      inputSchema: { layout: layoutSchema },
    },
    async ({ layout }) =>
      run(async () => {
        const data = toData(layout);
        const walls = wallsOf(data);
        const bad = data.items.map((it) => brief(it, data.items, walls)).filter((b) => b.conflicts);
        return ok({ ok: bad.length === 0, conflicts: bad });
      })(),
  );

  server.registerTool(
    "add_furniture",
    {
      description:
        "Add a piece of furniture standing against a wall of a room, back to the wall. Returns the updated layout JSON. " +
        `kind '${FITTED}' is a built-in wardrobe with door panels; with floorToCeiling (the default for it) it is ${CEILING} m tall. ` +
        "Other kinds are the planner's catalogue pieces and can be resized with width/depth/height. " +
        "Nothing is added if it would overlap a wall or another item (unless allowOverlap); the clash is reported instead.",
      inputSchema: {
        layout: layoutSchema,
        kind: z.enum([FITTED, ...CATALOGUE_IDS]).describe(`One of: ${FITTED}, ${CATALOGUE_IDS.join(", ")}`),
        room: z.enum(ROOM_IDS),
        wall: z.enum(["north", "south", "east", "west"]).describe("Which wall of the room the back of the piece faces"),
        along: z.enum(["start", "center", "end"]).optional().describe("Where along that wall (default center). start = west end of a north/south wall, north end of an east/west wall"),
        offsetM: z.number().min(0).max(15).optional().describe("Metres from the start of the wall to the piece's start edge; overrides 'along'"),
        width: z.number().min(0.2).max(6).optional().describe("Metres along the wall"),
        depth: z.number().min(0.1).max(3).optional().describe("Metres out from the wall"),
        height: z.number().min(0.1).max(CEILING).optional(),
        floorToCeiling: z.boolean().optional().describe(`Make the piece ${CEILING} m tall`),
        color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional().describe("Door colour for fitted_wardrobe, e.g. #ece6da"),
        allowOverlap: z.boolean().optional(),
      },
    },
    async (a) =>
      run(async () => {
        const data = toData(a.layout);
        const walls = wallsOf(data);
        if (data.items.length >= 500) return fail("Layout already has the maximum 500 items.");
        const base = a.kind === FITTED ? { name: "Fitted wardrobe", w: 1.8, d: 0.6, h: CEILING, category: "Bedroom" } : CATALOGUE[a.kind];
        const w = a.width ?? base.w;
        const d = a.depth ?? base.d;
        const h = a.floorToCeiling ? CEILING : (a.height ?? base.h);
        const pos = placeAgainstWall(ROOMS[a.room].bounds, a.wall as Side, w, d, (a.along ?? "center") as Along, a.offsetM);
        const item: PlacedItem = {
          uid: crypto.randomUUID(),
          catalogId: a.kind,
          name: base.name,
          w, d, h,
          category: base.category,
          x: r2(pos.x), y: r2(pos.y), rot: pos.rot,
          ...(a.kind === FITTED ? { parts: fittedWardrobeParts(w, d, h, a.color) } : {}),
        };
        const clash = conflictsFor(item, data.items, walls);
        const withNames = clash.items.map((id) => data.items.find((i) => i.uid === id)?.name ?? id);
        if ((clash.wall || clash.items.length) && !a.allowOverlap) {
          return fail(
            `Not placed: it would overlap ${[clash.wall ? "a wall" : "", ...withNames].filter(Boolean).join(", ")}. ` +
              "Try another wall, along/offsetM, or a smaller size (see describe_layout).",
          );
        }
        data.items.push(item);
        return ok({ added: brief(item, data.items, walls), layout: out(data), note: "Save 'layout' as a .json file and load it with Import JSON in the House planner." });
      })(),
  );

  server.registerTool(
    "move_item",
    {
      description: "Move and/or rotate an existing item (by id from describe_layout). Returns the updated layout; nothing changes if it would overlap a wall or another item.",
      inputSchema: {
        layout: layoutSchema,
        itemId: z.string(),
        x: z.number().min(0).max(PLAN_WIDTH).optional(),
        y: z.number().min(0).max(PLAN_DEPTH).optional(),
        rot: z.number().min(0).max(360).optional().describe("Degrees clockwise: 0 = back to the north wall, 90 = east, 180 = south, 270 = west; any angle in between is allowed"),
      },
    },
    async (a) =>
      run(async () => {
        const data = toData(a.layout);
        const walls = wallsOf(data);
        const idx = data.items.findIndex((i) => i.uid === a.itemId);
        if (idx < 0) return fail("No item with that id in this layout.");
        const moved = { ...data.items[idx], x: a.x ?? data.items[idx].x, y: a.y ?? data.items[idx].y, rot: a.rot ?? data.items[idx].rot };
        const clash = conflictsFor(moved, data.items, walls);
        if (clash.wall || clash.items.length) return fail("Not moved: the new position overlaps a wall or another item.");
        data.items[idx] = moved;
        return ok({ moved: brief(moved, data.items, walls), layout: out(data) });
      })(),
  );

  server.registerTool(
    "remove_item",
    {
      description: "Remove an item from a layout (by id from describe_layout). Returns the updated layout.",
      inputSchema: { layout: layoutSchema, itemId: z.string() },
    },
    async ({ layout, itemId }) =>
      run(async () => {
        const data = toData(layout);
        const next = data.items.filter((i) => i.uid !== itemId);
        if (next.length === data.items.length) return fail("No item with that id in this layout.");
        return ok({ removed: itemId, layout: out({ ...data, items: next }) });
      })(),
  );

  return server;
}
