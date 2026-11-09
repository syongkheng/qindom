// Server-side copy of the pieces of fndom's house planner the MCP tools need: the HDB 5-room walls, room
// bounds, the furniture catalogue sizes, the footprint/overlap maths and the fitted-wardrobe model.
// Keep in step with fndom src/constants/houseplan/* and src/utilities/houseGeometry.ts.

export const PLAN_NAME = "HDB 5-room";
export const PLAN_WIDTH = 15.1;
export const PLAN_DEPTH = 8.95;
export const CEILING = 2.6;
export const WALL_THICKNESS = 0.15;
export const LAYOUT_MAX_BYTES = 1_000_000;

export interface Wall {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  kind: "wall" | "door" | "parapet";
}

const W = (x1: number, y1: number, x2: number, y2: number): Wall => ({ x1, y1, x2, y2, kind: "wall" });
const D = (x1: number, y1: number, x2: number, y2: number): Wall => ({ x1, y1, x2, y2, kind: "door" });
const P = (x1: number, y1: number, x2: number, y2: number): Wall => ({ x1, y1, x2, y2, kind: "parapet" });

export const DEFAULT_WALLS: Wall[] = [
  W(0, 0, 15.1, 0), W(0, 0, 0, 7.7), W(15.1, 0, 15.1, 4.45), W(13.175, 4.45, 15.1, 4.45), W(13.175, 4.45, 13.175, 6.1),
  W(0, 7.7, 1.75, 7.7), W(1.75, 7.7, 2.35, 7.7), D(2.35, 7.7, 3.35, 7.7), W(3.35, 7.7, 4.575, 7.7),
  W(0, 4.9, 1.75, 4.9), W(1.75, 4.9, 1.75, 5.3), D(1.75, 5.3, 1.75, 6.1), W(1.75, 6.1, 1.75, 7.7),
  W(4.575, 6.1, 4.575, 8.95), W(4.575, 8.95, 10.18, 8.95), W(10.18, 6.1, 10.18, 8.95),
  W(8.75, 6.1, 8.75, 7.9), D(8.75, 7.9, 8.75, 8.7), W(8.75, 8.7, 8.75, 8.95),
  W(5.8, 0, 5.8, 3.35), W(8.8, 0, 8.8, 3.35), W(11.8, 0, 11.8, 3.35),
  W(5.8, 3.35, 7.9, 3.35), D(7.9, 3.35, 8.8, 3.35), W(8.8, 3.35, 9.0, 3.35), D(9.0, 3.35, 9.9, 3.35), W(9.9, 3.35, 11.8, 3.35),
  D(11.8, 3.35, 11.8, 4.45),
  W(8.75, 4.45, 9.1, 4.45), D(9.1, 4.45, 9.9, 4.45), W(9.9, 4.45, 11.95, 4.45), D(11.95, 4.45, 12.65, 4.45), W(12.65, 4.45, 13.175, 4.45),
  W(8.75, 4.45, 8.75, 6.1), W(10.925, 4.45, 10.925, 6.1), W(8.75, 6.1, 13.175, 6.1),
  P(10.4, 7.0, 13.175, 7.0), P(10.4, 6.1, 10.4, 7.0), P(13.175, 6.1, 13.175, 7.0),
];

export interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** Usable floor of each room that has a straight wall to put furniture against (plan metres). */
export const ROOMS: Record<string, { name: string; bounds: Rect }> = {
  main_bedroom: { name: "Main bedroom", bounds: { x0: 11.8, y0: 0, x1: 15.1, y1: 4.45 } },
  bedroom_2: { name: "Bedroom 2", bounds: { x0: 8.8, y0: 0, x1: 11.8, y1: 3.35 } },
  bedroom_3: { name: "Bedroom 3", bounds: { x0: 5.8, y0: 0, x1: 8.8, y1: 3.35 } },
  study: { name: "Suggested study", bounds: { x0: 3.4, y0: 0, x1: 5.8, y1: 3.35 } },
  living: { name: "Living area (north-west corner; dining sits below it)", bounds: { x0: 0, y0: 0, x1: 3.4, y1: 4.9 } },
  kitchen: { name: "Kitchen", bounds: { x0: 4.575, y0: 6.1, x1: 8.75, y1: 8.95 } },
};
export const ROOM_IDS = Object.keys(ROOMS) as [string, ...string[]];

export interface CatalogEntry {
  name: string;
  w: number;
  d: number;
  h: number;
  category: string;
}

export const CATALOGUE: Record<string, CatalogEntry> = {
  sofa3: { name: "3-seater sofa", w: 2.1, d: 0.9, h: 0.8, category: "Living" },
  sofaL: { name: "L-shaped sofa", w: 2.6, d: 1.6, h: 0.8, category: "Living" },
  armchair: { name: "Armchair", w: 0.85, d: 0.85, h: 0.8, category: "Living" },
  coffee: { name: "Coffee table", w: 1.1, d: 0.6, h: 0.45, category: "Living" },
  tvc: { name: "TV console", w: 1.8, d: 0.4, h: 0.5, category: "Living" },
  dine6: { name: "Dining table (6 pax)", w: 1.6, d: 0.9, h: 0.75, category: "Dining" },
  dine4: { name: "Dining table (4 pax)", w: 1.2, d: 0.8, h: 0.75, category: "Dining" },
  round: { name: "Round table", w: 1.0, d: 1.0, h: 0.75, category: "Dining" },
  king: { name: "King bed", w: 1.83, d: 1.9, h: 0.5, category: "Bedroom" },
  queen: { name: "Queen bed", w: 1.52, d: 1.9, h: 0.5, category: "Bedroom" },
  ssingle: { name: "Super single bed", w: 1.07, d: 1.9, h: 0.5, category: "Bedroom" },
  single: { name: "Single bed", w: 0.91, d: 1.9, h: 0.5, category: "Bedroom" },
  wardrobe: { name: "Wardrobe", w: 1.8, d: 0.6, h: 2.2, category: "Bedroom" },
  bedside: { name: "Bedside table", w: 0.45, d: 0.4, h: 0.5, category: "Bedroom" },
  desk: { name: "Study desk", w: 1.2, d: 0.6, h: 0.75, category: "Study" },
  bookshelf: { name: "Bookshelf", w: 0.8, d: 0.3, h: 1.8, category: "Study" },
  fridge: { name: "Fridge", w: 0.7, d: 0.7, h: 1.8, category: "Kitchen" },
  washer: { name: "Washing machine", w: 0.6, d: 0.6, h: 0.85, category: "Utility" },
  shoe: { name: "Shoe cabinet", w: 1.0, d: 0.35, h: 1.0, category: "Utility" },
};
export const CATALOGUE_IDS = Object.keys(CATALOGUE) as [string, ...string[]];

export interface PlacedItem {
  uid: string;
  catalogId: string;
  name: string;
  w: number;
  d: number;
  h: number;
  category: string;
  x: number;
  y: number;
  rot: number;
  parts?: FurniturePart[];
}

export interface FurniturePart {
  shape: "box" | "cylinder" | "sphere" | "roll" | "half";
  sx: number;
  sy: number;
  sz: number;
  px: number;
  py: number;
  pz: number;
  ry: number;
  round: number;
  taper: number;
  color?: string;
}

// ---- geometry -------------------------------------------------------------
const EPS = 1e-6;

type Boxed = Pick<PlacedItem, "x" | "y" | "w" | "d" | "rot">;
type Pt = [number, number];
const isQuarter = (rot: number) => Math.abs(rot % 90) < 1e-9;

/** Axis-aligned box: exact for quarter turns, the bounding box of the rotated rectangle for free angles. */
export function footprint(item: Boxed): Rect {
  if (isQuarter(item.rot)) {
    const swap = item.rot % 180 !== 0;
    const hx = (swap ? item.d : item.w) / 2;
    const hy = (swap ? item.w : item.d) / 2;
    return { x0: item.x - hx, y0: item.y - hy, x1: item.x + hx, y1: item.y + hy };
  }
  const a = (item.rot * Math.PI) / 180;
  const c = Math.abs(Math.cos(a));
  const s = Math.abs(Math.sin(a));
  const hx = (item.w * c + item.d * s) / 2;
  const hy = (item.w * s + item.d * c) / 2;
  return { x0: item.x - hx, y0: item.y - hy, x1: item.x + hx, y1: item.y + hy };
}

const polygon = (item: Boxed): Pt[] => {
  const a = (item.rot * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  return ([[-1, -1], [1, -1], [1, 1], [-1, 1]] as Pt[]).map(([sx, sy]) => {
    const lx = (sx * item.w) / 2;
    const ly = (sy * item.d) / 2;
    return [item.x + lx * c - ly * s, item.y + lx * s + ly * c] as Pt;
  });
};
const rectPoly = (r: Rect): Pt[] => [[r.x0, r.y0], [r.x1, r.y0], [r.x1, r.y1], [r.x0, r.y1]];

/** Separating-axis test; touching edges do not overlap. */
function polysOverlap(a: Pt[], b: Pt[]): boolean {
  for (const poly of [a, b]) {
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i];
      const q = poly[(i + 1) % poly.length];
      const nx = q[1] - p[1];
      const ny = p[0] - q[0];
      const len = Math.hypot(nx, ny) || 1;
      const pa = a.map((v) => (v[0] * nx + v[1] * ny) / len);
      const pb = b.map((v) => (v[0] * nx + v[1] * ny) / len);
      if (Math.max(...pa) <= Math.min(...pb) + EPS || Math.max(...pb) <= Math.min(...pa) + EPS) return false;
    }
  }
  return true;
}

export const rectsOverlap = (a: Rect, b: Rect) => a.x0 < b.x1 - EPS && a.x1 > b.x0 + EPS && a.y0 < b.y1 - EPS && a.y1 > b.y0 + EPS;

/** Wall footprints with thickness; door openings stay passable. */
export function wallRects(walls: Wall[]): Rect[] {
  const t = WALL_THICKNESS / 2;
  return walls
    .filter((w) => w.kind !== "door")
    .map((w) => ({
      x0: Math.min(w.x1, w.x2) - t,
      y0: Math.min(w.y1, w.y2) - t,
      x1: Math.max(w.x1, w.x2) + t,
      y1: Math.max(w.y1, w.y2) + t,
    }));
}

/** What a piece collides with: walls, or the uids of other items. */
export function conflictsFor(item: PlacedItem, others: PlacedItem[], walls: Wall[]): { wall: boolean; items: string[] } {
  const r = footprint(item);
  const exact = (a: Boxed, ra: Rect, b: Boxed, rb: Rect) =>
    rectsOverlap(ra, rb) && (isQuarter(a.rot) && isQuarter(b.rot) ? true : polysOverlap(polygon(a), polygon(b)));
  return {
    wall: wallRects(walls).some((w) => rectsOverlap(r, w) && (isQuarter(item.rot) || polysOverlap(polygon(item), rectPoly(w)))),
    items: others.filter((o) => o.uid !== item.uid && exact(item, r, o, footprint(o))).map((o) => o.uid),
  };
}

export function roomOf(x: number, y: number): string | null {
  for (const [id, r] of Object.entries(ROOMS)) {
    if (x >= r.bounds.x0 && x <= r.bounds.x1 && y >= r.bounds.y0 && y <= r.bounds.y1) return id;
  }
  return null;
}

// ---- placement against a wall ----------------------------------------------
export type Side = "north" | "south" | "east" | "west";
export type Along = "start" | "center" | "end";

const ROT: Record<Side, number> = { north: 0, east: 90, south: 180, west: 270 };
/** Gap between the wall's face and the back of a piece. */
const INSET = WALL_THICKNESS / 2 + 0.01;

/**
 * Centre position and rotation for a piece standing against one wall of a room, with its back to that wall.
 * `offset` (metres from the wall's start corner: west end of a north/south wall, north end of an east/west wall)
 * overrides `along`.
 */
export function placeAgainstWall(
  room: Rect,
  side: Side,
  w: number,
  d: number,
  along: Along,
  offset?: number,
): { x: number; y: number; rot: number } {
  const rot = ROT[side];
  const horizontal = side === "north" || side === "south";
  // The piece's width always runs along the wall it stands against (rotation turns it with the wall), depth out from it.
  const run = w;
  const depth = d;
  const lo = horizontal ? room.x0 : room.y0;
  const hi = horizontal ? room.x1 : room.y1;
  const free0 = lo + INSET;
  const free1 = hi - INSET;
  let start: number;
  if (offset !== undefined) start = lo + offset;
  else if (along === "start") start = free0;
  else if (along === "end") start = free1 - run;
  else start = (free0 + free1 - run) / 2;
  const c = start + run / 2;
  if (side === "north") return { x: c, y: room.y0 + INSET + depth / 2, rot };
  if (side === "south") return { x: c, y: room.y1 - INSET - depth / 2, rot };
  if (side === "west") return { x: room.x0 + INSET + depth / 2, y: c, rot };
  return { x: room.x1 - INSET - depth / 2, y: c, rot };
}

// ---- fitted wardrobe ----------------------------------------------------------
const part = (o: Partial<FurniturePart>): FurniturePart => ({ shape: "box", sx: 0.5, sy: 0.5, sz: 0.5, px: 0, py: 0, pz: 0, ry: 0, round: 0, taper: 1, ...o });

/**
 * Built-in-wardrobe model: a carcass the full height, a dark plinth recess, and hinged door panels with handles.
 * Back is -z. Bounding box is exactly w x d x h so the planner's overlap check matches what is drawn.
 */
export function fittedWardrobeParts(w: number, d: number, h: number, color = "#ece6da"): FurniturePart[] {
  const plinth = 0.08;
  const door = 0.02;
  const doors = Math.max(2, Math.round(w / 0.5));
  const dw = w / doors;
  const parts: FurniturePart[] = [
    part({ sx: w, sy: h, sz: d - door, pz: -door / 2, color: "#d8d0c2" }),
    part({ sx: w - 0.02, sy: plinth, sz: door, pz: d / 2 - door / 2, color: "#3d3a45" }),
  ];
  for (let i = 0; i < doors; i++) {
    const cx = -w / 2 + dw * (i + 0.5);
    parts.push(part({ sx: dw - 0.006, sy: h - plinth, sz: door, px: cx, py: plinth, pz: d / 2 - door / 2, color, round: 0.04 }));
    // Handles sit on the inner edge of each pair of doors, at hand height.
    const edge = i % 2 === 0 ? 1 : -1;
    parts.push(part({ sx: 0.02, sy: 0.5, sz: 0.014, px: cx + edge * (dw / 2 - 0.05), py: Math.min(1.0, h * 0.4), pz: d / 2 - 0.007, color: "#b9c1c9" }));
  }
  return parts;
}

export function partsSize(parts: FurniturePart[]): { w: number; d: number; h: number } {
  const b = { x0: Infinity, x1: -Infinity, z0: Infinity, z1: -Infinity, y1: 0 };
  for (const p of parts) {
    b.x0 = Math.min(b.x0, p.px - p.sx / 2);
    b.x1 = Math.max(b.x1, p.px + p.sx / 2);
    b.z0 = Math.min(b.z0, p.pz - p.sz / 2);
    b.z1 = Math.max(b.z1, p.pz + p.sz / 2);
    b.y1 = Math.max(b.y1, p.py + p.sy);
  }
  const r3 = (v: number) => Math.round(v * 1000) / 1000;
  return { w: r3(b.x1 - b.x0), d: r3(b.z1 - b.z0), h: r3(b.y1) };
}
