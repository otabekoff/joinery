import { expect, test } from "bun:test";
import { W, bbox, edgeGeometry, layoutPositions, tableHeight } from "../src/editor/geometry";
import { fixture } from "./fixture";

test("every relationship gets a line that starts and ends on its tables", () => {
  const d = fixture();
  const edges = edgeGeometry(d.tables, d.rels);
  expect(edges.length).toBe(d.rels.length);
  for (const e of edges) {
    const r = d.rels.find((x) => x.id === e.id)!;
    const S = d.tables.find((t) => t.id === r.from.t)!, T = d.tables.find((t) => t.id === r.to.t)!;
    expect([S.x, S.x + W]).toContain(e.a[0]);
    expect([T.x, T.x + W]).toContain(e.b[0]);
    expect(e.d.startsWith("M" + e.a[0] + " " + e.a[1])).toBe(true);
  }
});

test("a one-to-one relationship draws a bar instead of a crow's foot", () => {
  const d = fixture();
  const edges = edgeGeometry(d.tables, d.rels);
  const one = edges.find((e) => e.id === d.rels[7].id)!, many = edges.find((e) => e.id === d.rels[0].id)!;
  expect(one.marks.split("M").length).toBeLessThan(many.marks.split("M").length);
});

test("auto layout leaves no tables overlapping", () => {
  const d = fixture();
  const pos = layoutPositions(d.tables, d.rels);
  d.tables.forEach((t) => Object.assign(t, pos[t.id]));
  for (const a of d.tables) for (const b of d.tables) {
    if (a === b) continue;
    const apart = a.x + W <= b.x || b.x + W <= a.x || a.y + tableHeight(a) <= b.y || b.y + tableHeight(b) <= a.y;
    expect(apart).toBe(true);
  }
  expect(bbox(d.tables).w).toBeGreaterThan(W);
});
