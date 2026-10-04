import type { Column, Rel, Table } from "../types";

export const W = 212;
export const HEAD = 34;
export const ROWH = 24;

type Pt = [number, number];

export interface EdgeGeo {
  id: string;
  d: string;
  marks: string;
  opt: string;
  // Where the line meets the foreign key column (a) and the referenced column (b).
  a: Pt;
  b: Pt;
}

export function tableHeight(t: Table): number {
  return HEAD + t.cols.length * ROWH + 5;
}

export function bbox(tables: Table[]) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  tables.forEach((t) => {
    x0 = Math.min(x0, t.x); y0 = Math.min(y0, t.y);
    x1 = Math.max(x1, t.x + W); y1 = Math.max(y1, t.y + tableHeight(t));
  });
  return { x: x0 - 24, y: y0 - 8, w: x1 - x0 + 48, h: y1 - y0 + 16 };
}

function rounded(pts: Pt[], r: number): string {
  let d = "M" + pts[0][0] + " " + pts[0][1];
  for (let i = 1; i < pts.length - 1; i++) {
    const a = pts[i - 1], b = pts[i], c = pts[i + 1];
    const l1 = Math.hypot(b[0] - a[0], b[1] - a[1]), l2 = Math.hypot(c[0] - b[0], c[1] - b[1]);
    const rr = Math.min(r, l1 / 2, l2 / 2);
    if (rr < 0.5) { d += " L" + b[0] + " " + b[1]; continue; }
    const ax = b[0] - ((b[0] - a[0]) / l1) * rr, ay = b[1] - ((b[1] - a[1]) / l1) * rr;
    const bx = b[0] + ((c[0] - b[0]) / l2) * rr, by = b[1] + ((c[1] - b[1]) / l2) * rr;
    d += " L" + ax + " " + ay + " Q" + b[0] + " " + b[1] + " " + bx + " " + by;
  }
  const z = pts[pts.length - 1];
  return d + " L" + z[0] + " " + z[1];
}

interface Item {
  r: Rel; S: Table; T: Table; y1: number; y2: number;
  kind: "lr" | "rl" | "loopL" | "loopR"; key: string; fk: Column; lane: number; n: number;
}

// Orthogonal connectors with crow's-foot marks; edges that share the same gap
// between tables are spread into lanes so they don't overlap.
export function edgeGeometry(tables: Table[], rels: Rel[]): EdgeGeo[] {
  const by: Record<string, Table> = {};
  tables.forEach((t) => { by[t.id] = t; });
  const minX = tables.reduce((m, t) => Math.min(m, t.x), Infinity);
  const items: Item[] = [];
  rels.forEach((r) => {
    const S = by[r.from.t], T = by[r.to.t];
    if (!S || !T) return;
    const si = S.cols.findIndex((c) => c.id === r.from.c), ti = T.cols.findIndex((c) => c.id === r.to.c);
    if (si < 0 || ti < 0) return;
    const y1 = S.y + HEAD + si * ROWH + ROWH / 2, y2 = T.y + HEAD + ti * ROWH + ROWH / 2;
    let kind: Item["kind"], key: string;
    if (S !== T && S.x + W + 24 <= T.x) { kind = "lr"; key = "G" + Math.round(S.x + W) + "_" + Math.round(T.x); }
    else if (S !== T && T.x + W + 24 <= S.x) { kind = "rl"; key = "G" + Math.round(T.x + W) + "_" + Math.round(S.x); }
    else if (Math.min(S.x, T.x) <= minX + 1) { kind = "loopL"; key = "LL" + Math.round(Math.min(S.x, T.x)); }
    else { kind = "loopR"; key = "LR" + Math.round(Math.max(S.x, T.x)); }
    items.push({ r, S, T, y1, y2, kind, key, fk: S.cols[si], lane: 0, n: 1 });
  });
  const groups: Record<string, Item[]> = {};
  items.forEach((it) => { (groups[it.key] = groups[it.key] || []).push(it); });
  Object.keys(groups).forEach((k) => {
    const g = groups[k];
    if (k.charAt(0) === "L") g.sort((a, b) => Math.abs(a.y2 - a.y1) - Math.abs(b.y2 - b.y1));
    else g.sort((a, b) => a.y1 + a.y2 - (b.y1 + b.y2));
    g.forEach((it, i) => { it.lane = i; it.n = g.length; });
  });
  return items.map((it) => {
    const { S, T, y1, y2 } = it;
    let pts: Pt[], d1: number, d2: number;
    if (it.kind === "lr" || it.kind === "rl") {
      const a = it.kind === "lr" ? S.x + W : S.x, b = it.kind === "lr" ? T.x : T.x + W;
      const m = Math.round((a + b) / 2 + (it.lane - (it.n - 1) / 2) * 10);
      pts = Math.abs(y1 - y2) < 1 ? [[a, y1], [b, y2]] : [[a, y1], [m, y1], [m, y2], [b, y2]];
      d1 = it.kind === "lr" ? 1 : -1; d2 = d1;
    } else if (it.kind === "loopL") {
      const X = Math.min(S.x, T.x) - 22 - it.lane * 12;
      pts = [[S.x, y1], [X, y1], [X, y2], [T.x, y2]]; d1 = -1; d2 = 1;
    } else {
      const X = Math.max(S.x, T.x) + W + 22 + it.lane * 12;
      pts = [[S.x + W, y1], [X, y1], [X, y2], [T.x + W, y2]]; d1 = 1; d2 = -1;
    }
    const x1 = pts[0][0], x2 = pts[pts.length - 1][0];
    // Crow's foot on the "many" side; a single bar when the relationship is one-to-one.
    let marks = it.r.one
      ? "M" + (x1 + d1 * 7) + " " + (y1 - 5) + " L" + (x1 + d1 * 7) + " " + (y1 + 5)
      : "M" + (x1 + d1 * 11) + " " + y1 + " L" + x1 + " " + (y1 - 5) + " M" + (x1 + d1 * 11) + " " + y1 + " L" + x1 + " " + (y1 + 5);
    marks += " M" + (x2 - d2 * 7) + " " + (y2 - 5) + " L" + (x2 - d2 * 7) + " " + (y2 + 5);
    let opt = "";
    if (it.fk.nullable) { const cx = x2 - d2 * 15; opt = "M" + (cx - 3.5) + " " + y2 + " a3.5 3.5 0 1 0 7 0 a3.5 3.5 0 1 0 -7 0"; }
    else marks += " M" + (x2 - d2 * 11) + " " + (y2 - 5) + " L" + (x2 - d2 * 11) + " " + (y2 + 5);
    return { id: it.r.id, d: rounded(pts, 6), marks, opt, a: [x1, y1], b: [x2, y2] };
  });
}

// Ranks tables by distance from the tables they reference, one column of
// tables per rank, ordered within a column by the average position of parents.
export function layoutPositions(tables: Table[], rels: Rel[]): Record<string, { x: number; y: number }> {
  const GX = 68, GY = 48;
  const parents: Record<string, string[]> = {};
  tables.forEach((t) => { parents[t.id] = []; });
  rels.forEach((r) => { if (r.from.t !== r.to.t && parents[r.from.t] && parents[r.to.t]) parents[r.from.t].push(r.to.t); });
  const rank: Record<string, number> = {};
  const get = (id: string, seen: Record<string, boolean>): number => {
    if (rank[id] != null) return rank[id];
    if (seen[id]) return 0;
    seen[id] = true;
    const ps = parents[id];
    const v = ps.length ? Math.min(...ps.map((p) => get(p, seen))) + 1 : 0;
    rank[id] = v;
    return v;
  };
  tables.forEach((t) => get(t.id, {}));
  const cols: Table[][] = [];
  tables.forEach((t) => { const k = rank[t.id]; (cols[k] = cols[k] || []).push(t); });
  const order: Record<string, number> = {}, pos: Record<string, { x: number; y: number }> = {};
  let x = 40;
  cols.forEach((col) => {
    const bary: Record<string, number> = {};
    col.forEach((t) => {
      const ps = parents[t.id].filter((p) => order[p] != null);
      bary[t.id] = ps.length ? ps.reduce((a, p) => a + order[p], 0) / ps.length : 1000 + t.y / 1000;
    });
    col.sort((a, b) => bary[a.id] - bary[b.id] || a.y - b.y);
    let y = 40;
    col.forEach((t, i) => { order[t.id] = i; pos[t.id] = { x, y }; y += tableHeight(t) + GY; });
    x += W + GX;
  });
  return pos;
}
