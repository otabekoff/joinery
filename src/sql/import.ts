import { FK_ACTIONS, type Column, type EnumType, type FkAction } from "../types";

type Tok = { k: "id" | "str" | "num" | "sym"; v: string; quoted?: boolean };

export interface ParsedTable {
  name: string;
  cols: Column[];
  indexes: { name: string; cols: string[]; unique: boolean }[];
  comment?: string;
}
export interface ParsedRel {
  ft: string; fc: string; tt: string; tc: string;
  onDelete?: FkAction; onUpdate?: FkAction;
}
export interface ParsedSql {
  tables: ParsedTable[];
  rels: ParsedRel[];
  enums: EnumType[];
  // Statements that were not understood and were left out.
  skipped: number;
}

function lex(sql: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  const n = sql.length;
  const until = (close: string) => {
    let v = "";
    i++;
    while (i < n) {
      if (sql[i] === close) { if (sql[i + 1] === close) { v += close; i += 2; continue; } i++; break; }
      v += sql[i++];
    }
    return v;
  };
  while (i < n) {
    const c = sql[i];
    if (/\s/.test(c)) { i++; continue; }
    if ((c === "-" && sql[i + 1] === "-") || c === "#") { while (i < n && sql[i] !== "\n") i++; continue; }
    if (c === "/" && sql[i + 1] === "*") { const e = sql.indexOf("*/", i + 2); i = e < 0 ? n : e + 2; continue; }
    if (c === "'") { out.push({ k: "str", v: until("'") }); continue; }
    if (c === '"' || c === "`") { out.push({ k: "id", v: until(c), quoted: true }); continue; }
    if (c === "[") {
      if (sql[i + 1] === "]") { out.push({ k: "sym", v: "[]" }); i += 2; continue; }
      out.push({ k: "id", v: until("]"), quoted: true });
      continue;
    }
    const word = /^[A-Za-z_][\w$]*/.exec(sql.slice(i));
    if (word) { out.push({ k: "id", v: word[0] }); i += word[0].length; continue; }
    const num = /^\d+(\.\d+)?/.exec(sql.slice(i));
    if (num) { out.push({ k: "num", v: num[0] }); i += num[0].length; continue; }
    if (c === ":" && sql[i + 1] === ":") { out.push({ k: "sym", v: "::" }); i += 2; continue; }
    out.push({ k: "sym", v: c });
    i++;
  }
  return out;
}

const kw = (t: Tok | undefined) => (t && t.k === "id" && !t.quoted ? t.v.toUpperCase() : "");
const sym = (t: Tok | undefined, v: string) => !!t && t.k === "sym" && t.v === v;

// Splits on top-level occurrences of a symbol, ignoring anything inside parentheses.
function split(toks: Tok[], on: string): Tok[][] {
  const parts: Tok[][] = [[]];
  let depth = 0;
  toks.forEach((t) => {
    if (sym(t, "(")) depth++;
    if (sym(t, ")")) depth--;
    if (depth === 0 && sym(t, on)) parts.push([]);
    else parts[parts.length - 1].push(t);
  });
  return parts.filter((p) => p.length);
}

// Index of the ")" matching the "(" at `open`.
function closing(toks: Tok[], open: number): number {
  let depth = 0;
  for (let i = open; i < toks.length; i++) {
    if (sym(toks[i], "(")) depth++;
    if (sym(toks[i], ")") && --depth === 0) return i;
  }
  return toks.length;
}

function render(toks: Tok[], lower: boolean): string {
  let s = "";
  toks.forEach((t, i) => {
    const v = t.k === "str" ? "'" + t.v.replace(/'/g, "''") + "'" : t.k === "id" && lower && !t.quoted ? t.v.toLowerCase() : t.v;
    const prev = toks[i - 1];
    const tight = !prev || sym(prev, "(") || sym(prev, "::") || sym(prev, ".") || (t.k === "sym" && ["(", ")", ",", "[]", "::", "."].includes(t.v));
    s += (tight ? "" : " ") + v;
    if (sym(t, ",")) s += " ";
  });
  return s.replace(/, +/g, ", ").trim();
}

// Reads `schema.name` and returns the last part plus the index after it.
function qname(toks: Tok[], i: number): [string, number] {
  let name = toks[i] ? toks[i].v : "";
  i++;
  while (sym(toks[i], ".") && toks[i + 1]) { name = toks[i + 1].v; i += 2; }
  return [name, i];
}

// Column names from a parenthesised list starting at `open`; returns them with the index after ")".
function colList(toks: Tok[], open: number): [string[], number] {
  if (!sym(toks[open], "(")) return [[], open];
  const end = closing(toks, open);
  const names = split(toks.slice(open + 1, end), ",").map((p) => p[0].v);
  return [names, end + 1];
}

function fkActions(toks: Tok[], i: number): { onDelete?: FkAction; onUpdate?: FkAction } {
  const out: { onDelete?: FkAction; onUpdate?: FkAction } = {};
  while (i < toks.length) {
    if (kw(toks[i]) === "ON" && (kw(toks[i + 1]) === "DELETE" || kw(toks[i + 1]) === "UPDATE")) {
      const two = kw(toks[i + 2]) + " " + kw(toks[i + 3]);
      const act = (FK_ACTIONS as readonly string[]).includes(two) ? two : kw(toks[i + 2]);
      if ((FK_ACTIONS as readonly string[]).includes(act)) out[kw(toks[i + 1]) === "DELETE" ? "onDelete" : "onUpdate"] = act as FkAction;
    }
    i++;
  }
  return out;
}

const STOP = new Set(["NOT", "NULL", "DEFAULT", "PRIMARY", "UNIQUE", "REFERENCES", "CHECK", "CONSTRAINT", "AUTO_INCREMENT", "AUTOINCREMENT", "GENERATED", "COLLATE", "COMMENT", "IDENTITY", "ON", "KEY"]);
const isStop = (toks: Tok[], i: number) => STOP.has(kw(toks[i])) || (kw(toks[i]) === "CHARACTER" && kw(toks[i + 1]) === "SET");

// Understands CREATE TABLE, CREATE INDEX, CREATE TYPE ... AS ENUM, ALTER TABLE ... ADD
// constraints and COMMENT ON, in the PostgreSQL, MySQL, SQLite and SQL Server dialects.
export function parseSql(sql: string): ParsedSql {
  const res: ParsedSql = { tables: [], rels: [], enums: [], skipped: 0 };
  const table = (name: string) => res.tables.find((t) => t.name.toLowerCase() === name.toLowerCase());
  const column = (t: ParsedTable | undefined, name: string) => t && t.cols.find((c) => c.name.toLowerCase() === name.toLowerCase());

  function constraint(t: ParsedTable, toks: Tok[]): boolean {
    let i = 0;
    if (kw(toks[i]) === "CONSTRAINT") i += 2;
    const k = kw(toks[i]);
    if (k === "PRIMARY" && kw(toks[i + 1]) === "KEY") {
      const [cols] = colList(toks, toks.findIndex((x, j) => j > i && sym(x, "(")));
      cols.forEach((n) => { const c = column(t, n); if (c) { c.pk = true; c.nullable = false; } });
      return true;
    }
    if (k === "UNIQUE" || k === "KEY" || k === "INDEX") {
      const open = toks.findIndex((x, j) => j > i && sym(x, "("));
      if (open < 0) return false;
      const [cols] = colList(toks, open);
      const named = toks[open - 1];
      const hasName = named && named.k === "id" && !["UNIQUE", "KEY", "INDEX"].includes(kw(named));
      const single = column(t, cols[0]);
      if (k === "UNIQUE" && cols.length === 1 && single) single.unique = true;
      else t.indexes.push({ name: hasName ? named.v : t.name + "_" + cols.join("_") + (k === "UNIQUE" ? "_key" : "_idx"), cols, unique: k === "UNIQUE" });
      return true;
    }
    if (k === "FOREIGN" && kw(toks[i + 1]) === "KEY") {
      const open = toks.findIndex((x, j) => j > i && sym(x, "("));
      const [from, after] = colList(toks, open);
      const ref = toks.findIndex((x, j) => j >= after && kw(x) === "REFERENCES");
      if (ref < 0) return false;
      const [tt, next] = qname(toks, ref + 1);
      const [to, rest] = colList(toks, next);
      const acts = fkActions(toks, rest);
      from.forEach((fc, n) => res.rels.push({ ft: t.name, fc, tt, tc: to[n] || "", ...acts }));
      return true;
    }
    return ["CHECK", "EXCLUDE", "FULLTEXT", "SPATIAL", "LIKE", "PERIOD"].includes(k);
  }

  function columnDef(t: ParsedTable, toks: Tok[]) {
    const name = toks[0].v;
    let i = 1;
    const typeToks: Tok[] = [];
    while (i < toks.length && !isStop(toks, i)) {
      if (sym(toks[i], "(")) { const e = closing(toks, i); typeToks.push(...toks.slice(i, e + 1)); i = e + 1; }
      else typeToks.push(toks[i++]);
    }
    const col: Column = { id: name, name, type: render(typeToks, true) || "text", pk: false, nullable: true, unique: false, def: "" };
    // An inline MySQL ENUM('a','b') becomes a named enum type of the design.
    if (kw(typeToks[0]) === "ENUM" && sym(typeToks[1], "(")) {
      col.type = t.name + "_" + name;
      res.enums.push({ name: col.type, values: typeToks.filter((x) => x.k === "str").map((x) => x.v) });
    }
    if (/^(big|small)?serial$/.test(col.type)) col.nullable = false;
    while (i < toks.length) {
      const k = kw(toks[i]);
      if (k === "NOT" && kw(toks[i + 1]) === "NULL") { col.nullable = false; i += 2; }
      else if (k === "PRIMARY") { col.pk = true; col.nullable = false; i += 2; }
      else if (k === "UNIQUE") { col.unique = true; i++; if (kw(toks[i]) === "KEY") i++; }
      else if (k === "AUTO_INCREMENT" || k === "AUTOINCREMENT") { col.autoInc = true; i++; }
      else if (k === "IDENTITY") { col.autoInc = true; i++; if (sym(toks[i], "(")) i = closing(toks, i) + 1; }
      else if (k === "GENERATED") { if (toks.slice(i).some((x) => kw(x) === "IDENTITY")) col.autoInc = true; break; }
      else if (k === "DEFAULT") {
        const d: Tok[] = [];
        i++;
        while (i < toks.length && !isStop(toks, i)) {
          if (sym(toks[i], "(")) { const e = closing(toks, i); d.push(...toks.slice(i, e + 1)); i = e + 1; }
          else d.push(toks[i++]);
        }
        col.def = render(d, false);
      } else if (k === "COMMENT" && toks[i + 1] && toks[i + 1].k === "str") { col.comment = toks[i + 1].v; i += 2; }
      else if (k === "REFERENCES") {
        const [tt, next] = qname(toks, i + 1);
        const [to, rest] = colList(toks, next);
        res.rels.push({ ft: t.name, fc: name, tt, tc: to[0] || "", ...fkActions(toks, rest) });
        i = rest;
      } else if (sym(toks[i], "(")) i = closing(toks, i) + 1;
      else i++;
    }
    t.cols.push(col);
  }

  split(lex(sql), ";").forEach((st) => {
    let i = 0;
    const a = kw(st[0]);
    if (a === "CREATE") {
      i = 1;
      let unique = false;
      while (["TEMP", "TEMPORARY", "UNLOGGED", "GLOBAL", "LOCAL", "OR", "REPLACE", "UNIQUE", "CLUSTERED", "NONCLUSTERED"].includes(kw(st[i]))) { if (kw(st[i]) === "UNIQUE") unique = true; i++; }
      const what = kw(st[i]);
      i++;
      while (["IF", "NOT", "EXISTS", "CONCURRENTLY"].includes(kw(st[i]))) i++;
      if (what === "TABLE") {
        const [name, next] = qname(st, i);
        if (!sym(st[next], "(")) { res.skipped++; return; }
        const end = closing(st, next);
        const t: ParsedTable = { name, cols: [], indexes: [] };
        res.tables.push(t);
        const items = split(st.slice(next + 1, end), ",");
        const later: Tok[][] = [];
        items.forEach((it) => {
          const k = kw(it[0]);
          // UNIQUE / KEY / INDEX start a constraint only when a column list follows;
          // otherwise they are a column that happens to have that name.
          const keyed = ["UNIQUE", "KEY", "INDEX"].includes(k) && (sym(it[1], "(") || sym(it[2], "(") || ["KEY", "INDEX"].includes(kw(it[1])));
          if (keyed || ["CONSTRAINT", "PRIMARY", "FOREIGN", "CHECK", "EXCLUDE", "FULLTEXT", "SPATIAL", "LIKE", "PERIOD"].includes(k)) later.push(it);
          else columnDef(t, it);
        });
        later.forEach((it) => constraint(t, it));
        const c = st.findIndex((x, j) => j > end && kw(x) === "COMMENT");
        const cs = c > 0 ? st.slice(c + 1).find((x) => x.k === "str") : undefined;
        if (cs) t.comment = cs.v;
      } else if (what === "INDEX") {
        const on = st.findIndex((x) => kw(x) === "ON");
        const hasName = on > i;
        if (on < 0) { res.skipped++; return; }
        let j = on + 1;
        if (kw(st[j]) === "ONLY") j++;
        const [tn, next] = qname(st, j);
        const open = st.findIndex((x, n) => n >= next && sym(x, "("));
        const [cols] = colList(st, open);
        const t = table(tn);
        if (t && cols.length) t.indexes.push({ name: hasName ? st[i].v : tn + "_" + cols.join("_") + "_idx", cols, unique });
        else res.skipped++;
      } else if (what === "TYPE") {
        const [name, next] = qname(st, i);
        if (kw(st[next]) === "AS" && kw(st[next + 1]) === "ENUM") res.enums.push({ name, values: st.slice(next + 2).filter((x) => x.k === "str").map((x) => x.v) });
        else res.skipped++;
      } else res.skipped++;
    } else if (a === "ALTER" && kw(st[1]) === "TABLE") {
      i = 2;
      while (["ONLY", "IF", "EXISTS"].includes(kw(st[i]))) i++;
      const [name, next] = qname(st, i);
      const t = table(name);
      if (!t || kw(st[next]) !== "ADD" || !constraint(t, st.slice(next + 1))) res.skipped++;
    } else if (a === "COMMENT" && kw(st[1]) === "ON") {
      const is = st.findIndex((x) => kw(x) === "IS");
      const text = is > 0 && st[is + 1] && st[is + 1].k === "str" ? st[is + 1].v : "";
      const names = st.slice(3, is).filter((x) => x.k === "id").map((x) => x.v);
      if (kw(st[2]) === "TABLE" && table(names[names.length - 1])) table(names[names.length - 1])!.comment = text;
      else if (kw(st[2]) === "COLUMN" && column(table(names[names.length - 2]), names[names.length - 1])) column(table(names[names.length - 2]), names[names.length - 1])!.comment = text;
      else res.skipped++;
    } else if (st.length) res.skipped++;
  });

  // A reference without a column list points at the target's primary key.
  res.rels.forEach((r) => {
    if (r.tc) return;
    const t = table(r.tt);
    const pk = t && (t.cols.find((c) => c.pk) || t.cols[0]);
    r.tc = pk ? pk.name : "";
  });
  return res;
}
