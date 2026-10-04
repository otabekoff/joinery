import { computed, nextTick, onBeforeUnmount, onMounted, reactive, shallowRef, watch } from "vue";
import { convertColumn, convertDesign } from "../convert";
import { keyOf } from "../keys";
import { family, idColumn, typeGroups as engineTypes } from "../engines";
import { parseSql } from "../sql/import";
import { mode, plural, store, touchDesign } from "../store";
import type { ColRef, Column, Design, FkAction, IndexDef, Note, Rel, Table } from "../types";
import { HEAD, ROWH, W, bbox, edgeGeometry, layoutPositions, tableHeight } from "./geometry";

export type Sel =
  | { kind: "tables"; ids: string[] }
  | { kind: "column"; t: string; c: string }
  | { kind: "rel"; id: string };

type PickerWhere = "draft" | "insp";
type Picker = { where: PickerWhere; q: string; hi: number };
type Drag =
  | { type: "move"; sx: number; sy: number; orig: { id: string; x: number; y: number }[]; before: string; moved: boolean }
  | { type: "pan"; sx: number; sy: number; px: number; py: number; moved: boolean }
  | { type: "marquee"; sx: number; sy: number }
  | { type: "mini" }
  | { type: "note"; id: string; sx: number; sy: number; ox: number; oy: number; before: string; moved: boolean }
  | { type: "connect" };
type RelEnd = "from" | "to";

export interface MenuItem {
  sep: boolean;
  label: string;
  kbd: string;
  danger: boolean;
  act: () => void;
}

// Copied tables, shared between designs so they can be pasted into another one.
let clipboard: { engine: string; tables: Table[]; rels: Rel[] } | null = null;

export function useEditor(design: Design) {
  const st = reactive({
    sel: null as Sel | null,
    past: [] as string[],
    future: [] as string[],
    zoom: 1,
    panX: 27,
    panY: 27,
    vp: { w: 907, h: 795 },
    inspOverlay: false,
    search: { open: false, q: "", hi: 0 },
    picker: null as Picker | null,
    entry: null as { tid: string; name: string; type: string } | null,
    cm: null as { kind: "table" | "rel" | "canvas"; id?: string; wx: number; wy: number } | null,
    // `re` is set while an existing relationship's end is being dragged to another column.
    ghost: null as { from: ColRef; x: number; y: number; over: ColRef | null; re?: { id: string; which: RelEnd } } | null,
    marquee: null as { x: number; y: number; w: number; h: number } | null,
    located: null as string | null,
    dd: null as string | null,
    // Which toolbar menu is open: the design menu, the types panel or the file menu.
    menu: null as "design" | "types" | "file" | "issues" | null,
    idxEdit: null as string | null,
    notice: "",
    help: false,
  });

  const vpEl = shallowRef<HTMLElement | null>(null);
  let drag: Drag | null = null;
  let fitted = false;
  // True while the view is the result of a fit, so it can be refitted when the canvas changes size.
  let autoView = true;
  let lastMaxZ = 1;
  let pendingAdjust = false;
  let ro: ResizeObserver | undefined;

  const focusEl = (selector: string, select = false) => nextTick(() => {
    const el = document.querySelector<HTMLInputElement>(selector);
    if (!el) return;
    el.focus();
    if (select) el.select();
  });
  const focusCanvas = () => vpEl.value?.focus();

  /* ---------- helpers ---------- */
  const tById = (id: string) => design.tables.find((t) => t.id === id);
  const snap = () => JSON.stringify({ tables: design.tables, rels: design.rels, notes: design.notes || [] });
  function restore(json: string) {
    const v = JSON.parse(json) as { tables: Table[]; rels: Rel[]; notes?: Note[] };
    design.tables = v.tables;
    design.rels = v.rels;
    design.notes = v.notes || [];
    touchDesign(design);
  }
  function commit(mut: () => void) {
    st.past = st.past.concat([snap()]).slice(-100);
    st.future = [];
    mut();
    touchDesign(design);
  }
  function cleanSel(sel: Sel | null): Sel | null {
    if (!sel) return null;
    if (sel.kind === "tables") { const ids = sel.ids.filter((id) => !!tById(id)); return ids.length ? { kind: "tables", ids } : null; }
    if (sel.kind === "column") { const t = tById(sel.t); return t && t.cols.some((c) => c.id === sel.c) ? sel : t ? { kind: "tables", ids: [t.id] } : null; }
    return design.rels.some((r) => r.id === sel.id) ? sel : null;
  }
  function undo() {
    const p = st.past;
    if (!p.length) return;
    st.future = [snap()].concat(st.future).slice(0, 100);
    st.past = p.slice(0, -1);
    restore(p[p.length - 1]);
    const en = st.entry;
    if (!en || !design.tables.some((t) => t.id === en.tid && t.draft)) { st.entry = null; st.picker = null; }
    st.sel = cleanSel(st.sel);
    st.cm = null;
  }
  function redo() {
    const f = st.future;
    if (!f.length) return;
    st.past = st.past.concat([snap()]);
    st.future = f.slice(1);
    restore(f[0]);
    st.sel = cleanSel(st.sel);
    st.cm = null;
  }
  function toWorld(e: MouseEvent) {
    const r = vpEl.value!.getBoundingClientRect();
    const vx = e.clientX - r.left, vy = e.clientY - r.top;
    return { x: (vx - st.panX) / st.zoom, y: (vy - st.panY) / st.zoom, vx, vy };
  }
  // Width of the canvas that an overlaid inspector does not cover.
  const usableW = () => Math.max(200, st.vp.w - (mode.value !== "wide" && showInsp.value ? 300 : 0));
  function fit(maxZ = 1.25) {
    autoView = true; lastMaxZ = maxZ;
    if (!design.tables.length) return;
    const b = bbox(design.tables), pad = 32, vw = usableW();
    const z = Math.max(0.25, Math.min(maxZ, (vw - pad * 2) / b.w, (st.vp.h - pad * 2) / b.h));
    st.zoom = z;
    st.panX = Math.round((vw - b.w * z) / 2 - b.x * z);
    st.panY = Math.round((st.vp.h - b.h * z) / 2 - b.y * z);
  }
  function zoomBy(f: number) {
    const nz = Math.max(0.25, Math.min(2, st.zoom * f));
    const cx = usableW() / 2, cy = st.vp.h / 2;
    st.panX = cx - (cx - st.panX) * (nz / st.zoom);
    st.panY = cy - (cy - st.panY) * (nz / st.zoom);
    st.zoom = nz;
    autoView = false;
  }
  function resetZoom() { zoomBy(1 / st.zoom); }
  // Runs when the canvas or the inspector changes size: refit a fitted view,
  // otherwise slide the selected tables out from under the inspector.
  function adjustView() {
    if (drag) { pendingAdjust = true; return; }
    if (autoView) { fit(lastMaxZ); return; }
    const s = st.sel;
    const ids = !s ? [] : s.kind === "tables" ? s.ids : s.kind === "column" ? [s.t] : [];
    const ts = ids.map(tById).filter((t): t is Table => !!t);
    if (!ts.length) return;
    const b = bbox(ts);
    const left = b.x * st.zoom + st.panX, over = (b.x + b.w) * st.zoom + st.panX - (usableW() - 8);
    if (over > 0) st.panX -= Math.min(over, Math.max(0, left - 8));
  }
  function closeTransient() {
    st.cm = null; st.dd = null; st.ghost = null; st.menu = null; st.search.open = false;
  }

  /* ---------- tables & columns ---------- */
  // Height reserved for a table that is still being created (header, id row, entry row, hint).
  const NEW_H = 150;
  // The free position closest to (x, y): searches outward in rings until a new table fits without touching another.
  function freeSpot(x: number, y: number) {
    const gap = 24, step = 40;
    const hit = (px: number, py: number) => design.tables.some((t) => px < t.x + W + gap && px + W + gap > t.x && py < t.y + tableHeight(t) + gap && py + NEW_H + gap > t.y);
    for (let r = 0; r <= 40; r++) {
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        if (!hit(x + dx * step, y + dy * step)) return { x: x + dx * step, y: y + dy * step };
      }
    }
    const b = bbox(design.tables);
    return { x: Math.round((b.x + b.w + 40) / 4) * 4, y: Math.round(y / 4) * 4 };
  }
  // Switches the design to another engine, translating column types and defaults.
  function changeEngine(engine: string) {
    convertDesign(design, engine);
    // Earlier snapshots hold the old engine's types, so undo history starts over.
    st.past = []; st.future = []; st.picker = null; st.menu = null;
    touchDesign(design);
  }
  function addTable(at?: { x: number; y: number }) {
    let n = 1;
    while (design.tables.some((t) => t.id === "table_" + n)) n++;
    const id = "table_" + n;
    let x = at ? at.x : (usableW() / 2 - st.panX) / st.zoom - W / 2;
    let y = at ? at.y : (st.vp.h / 2 - st.panY) / st.zoom - 70;
    x = Math.round(x / 4) * 4; y = Math.round(y / 4) * 4;
    if (!at) {
      const spot = freeSpot(x, y);
      x = spot.x; y = spot.y;
      // Bring the spot into view when the nearest free space is off screen.
      const sx = x * st.zoom + st.panX, sy = y * st.zoom + st.panY;
      if (sx < 8 || sx + W * st.zoom > usableW() - 8 || sy < 8 || sy + NEW_H * st.zoom > st.vp.h - 8) {
        st.panX = Math.round(usableW() / 2 - (x + W / 2) * st.zoom);
        st.panY = Math.round(st.vp.h / 2 - (y + NEW_H / 2) * st.zoom);
        autoView = false;
      }
    }
    commit(() => {
      design.tables.forEach((t) => { if (t.draft) { t.draft = false; if (!t.name.trim()) t.name = t.id; } });
      design.tables.push({ id, name: "", x, y, draft: true, cols: [idColumn(design.engine)] });
    });
    closeTransient();
    st.sel = { kind: "tables", ids: [id] };
    st.entry = { tid: id, name: "", type: "" };
    st.picker = null; st.located = null;
    focusEl(".tn-name-in");
  }
  function finishDraft() {
    const en = st.entry;
    if (!en) return;
    const t = tById(en.tid);
    if (t) { t.draft = false; t.name = t.name.trim() || t.id; touchDesign(design); }
    st.entry = null; st.picker = null;
  }
  function setTableName(t: Table, v: string) { t.name = v; touchDesign(design); }
  function uniqueColId(t: Table, name: string) {
    let id = name, k = 2;
    while (t.cols.some((c) => c.id === id)) { id = name + "_" + k; k++; }
    return id;
  }
  function commitEntry(type?: string) {
    const en = st.entry;
    if (!en) return;
    const name = en.name.trim().toLowerCase().replace(/[^a-z0-9_]+/g, "_");
    if (!name) { st.picker = null; focusEl(".entry .e-name"); return; }
    const ty = (type || en.type || "").trim() || "text";
    commit(() => {
      const tb = tById(en.tid);
      if (tb) tb.cols.push({ id: uniqueColId(tb, name), name, type: ty, pk: false, nullable: false, unique: false, def: "" });
    });
    st.entry = { tid: en.tid, name: "", type: "" };
    st.picker = null;
    focusEl(".entry .e-name");
  }
  function addColumn(tid: string) {
    const t = tById(tid);
    if (!t) return;
    let n = 1;
    while (t.cols.some((c) => c.name === "column_" + n)) n++;
    const name = "column_" + n, cid = uniqueColId(t, name);
    commit(() => { t.cols.push({ id: cid, name, type: "text", pk: false, nullable: true, unique: false, def: "" }); });
    closeTransient();
    st.sel = { kind: "column", t: tid, c: cid };
    store.showInspector = true; st.inspOverlay = true;
    focusEl("#ci-name", true);
  }
  // Typing in a text field is not an undo step.
  function edit<T extends object>(target: T, patch: Partial<T>) { Object.assign(target, patch); touchDesign(design); }
  function moveColumn(t: Table, c: Column, dir: -1 | 1) {
    const i = t.cols.indexOf(c), j = i + dir;
    if (i < 0 || j < 0 || j >= t.cols.length) return;
    commit(() => { t.cols.splice(i, 1); t.cols.splice(j, 0, c); });
  }
  function toggleFlag(c: Column, key: "pk" | "nullable" | "unique" | "autoInc") {
    commit(() => {
      c[key] = !c[key];
      if (key === "pk" && c.pk) c.nullable = false;
      if (key === "nullable" && c.nullable) c.pk = false;
    });
  }
  function addIndex(t: Table) {
    const s = st.sel;
    const col = (s && s.kind === "column" && s.t === t.id && t.cols.find((c) => c.id === s.c)) || t.cols.find((c) => !c.pk) || t.cols[0];
    if (!col) return;
    const id = crypto.randomUUID();
    commit(() => { t.indexes = (t.indexes || []).concat([{ id, name: t.name + "_" + col.name + "_idx", cols: [col.id], unique: false }]); });
    st.idxEdit = id;
  }
  function toggleIndexCol(x: IndexDef, cid: string) {
    commit(() => { x.cols = x.cols.includes(cid) ? x.cols.filter((c) => c !== cid) : x.cols.concat([cid]); });
  }
  function toggleIndexUnique(x: IndexDef) { commit(() => { x.unique = !x.unique; }); }
  function removeIndex(t: Table, x: IndexDef) {
    commit(() => { t.indexes = (t.indexes || []).filter((y) => y.id !== x.id); });
    st.idxEdit = null;
  }
  function addEnum() {
    let n = 1;
    while (design.enums.some((e) => e.name === "enum_" + n)) n++;
    commit(() => { design.enums.push({ name: "enum_" + n, values: [] }); });
  }
  function removeEnum(i: number) { commit(() => { design.enums.splice(i, 1); }); }
  function setRelAction(rel: Rel, key: "onDelete" | "onUpdate", value: FkAction) {
    commit(() => { rel[key] = value; });
    st.dd = null;
  }
  function deleteSel() {
    const s = st.sel;
    if (!s) return;
    if (s.kind === "tables") {
      commit(() => {
        design.tables = design.tables.filter((t) => !s.ids.includes(t.id));
        design.rels = design.rels.filter((r) => !s.ids.includes(r.from.t) && !s.ids.includes(r.to.t));
      });
      st.sel = null; st.cm = null; st.entry = null; st.picker = null;
    } else if (s.kind === "column") {
      commit(() => {
        const tb = tById(s.t);
        if (tb) {
          tb.cols = tb.cols.filter((c) => c.id !== s.c);
          (tb.indexes || []).forEach((x) => { x.cols = x.cols.filter((c) => c !== s.c); });
          tb.indexes = (tb.indexes || []).filter((x) => x.cols.length);
        }
        design.rels = design.rels.filter((r) => !((r.from.t === s.t && r.from.c === s.c) || (r.to.t === s.t && r.to.c === s.c)));
      });
      st.sel = { kind: "tables", ids: [s.t] }; st.cm = null; st.picker = null;
    } else {
      commit(() => { design.rels = design.rels.filter((r) => r.id !== s.id); });
      st.sel = null; st.cm = null; st.dd = null;
    }
  }
  // The selected tables and the relationships that run between them.
  function selectedTables() {
    const s = st.sel;
    const tables = s && s.kind === "tables" ? s.ids.map(tById).filter((t): t is Table => !!t) : [];
    const ids = tables.map((t) => t.id);
    return { tables, rels: design.rels.filter((r) => ids.includes(r.from.t) && ids.includes(r.to.t)) };
  }
  // Inserts copies under new names, offset by (dx, dy), converting types when they come from another engine.
  function insertCopies(tables: Table[], rels: Rel[], dx: number, dy: number, engine: string) {
    if (!tables.length) return;
    const from = family(engine), to = family(design.engine);
    const map: Record<string, string> = {};
    const copies = tables.map((t) => {
      let nm = t.name + "_copy", k = 2;
      while (design.tables.some((x) => x.id === nm || x.name === nm) || Object.values(map).includes(nm)) { nm = t.name + "_copy" + k; k++; }
      map[t.id] = nm;
      const cp = JSON.parse(JSON.stringify(t)) as Table;
      (cp.indexes || []).forEach((x) => { x.id = crypto.randomUUID(); x.name = x.name.replace(t.name, nm); });
      if (from !== to) cp.cols.forEach((c) => Object.assign(c, convertColumn(c, from, to)));
      return Object.assign(cp, { id: nm, name: nm, x: t.x + dx, y: t.y + dy, draft: false });
    });
    const newRels = rels.map((r) => ({ ...r, id: "r" + crypto.randomUUID(), from: { t: map[r.from.t], c: r.from.c }, to: { t: map[r.to.t], c: r.to.c } }));
    commit(() => { design.tables.push(...copies); design.rels.push(...newRels); });
    st.sel = { kind: "tables", ids: copies.map((t) => t.id) }; st.cm = null;
  }
  function duplicate() {
    const { tables, rels } = selectedTables();
    insertCopies(tables, rels, 28, 28, design.engine);
  }
  function copy() {
    const { tables, rels } = selectedTables();
    st.cm = null;
    if (!tables.length) return;
    clipboard = JSON.parse(JSON.stringify({ engine: design.engine, tables, rels }));
    st.notice = "Copied " + plural(tables.length, "table");
  }
  function cut() { copy(); if (selectedTables().tables.length) deleteSel(); }
  // Pastes at a canvas position when given one, otherwise just beside the originals.
  function paste(at?: { x: number; y: number }) {
    if (!clipboard) { st.cm = null; return; }
    const b = bbox(clipboard.tables);
    const dx = at ? Math.round((at.x - b.x - 24) / 4) * 4 : 28, dy = at ? Math.round((at.y - b.y - 8) / 4) * 4 : 28;
    insertCopies(clipboard.tables, clipboard.rels, dx, dy, clipboard.engine);
    // A second paste lands beside the first instead of on top of it.
    if (!at) clipboard.tables.forEach((t) => { t.x += 28; t.y += 28; });
  }
  function nudge(dx: number, dy: number) {
    const s = st.sel;
    if (!s || s.kind !== "tables") return;
    commit(() => { design.tables.forEach((t) => { if (s.ids.includes(t.id)) { t.x += dx; t.y += dy; } }); });
  }
  function selectRelated(tid: string) {
    const ids = [tid];
    design.rels.forEach((r) => {
      if (r.from.t === tid && !ids.includes(r.to.t)) ids.push(r.to.t);
      if (r.to.t === tid && !ids.includes(r.from.t)) ids.push(r.from.t);
    });
    st.sel = { kind: "tables", ids }; st.cm = null;
  }
  function addRel(from: ColRef, to: ColRef) {
    st.ghost = null;
    if (design.rels.some((r) => r.from.t === from.t && r.from.c === from.c && r.to.t === to.t && r.to.c === to.c)) return;
    const id = "r" + Date.now();
    commit(() => { design.rels.push({ id, from: { ...from }, to: { ...to } }); });
    st.sel = { kind: "rel", id };
  }
  function setRelEnd(rel: Rel, which: RelEnd, part: "t" | "c", value: string) {
    commit(() => {
      const end = rel[which];
      if (part === "t") {
        end.t = value;
        const t = tById(value);
        const pk = t && (t.cols.find((c) => c.pk) || t.cols[0]);
        const fkc = t && (t.cols.find((c) => /_id$/.test(c.name) && !c.pk) || t.cols[0]);
        end.c = which === "to" ? (pk ? pk.id : "") : fkc ? fkc.id : "";
      } else end.c = value;
    });
    st.dd = null;
  }
  function setRelOne(rel: Rel, one: boolean) {
    commit(() => { rel.one = one; });
    st.dd = null;
  }
  // Starts dragging one end of a relationship; dropping it on a column reconnects that end.
  function onEndDown(e: MouseEvent, rel: Rel, which: RelEnd) {
    if (e.button !== 0) return;
    const w = toWorld(e);
    startDrag({ type: "connect" });
    st.ghost = { from: which === "to" ? rel.from : rel.to, x: w.x, y: w.y, over: null, re: { id: rel.id, which } };
  }
  function reconnect(re: { id: string; which: RelEnd }, over: ColRef) {
    st.ghost = null;
    const rel = design.rels.find((r) => r.id === re.id);
    if (!rel) return;
    const other = re.which === "to" ? rel.from : rel.to;
    if (other.t === over.t && other.c === over.c) return;
    commit(() => { rel[re.which] = { ...over }; });
  }
  // Replaces a direct relationship with a junction table that references both sides.
  function toManyToMany(rel: Rel) {
    const S = tById(rel.from.t), T = tById(rel.to.t);
    const sp = S && (S.cols.find((c) => c.pk) || S.cols[0]), tp = T && (T.cols.find((c) => c.pk) || T.cols[0]);
    if (!S || !T || !sp || !tp) return;
    const plain = (ty: string) => (/^bigserial$/i.test(ty) ? "bigint" : /^(small)?serial$/i.test(ty) ? "integer" : ty);
    let id = S.name + "_" + T.name, k = 2;
    while (design.tables.some((t) => t.id === id || t.name === id)) { id = S.name + "_" + T.name + "_" + k; k++; }
    const a = S.name + "_id", b = S === T ? "related_" + T.name + "_id" : T.name + "_id";
    const col = (name: string, type: string): Column => ({ id: name, name, type: plain(type), pk: true, nullable: false, unique: false, def: "" });
    const spot = freeSpot(Math.round((S.x + T.x) / 8) * 4, Math.round((S.y + T.y) / 8) * 4 + 80);
    commit(() => {
      design.rels = design.rels.filter((r) => r.id !== rel.id);
      design.tables.push({ id, name: id, x: spot.x, y: spot.y, cols: [col(a, sp.type), col(b, tp.type)] });
      design.rels.push(
        { id: "r" + crypto.randomUUID(), from: { t: id, c: a }, to: { t: S.id, c: sp.id }, onDelete: "CASCADE" },
        { id: "r" + crypto.randomUUID(), from: { t: id, c: b }, to: { t: T.id, c: tp.id }, onDelete: "CASCADE" },
      );
    });
    st.sel = { kind: "tables", ids: [id] }; st.dd = null;
  }

  /* ---------- notes ---------- */
  // Pointer position over the canvas (viewport pixels), and the last place it was clicked.
  let cursor: { vx: number; vy: number } | null = null;
  let lastClick: { vx: number; vy: number } | null = null;
  function trackCursor(e: MouseEvent | null) {
    if (!e || !vpEl.value) { cursor = null; return; }
    const r = vpEl.value.getBoundingClientRect();
    cursor = { vx: e.clientX - r.left, vy: e.clientY - r.top };
  }
  // Where a keyboard-created item should go: under the pointer, else at the last click.
  function pointerSpot(): { x: number; y: number } | undefined {
    const p = cursor || lastClick;
    return p ? { x: (p.vx - st.panX) / st.zoom - 12, y: (p.vy - st.panY) / st.zoom - 8 } : undefined;
  }
  function addNote(at?: { x: number; y: number }) {
    const id = crypto.randomUUID();
    const x = Math.round((at ? at.x : (usableW() / 2 - st.panX) / st.zoom - 90) / 4) * 4;
    const y = Math.round((at ? at.y : (st.vp.h / 2 - st.panY) / st.zoom - 40) / 4) * 4;
    commit(() => { design.notes = (design.notes || []).concat([{ id, x, y, text: "" }]); });
    closeTransient();
    focusEl('.note[data-nid="' + id + '"] textarea');
  }
  function removeNote(n: Note) { commit(() => { design.notes = (design.notes || []).filter((x) => x.id !== n.id); }); }
  function onNoteDown(e: MouseEvent, n: Note) {
    if (e.button !== 0) return;
    const w = toWorld(e);
    closeTransient();
    startDrag({ type: "note", id: n.id, sx: w.x, sy: w.y, ox: n.x, oy: n.y, before: snap(), moved: false });
  }

  function autoLayout() {
    const pos = layoutPositions(design.tables, design.rels);
    commit(() => { design.tables.forEach((t) => { if (pos[t.id]) Object.assign(t, pos[t.id]); }); });
    st.cm = null;
    fit(1);
  }
  function centerOn(tid: string, sel: Sel) {
    const t = tById(tid);
    if (!t) return;
    const z = st.zoom < 0.75 ? 1 : st.zoom;
    closeTransient();
    st.sel = sel; st.located = tid; st.zoom = z;
    autoView = false;
    st.panX = Math.round(usableW() / 2 - (t.x + W / 2) * z);
    st.panY = Math.round(st.vp.h / 2 - (t.y + tableHeight(t) / 2) * z);
  }

  // Adds the tables, relationships and enums found in a SQL script as one undo step.
  function importSql(text: string) {
    const parsed = parseSql(text);
    const ids: Record<string, string> = {};
    const added: Table[] = parsed.tables.map((pt) => {
      let id = pt.name, k = 2;
      while (design.tables.some((t) => t.id === id || t.name === id) || Object.values(ids).includes(id)) { id = pt.name + "_" + k; k++; }
      ids[pt.name.toLowerCase()] = id;
      const colId = (n: string) => (pt.cols.find((c) => c.name.toLowerCase() === n.toLowerCase()) || { id: "" }).id;
      return {
        id, name: id, x: 0, y: 0, cols: pt.cols, comment: pt.comment,
        indexes: pt.indexes.map((x) => ({ id: crypto.randomUUID(), name: x.name, unique: x.unique, cols: x.cols.map(colId).filter(Boolean) })).filter((x) => x.cols.length),
      };
    });
    const find = (name: string) => added.find((t) => t.id === ids[name.toLowerCase()]) || design.tables.find((t) => t.name.toLowerCase() === name.toLowerCase());
    const col = (t: Table, name: string) => t.cols.find((c) => c.name.toLowerCase() === name.toLowerCase());
    const rels: Rel[] = [];
    parsed.rels.forEach((r) => {
      const S = find(r.ft), T = find(r.tt);
      const sc = S && col(S, r.fc), tc = T && col(T, r.tc);
      if (S && T && sc && tc) rels.push({ id: "r" + crypto.randomUUID(), from: { t: S.id, c: sc.id }, to: { t: T.id, c: tc.id }, onDelete: r.onDelete, onUpdate: r.onUpdate });
    });
    const enums = parsed.enums.filter((e) => !design.enums.some((x) => x.name === e.name));
    const summary = { tables: added.length, rels: rels.length, enums: enums.length, skipped: parsed.skipped };
    if (!added.length && !enums.length && !rels.length) return summary;
    const pos = layoutPositions(added, rels);
    const b = design.tables.length ? bbox(design.tables) : null;
    const dx = b ? b.x + b.w + 40 : 0, dy = b ? b.y - 32 : 0;
    added.forEach((t) => { if (pos[t.id]) { t.x = pos[t.id].x + dx; t.y = pos[t.id].y + dy; } });
    commit(() => { design.tables.push(...added); design.rels.push(...rels); design.enums.push(...enums); });
    closeTransient();
    if (added.length) st.sel = { kind: "tables", ids: added.map((t) => t.id) };
    fit();
    return summary;
  }

  /* ---------- type picker ---------- */
  const typeGroups = computed(() => {
    const groups = engineTypes(design.engine).slice();
    if (design.enums.length) groups.push({ g: "Enums in this design", items: design.enums.map((e): [string, string] => [e.name, "enum"]) });
    return groups;
  });
  function flatTypes(q: string) {
    q = q.trim().toLowerCase();
    const out: string[] = [];
    typeGroups.value.forEach((g) => g.items.forEach((it) => { if (!q || it[0].toLowerCase().includes(q)) out.push(it[0]); }));
    return out;
  }
  const pickerView = computed(() => {
    const p = st.picker;
    const q = p ? p.q.trim().toLowerCase() : "";
    const groups: { label: string; items: { name: string; desc: string; hi: boolean }[] }[] = [];
    let idx = 0;
    if (p) typeGroups.value.forEach((g) => {
      const items = g.items.filter((it) => !q || it[0].toLowerCase().includes(q));
      if (items.length) groups.push({ label: g.g, items: items.map((it) => ({ name: it[0], desc: it[1], hi: idx++ === p.hi })) });
    });
    return { groups, empty: idx === 0, q: p ? p.q : "", count: idx };
  });
  const selColumnRef = computed(() => {
    const s = st.sel;
    if (!s || s.kind !== "column") return null;
    const t = tById(s.t);
    const c = t && t.cols.find((x) => x.id === s.c);
    return t && c ? { t, c } : null;
  });
  function chooseType(name: string) {
    const p = st.picker;
    if (!p) return;
    if (p.where === "draft") {
      if (st.entry && !st.entry.name.trim()) { st.entry.type = name; st.picker = null; focusEl(".entry .e-name"); }
      else commitEntry(name);
      return;
    }
    const sc = selColumnRef.value;
    if (sc) commit(() => { sc.c.type = name; });
    st.picker = null;
  }
  function pickerKey(e: KeyboardEvent, where: PickerWhere) {
    const p = st.picker;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!p || p.where !== where) { st.picker = { where, q: where === "draft" && st.entry ? st.entry.type : "", hi: 0 }; return; }
      const n = flatTypes(p.q).length;
      if (n) p.hi = (p.hi + (e.key === "ArrowDown" ? 1 : -1) + n) % n;
    } else if (e.key === "Enter") {
      e.preventDefault();
      const list = flatTypes(p ? p.q : "");
      const raw = where === "draft" ? (st.entry ? st.entry.type : "") : p ? p.q : "";
      const name = p && list.length ? list[Math.min(p.hi, list.length - 1)] : raw.trim();
      if (where === "draft") commitEntry(name);
      else if (name && p) chooseType(name);
    } else if (e.key === "Escape") {
      e.preventDefault(); e.stopPropagation();
      if (p) st.picker = null;
      else if (where === "draft") finishDraft();
    }
  }
  function openDraftPicker() { st.picker = { where: "draft", q: st.entry ? st.entry.type : "", hi: 0 }; }
  function setEntryType(v: string) { if (st.entry) st.entry.type = v; st.picker = { where: "draft", q: v, hi: 0 }; }
  function openInspPicker(current: string) {
    if (!st.picker) st.picker = { where: "insp", q: "", hi: Math.max(0, flatTypes("").indexOf(current)) };
  }
  function draftPickUp(t: Table) {
    const est = Math.min(236, pickerView.value.count * 28 + pickerView.value.groups.length * 24) + 44;
    const entryBottom = (t.y + HEAD + t.cols.length * ROWH + 40) * st.zoom + st.panY;
    return entryBottom + est * st.zoom > st.vp.h - 8;
  }

  /* ---------- canvas pointer ---------- */
  function startDrag(d: Drag) {
    drag = d;
    window.addEventListener("mousemove", onDragMove);
    window.addEventListener("mouseup", onDragUp);
  }
  function stopDrag() {
    window.removeEventListener("mousemove", onDragMove);
    window.removeEventListener("mouseup", onDragUp);
  }
  function onHeadDown(e: MouseEvent, tid: string) {
    if (e.button !== 0 || (e.target as HTMLElement).tagName === "INPUT") return;
    const cur = st.sel && st.sel.kind === "tables" ? st.sel.ids : [];
    closeTransient();
    st.located = null;
    if (st.entry && st.entry.tid !== tid) finishDraft();
    if (e.ctrlKey || e.shiftKey || e.metaKey) {
      const ids = cur.includes(tid) ? cur.filter((x) => x !== tid) : cur.concat([tid]);
      st.sel = ids.length ? { kind: "tables", ids } : null;
      return;
    }
    const ids = cur.includes(tid) ? cur : [tid];
    const w = toWorld(e);
    startDrag({ type: "move", sx: w.x, sy: w.y, orig: ids.map((id) => { const t = tById(id)!; return { id, x: t.x, y: t.y }; }), before: snap(), moved: false });
    st.sel = { kind: "tables", ids };
  }
  function onRowDown(e: MouseEvent, t: Table, c: Column) {
    if (e.button !== 0) return;
    const w = toWorld(e);
    startDrag({ type: "move", sx: w.x, sy: w.y, orig: [{ id: t.id, x: t.x, y: t.y }], before: snap(), moved: false });
    closeTransient();
    st.sel = { kind: "column", t: t.id, c: c.id };
    st.located = null; st.picker = null;
  }
  function onHandleDown(e: MouseEvent, t: Table, c: Column) {
    if (e.button !== 0) return;
    const w = toWorld(e);
    closeTransient();
    startDrag({ type: "connect" });
    st.ghost = { from: { t: t.id, c: c.id }, x: w.x, y: w.y, over: null };
  }
  function onRowEnter(t: Table, c: Column) {
    const g = st.ghost;
    if (drag && drag.type === "connect" && g && !(g.from.t === t.id && g.from.c === c.id)) g.over = { t: t.id, c: c.id };
  }
  function onRowLeave(t: Table, c: Column) {
    const g = st.ghost;
    if (drag && g && g.over && g.over.t === t.id && g.over.c === c.id) g.over = null;
  }
  function vpDown(e: MouseEvent) {
    if (e.button !== 0 && e.button !== 1) return;
    const w = toWorld(e);
    lastClick = { vx: w.vx, vy: w.vy };
    if (st.entry) finishDraft();
    closeTransient();
    st.picker = null;
    if (e.shiftKey && e.button === 0) {
      startDrag({ type: "marquee", sx: w.vx, sy: w.vy });
      st.marquee = { x: w.vx, y: w.vy, w: 0, h: 0 };
    } else startDrag({ type: "pan", sx: e.clientX, sy: e.clientY, px: st.panX, py: st.panY, moved: false });
  }
  function onDragMove(e: MouseEvent) {
    const d = drag;
    if (!d) return;
    if (d.type === "pan") {
      const dx = e.clientX - d.sx, dy = e.clientY - d.sy;
      if (Math.abs(dx) + Math.abs(dy) > 2) d.moved = true;
      if (d.moved) { st.panX = d.px + dx; st.panY = d.py + dy; autoView = false; }
    } else if (d.type === "move") {
      const w = toWorld(e), dx = w.x - d.sx, dy = w.y - d.sy;
      if (!d.moved && Math.abs(dx) + Math.abs(dy) < 3 / st.zoom) return;
      d.moved = true;
      d.orig.forEach((o) => {
        const t = tById(o.id);
        if (t) { t.x = Math.round((o.x + dx) / 4) * 4; t.y = Math.round((o.y + dy) / 4) * 4; }
      });
    } else if (d.type === "mini") {
      miniPan(e);
    } else if (d.type === "note") {
      const w = toWorld(e), n = (design.notes || []).find((x) => x.id === d.id);
      if (!n) return;
      d.moved = true;
      n.x = Math.round((d.ox + w.x - d.sx) / 4) * 4; n.y = Math.round((d.oy + w.y - d.sy) / 4) * 4;
    } else if (d.type === "marquee") {
      const w = toWorld(e);
      st.marquee = { x: Math.min(d.sx, w.vx), y: Math.min(d.sy, w.vy), w: Math.abs(w.vx - d.sx), h: Math.abs(w.vy - d.sy) };
    } else if (d.type === "connect" && st.ghost) {
      const w = toWorld(e);
      st.ghost.x = w.x; st.ghost.y = w.y;
    }
  }
  function onDragUp() {
    const d = drag;
    drag = null;
    stopDrag();
    if (pendingAdjust) { pendingAdjust = false; nextTick(adjustView); }
    if (!d) return;
    if (d.type === "pan") { if (!d.moved) { st.sel = null; st.located = null; } }
    else if (d.type === "move") {
      if (d.moved) { st.past = st.past.concat([d.before]).slice(-100); st.future = []; touchDesign(design); }
    } else if (d.type === "marquee") {
      const m = st.marquee || { x: 0, y: 0, w: 0, h: 0 };
      const x0 = (m.x - st.panX) / st.zoom, y0 = (m.y - st.panY) / st.zoom, x1 = x0 + m.w / st.zoom, y1 = y0 + m.h / st.zoom;
      const ids = design.tables.filter((t) => t.x < x1 && t.x + W > x0 && t.y < y1 && t.y + tableHeight(t) > y0).map((t) => t.id);
      st.marquee = null;
      st.sel = ids.length ? { kind: "tables", ids } : null;
    } else if (d.type === "note") {
      if (d.moved) { st.past = st.past.concat([d.before]).slice(-100); st.future = []; touchDesign(design); }
    } else if (d.type === "connect") {
      const g = st.ghost;
      if (g && g.over) { if (g.re) reconnect(g.re, g.over); else addRel(g.from, g.over); }
      else st.ghost = null;
    }
  }
  function vpWheel(e: WheelEvent) {
    if ((e.ctrlKey || e.metaKey) && !store.pinchZoom) return;
    autoView = false;
    if (e.ctrlKey || e.metaKey) {
      const w = toWorld(e);
      // A trackpad pinch arrives as ctrl+wheel with small fractional steps; a mouse wheel in large ones.
      const k = e.deltaMode === 0 && Math.abs(e.deltaY) < 40 && !Number.isInteger(e.deltaY) ? 0.01 : 0.0015;
      const nz = Math.max(0.25, Math.min(2, st.zoom * Math.exp(-e.deltaY * k)));
      st.zoom = nz; st.panX = w.vx - w.x * nz; st.panY = w.vy - w.y * nz;
    } else { st.panX -= e.deltaX; st.panY -= e.deltaY; }
  }
  // Touch screens: one finger pans, two fingers pinch to zoom around their midpoint.
  const touches = new Map<number, { x: number; y: number }>();
  function onPointerDown(e: PointerEvent) { if (e.pointerType === "touch") touches.set(e.pointerId, { x: e.clientX, y: e.clientY }); }
  function onPointerUp(e: PointerEvent) { touches.delete(e.pointerId); }
  function onPointerMove(e: PointerEvent) {
    const old = touches.get(e.pointerId);
    if (e.pointerType !== "touch" || !old || !vpEl.value) return;
    const prev = Array.from(touches.values());
    touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const cur = Array.from(touches.values());
    autoView = false;
    if (cur.length === 1) { st.panX += e.clientX - old.x; st.panY += e.clientY - old.y; return; }
    if (cur.length !== 2 || !store.pinchZoom) return;
    const r = vpEl.value.getBoundingClientRect();
    const dist = (p: { x: number; y: number }[]) => Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y) || 1;
    const mid = (p: { x: number; y: number }[]) => ({ x: (p[0].x + p[1].x) / 2 - r.left, y: (p[0].y + p[1].y) / 2 - r.top });
    const pm = mid(prev), cm = mid(cur);
    const wx = (pm.x - st.panX) / st.zoom, wy = (pm.y - st.panY) / st.zoom;
    const nz = Math.max(0.25, Math.min(2, (st.zoom * dist(cur)) / dist(prev)));
    st.zoom = nz; st.panX = cm.x - wx * nz; st.panY = cm.y - wy * nz;
  }

  function vpMenu(e: MouseEvent) {
    const w = toWorld(e);
    closeTransient();
    st.cm = { kind: "canvas", wx: w.x, wy: w.y };
  }
  function tableMenu(e: MouseEvent, tid: string) {
    const w = toWorld(e);
    const cur = st.sel && st.sel.kind === "tables" ? st.sel.ids : [];
    closeTransient();
    st.sel = { kind: "tables", ids: cur.includes(tid) ? cur : [tid] };
    st.cm = { kind: "table", id: tid, wx: w.x, wy: w.y };
  }
  function relMenu(e: MouseEvent, rid: string) {
    const w = toWorld(e);
    closeTransient();
    st.sel = { kind: "rel", id: rid };
    st.cm = { kind: "rel", id: rid, wx: w.x, wy: w.y };
  }
  function selectRel(e: MouseEvent, rid: string) {
    if (e.button !== 0) return;
    closeTransient();
    st.sel = { kind: "rel", id: rid };
    st.located = null;
  }
  function focusRename() {
    store.showInspector = true; st.inspOverlay = true; st.cm = null;
    focusEl(st.sel && st.sel.kind === "column" ? "#ci-name" : "#ti-name", true);
  }
  function selectAll() { st.sel = { kind: "tables", ids: design.tables.map((t) => t.id) }; st.cm = null; }

  function onKey(e: KeyboardEvent) {
    const target = e.target as HTMLElement | null;
    const tag = ((target && target.tagName) || "").toLowerCase();
    const k = keyOf(e), mod = e.ctrlKey || e.metaKey;
    if (document.querySelector(".modal-back")) return;
    if (mod && (k === "k" || k === "f")) { e.preventDefault(); focusEl("#ed-search", true); return; }
    if (tag === "input" || tag === "textarea") return;
    const selT = st.sel && st.sel.kind === "tables" ? st.sel.ids : [];
    const sc = selColumnRef.value;
    if (e.altKey && sc && (k === "ArrowUp" || k === "ArrowDown")) { e.preventDefault(); moveColumn(sc.t, sc.c, k === "ArrowUp" ? -1 : 1); return; }
    if (mod && (k === "z" || k === "Z") && !e.shiftKey) { e.preventDefault(); undo(); }
    else if (mod && (k === "y" || k === "Y" || ((k === "z" || k === "Z") && e.shiftKey))) { e.preventDefault(); redo(); }
    else if (mod && e.shiftKey && (k === "l" || k === "L")) { e.preventDefault(); autoLayout(); }
    else if (mod && k === "a") { e.preventDefault(); selectAll(); }
    else if (mod && k === "d") { e.preventDefault(); duplicate(); }
    else if (mod && k === "c") { if (selT.length) { e.preventDefault(); copy(); } }
    else if (mod && k === "x") { if (selT.length) { e.preventDefault(); cut(); } }
    else if (mod && k === "v") { if (clipboard) { e.preventDefault(); paste(); } }
    else if (k === "?" || (e.shiftKey && !mod && e.code === "Slash")) { e.preventDefault(); st.help = true; }
    else if (mod && k === ".") { e.preventDefault(); if (showInsp.value) closeInsp(); else openInsp(); }
    else if (!mod && !e.altKey && (k === "n" || k === "N")) { e.preventDefault(); addNote(pointerSpot()); }
    else if (!mod && !e.altKey && (k === "m" || k === "M")) { e.preventDefault(); store.showMinimap = !store.showMinimap; }
    else if (mod && k === "0") { e.preventDefault(); resetZoom(); }
    else if (mod && (k === "=" || k === "+")) { e.preventDefault(); zoomBy(1.2); }
    else if (mod && k === "-") { e.preventDefault(); zoomBy(1 / 1.2); }
    else if (mod && k === "Enter") { e.preventDefault(); const tid = selT[0] || (st.sel && st.sel.kind === "column" ? st.sel.t : ""); if (tid) addColumn(tid); }
    else if (e.shiftKey && e.code === "Digit1") { e.preventDefault(); fit(); }
    else if (k === "Delete" || k === "Backspace") { e.preventDefault(); deleteSel(); }
    else if (k === "Escape") { if (st.cm || st.dd || st.menu) closeTransient(); else { st.sel = null; st.located = null; } }
    else if (!mod && !e.altKey && (k === "t" || k === "T")) { e.preventDefault(); addTable(); }
    else if (k === "F2") { e.preventDefault(); if (st.sel) focusRename(); }
    else if ((k === "Enter" || k === " ") && target && target.dataset.tid) { e.preventDefault(); st.sel = { kind: "tables", ids: [target.dataset.tid] }; }
    else if (selT.length && (k === "ArrowLeft" || k === "ArrowRight" || k === "ArrowUp" || k === "ArrowDown")) {
      e.preventDefault();
      const step = e.shiftKey ? 16 : 4;
      nudge(k === "ArrowLeft" ? -step : k === "ArrowRight" ? step : 0, k === "ArrowUp" ? -step : k === "ArrowDown" ? step : 0);
    } else if ((k === "ContextMenu" || (e.shiftKey && k === "F10")) && selT.length) {
      e.preventDefault();
      const t = tById(selT[0]);
      if (t) st.cm = { kind: "table", id: t.id, wx: t.x + 120, wy: t.y + 16 };
    }
  }

  /* ---------- search ---------- */
  const searchModel = computed(() => {
    const q = st.search.q.trim().toLowerCase();
    const tabs = design.tables.filter((t) => !q || (t.name || t.id).toLowerCase().includes(q)).slice(0, 6);
    const cols: { t: Table; c: Column }[] = [];
    if (q) design.tables.forEach((t) => t.cols.forEach((c) => { if (cols.length < 8 && c.name.toLowerCase().includes(q)) cols.push({ t, c }); }));
    const flat: { t: string; c?: string }[] = tabs.map((t) => ({ t: t.id }));
    cols.forEach((x) => flat.push({ t: x.t.id, c: x.c.id }));
    return { q, tabs, cols, flat };
  });
  function matchParts(str: string) {
    const q = searchModel.value.q;
    const i = str.toLowerCase().indexOf(q);
    if (!q || i < 0) return { pre: str, mid: "", post: "" };
    return { pre: str.slice(0, i), mid: str.slice(i, i + q.length), post: str.slice(i + q.length) };
  }
  function goResult(x?: { t: string; c?: string }) {
    if (!x) return;
    centerOn(x.t, x.c ? { kind: "column", t: x.t, c: x.c } : { kind: "tables", ids: [x.t] });
    focusCanvas();
  }
  function searchKey(e: KeyboardEvent) {
    const flat = searchModel.value.flat, n = flat.length;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!n) return;
      st.search.open = true;
      st.search.hi = (st.search.hi + (e.key === "ArrowDown" ? 1 : -1) + n) % n;
    } else if (e.key === "Enter") { e.preventDefault(); goResult(flat[Math.min(st.search.hi, n - 1)]); }
    else if (e.key === "Escape") { e.preventDefault(); st.search.open = false; focusCanvas(); }
  }
  function searchInput(v: string) { st.search.q = v; st.search.open = true; st.search.hi = 0; }
  function searchFocus() { st.search.open = true; st.cm = null; }

  /* ---------- derived view state ---------- */
  const fkMap = computed(() => {
    const m: Record<string, Rel> = {};
    design.rels.forEach((r) => { m[r.from.t + "." + r.from.c] = r; });
    return m;
  });
  const fkOf = (t: Table, c: Column): Rel | undefined => fkMap.value[t.id + "." + c.id];
  const selIds = computed(() => (st.sel && st.sel.kind === "tables" ? st.sel.ids : []));
  const selRel = computed(() => { const s = st.sel; return s && s.kind === "rel" ? design.rels.find((r) => r.id === s.id) || null : null; });
  const selTable = computed(() => (selIds.value.length === 1 ? tById(selIds.value[0]) || null : null));
  const multi = computed(() => (selIds.value.length > 1 ? selIds.value.map(tById).filter((t): t is Table => !!t) : []));

  function tableCls(t: Table) {
    const s = st.sel;
    return { sel: selIds.value.includes(t.id) || (!!s && s.kind === "column" && s.t === t.id), located: st.located === t.id };
  }
  function colCls(t: Table, c: Column) {
    const s = st.sel, r = selRel.value, g = st.ghost;
    return {
      sel: !!s && s.kind === "column" && s.t === t.id && s.c === c.id,
      ref: !!r && ((r.from.t === t.id && r.from.c === c.id) || (r.to.t === t.id && r.to.c === c.id)),
      target: !!g && !!g.over && g.over.t === t.id && g.over.c === c.id,
      src: !!g && g.from.t === t.id && g.from.c === c.id,
    };
  }
  function colTip(t: Table, c: Column) {
    return c.name + " · " + c.type + (c.pk ? " · primary key" : "") + (fkOf(t, c) ? " · foreign key" : "") + (c.nullable ? " · nullable" : " · not null") + (c.unique ? " · unique" : "") + (c.def ? " · default " + c.def : "");
  }

  const edges = computed(() => {
    const s = st.sel, r = selRel.value;
    const hot: Record<string, boolean> = {};
    design.rels.forEach((x) => {
      if (selIds.value.includes(x.from.t) || selIds.value.includes(x.to.t)) hot[x.id] = true;
      if (s && s.kind === "column" && ((x.from.t === s.t && x.from.c === s.c) || (x.to.t === s.t && x.to.c === s.c))) hot[x.id] = true;
      if (r && r.id === x.id) hot[x.id] = true;
    });
    const anyHot = Object.keys(hot).length > 0;
    return edgeGeometry(design.tables, design.rels).map((e) => ({
      ...e,
      cls: st.ghost && st.ghost.re && st.ghost.re.id === e.id ? "dim" : r && r.id === e.id ? "on sel" : hot[e.id] ? "on" : anyHot ? "dim" : "",
    }));
  });

  // The selected relationship's line ends, where its two drag handles sit.
  const selEnds = computed(() => {
    const r = selRel.value;
    const e = r && edges.value.find((x) => x.id === r.id);
    return r && e && !st.ghost ? { rel: r, a: e.a, b: e.b } : null;
  });

  const ghostView = computed(() => {
    const g = st.ghost;
    const S = g && tById(g.from.t);
    if (!g || !S) return null;
    const si = S.cols.findIndex((c) => c.id === g.from.c);
    const x1 = S.x + W, y1 = S.y + HEAD + si * ROWH + 12;
    let ex = g.x, ey = g.y, label = "", match = "", ok = false;
    const T = g.over && tById(g.over.t);
    if (g.over && T) {
      const ti = T.cols.findIndex((c) => c.id === g.over!.c);
      ey = T.y + HEAD + ti * ROWH + 12;
      ex = T.x > x1 ? T.x : T.x + W;
      const sc = S.cols[si], tc = T.cols[ti];
      label = g.re && g.re.which === "from" ? T.name + "." + tc.name + " → " + S.name + "." + sc.name : S.name + "." + sc.name + " → " + T.name + "." + tc.name;
      ok = sc.type === tc.type || (/serial/.test(tc.type) && /int/.test(sc.type));
      match = ok ? "Types match" : "Type mismatch: " + sc.type + " / " + tc.type;
    }
    const dx = Math.max(44, Math.abs(ex - x1) / 2);
    return {
      d: "M" + x1 + " " + y1 + " C" + (x1 + dx) + " " + y1 + " " + (ex < x1 + 1 ? ex + dx : ex - dx) + " " + ey + " " + ex + " " + ey,
      ex, ey, tip: !!T, tx: Math.max(x1, ex) + dx * 0.75 + 10, ty: Math.round((y1 + ey) / 2) - 14, label, match, ok,
    };
  });

  const menu = computed(() => {
    const cm = st.cm;
    if (!cm) return null;
    const it = (label: string, kbd: string, act: () => void, danger = false): MenuItem => ({ sep: false, label, kbd, danger, act });
    const sep: MenuItem = { sep: true, label: "", kbd: "", danger: false, act: () => {} };
    let items: MenuItem[];
    if (cm.kind === "table" && cm.id) {
      const tid = cm.id, n = selIds.value.length;
      items = [
        it("Add column", "Ctrl+Enter", () => addColumn(tid)),
        it("Rename", "F2", () => { st.sel = { kind: "tables", ids: [tid] }; focusRename(); }),
        it(n > 1 ? "Duplicate " + n + " tables" : "Duplicate", "Ctrl+D", duplicate),
        it("Copy", "Ctrl+C", copy),
        it("Cut", "Ctrl+X", cut),
        sep,
        it("Select related tables", "", () => selectRelated(tid)),
        it("Center in view", "", () => centerOn(tid, { kind: "tables", ids: [tid] })),
        sep,
        it(n > 1 ? "Delete " + n + " tables" : "Delete table", "Del", deleteSel, true),
      ];
    } else if (cm.kind === "rel") {
      items = [it("Delete relationship", "Del", deleteSel, true)];
    } else {
      const at = { x: cm.wx, y: cm.wy };
      items = [
        it("Add table here", "T", () => addTable(at)),
        it("Add note here", "N", () => addNote(at)),
        ...(clipboard ? [it("Paste", "Ctrl+V", () => paste(at))] : []),
        it("Select all", "Ctrl+A", selectAll),
        sep,
        it("Auto layout", "Ctrl+Shift+L", autoLayout),
        it("Fit view", "Shift+1", () => { st.cm = null; fit(); }),
      ];
    }
    const mh = items.reduce((a, m) => a + (m.sep ? 9 : 28), 10);
    return {
      items,
      label: cm.kind === "table" ? "Table actions" : cm.kind === "rel" ? "Relationship actions" : "Canvas actions",
      x: Math.round(Math.max(4, Math.min(cm.wx * st.zoom + st.panX, st.vp.w - 240))),
      y: Math.round(Math.max(4, Math.min(cm.wy * st.zoom + st.panY, st.vp.h - mh - 4))),
    };
  });

  // Beside the canvas in a wide window; over it, and only when asked for, in a narrow one.
  const showInsp = computed(() => !!st.sel && store.showInspector && (mode.value === "wide" || st.inspOverlay));
  // The rail offers the inspector in a narrow window; when the inspector is switched off there is nothing to offer.
  const showRail = computed(() => !!st.sel && store.showInspector && !showInsp.value);
  function openInsp() { store.showInspector = true; st.inspOverlay = true; }
  function closeInsp() {
    if (mode.value === "wide") store.showInspector = false; else st.inspOverlay = false;
    st.picker = null; st.dd = null;
  }

  // Indexes the database creates for keys and foreign keys, followed by the ones defined by hand.
  function indexes(t: Table) {
    const names = (ids: string[]) => ids.map((id) => (t.cols.find((c) => c.id === id) || { name: "?" }).name).join(", ");
    const out: { key: string; name: string; cols: string; kind: string; def?: IndexDef }[] = [];
    const pkc = t.cols.filter((c) => c.pk).map((c) => c.name);
    if (pkc.length) out.push({ key: "pk", name: t.name + "_pkey", cols: pkc.join(", "), kind: "primary" });
    t.cols.filter((c) => c.unique && !c.pk).forEach((c) => out.push({ key: "u" + c.id, name: t.name + "_" + c.name + "_key", cols: c.name, kind: "unique" }));
    design.rels.filter((r) => r.from.t === t.id).forEach((r) => {
      const c = t.cols.find((x) => x.id === r.from.c);
      if (c) out.push({ key: "f" + r.id, name: t.name + "_" + c.name + (r.one ? "_key" : "_idx"), cols: c.name, kind: r.one ? "unique" : "" });
    });
    (t.indexes || []).forEach((x) => out.push({ key: x.id, name: x.name, cols: names(x.cols), kind: x.unique ? "unique" : "", def: x }));
    return out;
  }

  const relView = computed(() => {
    const r = selRel.value;
    const S = r && tById(r.from.t), T = r && tById(r.to.t);
    if (!r || !S || !T) return null;
    const sc = S.cols.find((c) => c.id === r.from.c), tc = T.cols.find((c) => c.id === r.to.c);
    return {
      rel: r, S, T,
      srcCol: sc ? sc.name : "?", tgtCol: tc ? tc.name : "?",
      srcText: S.name + "." + (sc ? sc.name : "?"), tgtText: T.name + "." + (tc ? tc.name : "?"),
      card: (r.one ? "One " : "Many ") + S.name + " → one " + T.name + (sc && sc.nullable ? " · optional (nullable)" : " · required") + (S === T ? " · self-referencing" : ""),
    };
  });

  // Things that would make the exported SQL wrong or ambiguous.
  const problems = computed(() => {
    const out: { text: string; sel: Sel }[] = [];
    const seen = new Map<string, number>();
    design.tables.forEach((t) => seen.set(t.name.toLowerCase(), (seen.get(t.name.toLowerCase()) || 0) + 1));
    design.tables.forEach((t) => {
      const sel: Sel = { kind: "tables", ids: [t.id] };
      if (t.draft) return;
      if (!t.name.trim()) out.push({ text: "A table has no name", sel });
      else if ((seen.get(t.name.toLowerCase()) || 0) > 1) out.push({ text: "More than one table is named " + t.name, sel });
      if (!t.cols.length) out.push({ text: t.name + " has no columns", sel });
      else if (!t.cols.some((c) => c.pk)) out.push({ text: t.name + " has no primary key", sel });
      const names = new Set<string>();
      t.cols.forEach((c) => {
        const cs: Sel = { kind: "column", t: t.id, c: c.id };
        if (!c.name.trim()) out.push({ text: t.name + " has a column without a name", sel: cs });
        else if (names.has(c.name.toLowerCase())) out.push({ text: t.name + " has two columns named " + c.name, sel: cs });
        names.add(c.name.toLowerCase());
        if (!c.type.trim()) out.push({ text: t.name + "." + c.name + " has no data type", sel: cs });
      });
    });
    design.rels.forEach((r) => {
      const S = tById(r.from.t), T = tById(r.to.t);
      const sc = S && S.cols.find((c) => c.id === r.from.c), tc = T && T.cols.find((c) => c.id === r.to.c);
      if (!S || !T || !sc || !tc) return;
      const base = (ty: string) => ty.toLowerCase().replace(/^bigserial$/, "bigint").replace(/^(small)?serial$/, "integer").replace(/\s+/g, "");
      if (base(sc.type) !== base(tc.type)) out.push({ text: S.name + "." + sc.name + " (" + sc.type + ") references " + T.name + "." + tc.name + " (" + tc.type + ")", sel: { kind: "rel", id: r.id } });
    });
    return out;
  });
  function goProblem(p: { sel: Sel }) {
    const tid = p.sel.kind === "tables" ? p.sel.ids[0] : p.sel.kind === "column" ? p.sel.t : "";
    if (tid) centerOn(tid, p.sel);
    else { closeTransient(); st.sel = p.sel; }
  }

  const selText = computed(() => {
    const s = st.sel;
    if (!s) return "";
    if (s.kind === "tables") return selTable.value ? selTable.value.name + " · " + plural(selTable.value.cols.length, "column") : s.ids.length + " tables selected";
    if (s.kind === "column") { const x = selColumnRef.value; return x ? x.t.name + "." + x.c.name + " · " + x.c.type : ""; }
    return relView.value ? relView.value.srcText + " → " + relView.value.tgtText : "";
  });
  const stats = computed(() => plural(design.tables.length, "table") + " · " + plural(design.rels.length, "relationship"));
  const gridSize = computed(() => (st.zoom < 0.5 ? 40 : 20) * st.zoom);

  /* ---------- minimap ---------- */
  const MINI_W = 180, MINI_H = 120;
  // World rectangle the minimap shows: every table, padded and widened to the minimap's proportions.
  const miniBox = computed(() => {
    const b = design.tables.length ? bbox(design.tables) : { x: 0, y: 0, w: 600, h: 400 };
    let x = b.x - 60, y = b.y - 60, w = b.w + 120, h = b.h + 120;
    if (w / h > MINI_W / MINI_H) { const nh = (w * MINI_H) / MINI_W; y -= (nh - h) / 2; h = nh; }
    else { const nw = (h * MINI_W) / MINI_H; x -= (nw - w) / 2; w = nw; }
    return { x, y, w, h };
  });
  const miniView = computed(() => ({ x: -st.panX / st.zoom, y: -st.panY / st.zoom, w: usableW() / st.zoom, h: st.vp.h / st.zoom }));
  function miniPan(e: MouseEvent) {
    const el = document.querySelector(".minimap");
    if (!el) return;
    const r = el.getBoundingClientRect(), b = miniBox.value;
    const wx = b.x + ((e.clientX - r.left) / r.width) * b.w, wy = b.y + ((e.clientY - r.top) / r.height) * b.h;
    st.panX = Math.round(usableW() / 2 - wx * st.zoom);
    st.panY = Math.round(st.vp.h / 2 - wy * st.zoom);
    autoView = false;
  }
  function miniDown(e: MouseEvent) {
    if (e.button !== 0) return;
    closeTransient();
    startDrag({ type: "mini" });
    miniPan(e);
  }

  /* ---------- lifecycle ---------- */
  function measure() {
    const el = vpEl.value;
    if (!el) return;
    const v = el.getBoundingClientRect();
    if (!v.width) return;
    const changed = Math.abs(v.width - st.vp.w) > 1 || Math.abs(v.height - st.vp.h) > 1;
    st.vp = { w: v.width, h: v.height };
    if (!fitted) { fitted = true; fit(1); }
    else if (changed) adjustView();
  }
  // Overlays that live outside the canvas close on any press that isn't inside them.
  function onDocDown(e: MouseEvent) {
    const el = e.target as HTMLElement;
    if (st.dd && !el.closest(".ddw")) st.dd = null;
    if (st.menu && !el.closest(".tb-menu")) st.menu = null;
    if (st.cm && !el.closest(".cmenu") && !el.closest(".viewport")) st.cm = null;
  }
  watch(showInsp, () => nextTick(adjustView));
  // Arrow-key navigation keeps the highlighted type in view.
  watch(() => st.picker && st.picker.hi, () => nextTick(() => document.querySelector(".typepick .pi.hi, .inpick .pi.hi")?.scrollIntoView({ block: "nearest" })));
  onMounted(() => {
    ro = new ResizeObserver(measure);
    if (vpEl.value) ro.observe(vpEl.value);
    measure();
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onDocDown, true);
  });
  onBeforeUnmount(() => {
    ro?.disconnect();
    stopDrag();
    window.removeEventListener("keydown", onKey);
    window.removeEventListener("mousedown", onDocDown, true);
    if (st.entry) finishDraft();
  });

  return {
    st, design, vpEl,
    undo, redo, fit, zoomBy, addTable, finishDraft, setTableName, addColumn, edit, moveColumn, toggleFlag, addIndex, toggleIndexCol, toggleIndexUnique, removeIndex,
    addEnum, removeEnum, setRelAction, importSql, resetZoom, changeEngine,
    miniBox, miniView, miniDown, selEnds, onEndDown, setRelOne, toManyToMany,
    addNote, removeNote, onNoteDown, trackCursor, onPointerDown, onPointerMove, onPointerUp, problems, goProblem, isSelected: (t: Table) => tableCls(t).sel,
    deleteSel, setRelEnd, autoLayout, commitEntry,
    pickerView, chooseType, pickerKey, openDraftPicker, setEntryType, openInspPicker, draftPickUp,
    onHeadDown, onRowDown, onHandleDown, onRowEnter, onRowLeave, vpDown, vpWheel, vpMenu, tableMenu, relMenu, selectRel,
    searchModel, matchParts, goResult, searchKey, searchInput, searchFocus,
    fkOf, selTable, selColumnRef, multi, relView, tableCls, colCls, colTip, edges, ghostView, menu,
    showInsp, showRail, openInsp, closeInsp, indexes, selText, stats, gridSize,
  };
}

export type Editor = ReturnType<typeof useEditor>;
