import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import { PGlite } from "@electric-sql/pglite";
import { convertColumn, convertDesign } from "../src/convert";
import { generateSql } from "../src/sql/export";
import { highlightSql } from "../src/sql/highlight";
import { parseSql } from "../src/sql/import";
import type { Column, Design } from "../src/types";
import { ENGINES_UNDER_TEST, fixture, sqlFor } from "./fixture";

const col = (type: string, def = "", extra: Partial<Column> = {}): Column => ({ id: "c", name: "c", type, pk: false, nullable: false, unique: false, def, ...extra });

describe("export runs on real engines", () => {
  test("SQLite accepts the script and enforces its foreign keys", () => {
    const db = new Database(":memory:");
    db.exec("PRAGMA foreign_keys = ON;");
    db.exec(sqlFor("SQLite 3").sql);
    const count = (q: string) => (db.query(q).get() as { n: number }).n;
    expect(count("SELECT count(*) AS n FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")).toBe(9);
    db.exec("INSERT INTO customers (id, email, full_name) VALUES ('c1', 'a@b.c', 'A');");
    db.exec("INSERT INTO addresses (id, customer_id, line1, city, country) VALUES ('a1', 'c1', 'x', 'y', 'UZ');");
    expect(() => db.exec("INSERT INTO addresses (id, customer_id, line1, city, country) VALUES ('a2', 'missing', 'x', 'z', 'UZ');")).toThrow();
    db.exec("DELETE FROM customers WHERE id = 'c1';");
    expect(count("SELECT count(*) AS n FROM addresses")).toBe(0);
  });

  test("PostgreSQL accepts the script", async () => {
    const pg = new PGlite();
    await pg.exec(sqlFor("PostgreSQL 18").sql);
    const n = async (q: string) => (await pg.query<{ n: number }>(q)).rows[0].n;
    expect(await n("SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema='public'")).toBe(9);
    expect(await n("SELECT count(*)::int AS n FROM information_schema.table_constraints WHERE constraint_type='FOREIGN KEY'")).toBe(9);
    await pg.exec("INSERT INTO customers (email, full_name) VALUES ('a@b.c', 'A'); INSERT INTO orders (customer_id) SELECT id FROM customers;");
    expect((await pg.query<{ status: string }>("SELECT status::text FROM orders")).rows[0].status).toBe("pending");
    // The one-to-one relationship makes its foreign key column unique.
    await pg.exec("INSERT INTO payments (order_id, provider, amount_cents, status) SELECT id, 'x', 1, 'captured' FROM orders;");
    await expect(pg.exec("INSERT INTO payments (order_id, provider, amount_cents, status) SELECT id, 'x', 1, 'captured' FROM orders;")).rejects.toThrow();
  });

  test("a design converted through other engines still loads in PostgreSQL", async () => {
    const d = JSON.parse(JSON.stringify(fixture())) as Design;
    for (const e of ["SQL Server 2025", "MySQL 8.4", "SQLite 3", "MariaDB 11.8", "PostgreSQL 18"]) convertDesign(d, e);
    await new PGlite().exec(generateSql(d));
  });
});

describe("import", () => {
  for (const engine of ENGINES_UNDER_TEST) {
    test("re-imports its own " + engine + " export", () => {
      const { design, sql } = sqlFor(engine);
      const p = parseSql(sql);
      expect(p.skipped).toBe(0);
      expect(p.tables.map((t) => t.name).sort()).toEqual(design.tables.map((t) => t.name).sort());
      expect(p.rels.length).toBe(design.rels.length);
      for (const t of design.tables) expect(p.tables.find((x) => x.name === t.name)!.cols.map((c) => c.name)).toEqual(t.cols.map((c) => c.name));
    });
  }

  test("reads common hand-written DDL", () => {
    const p = parseSql(`
      -- comment
      CREATE TABLE IF NOT EXISTS public."Users" (
        id BIGSERIAL PRIMARY KEY,
        email character varying(255) NOT NULL UNIQUE,
        role ENUM('admin','member') NOT NULL DEFAULT 'member',
        team_id int REFERENCES teams ON DELETE SET NULL,
        created timestamp with time zone DEFAULT now()
      );
      CREATE TABLE teams (id int NOT NULL AUTO_INCREMENT, name varchar(80), PRIMARY KEY (id), KEY teams_name_idx (name));
      ALTER TABLE ONLY teams ADD CONSTRAINT teams_owner_fk FOREIGN KEY (id) REFERENCES "Users" (id) ON DELETE CASCADE;
      INSERT INTO teams VALUES (1, 'x');`);
    const users = p.tables.find((t) => t.name === "Users")!;
    expect(users.cols.map((c) => c.type)).toEqual(["bigserial", "character varying(255)", "Users_role", "int", "timestamp with time zone"]);
    expect(users.cols[0].pk && users.cols[1].unique && !users.cols[1].nullable).toBe(true);
    expect(users.cols[4].def).toBe("now()");
    expect(p.enums).toEqual([{ name: "Users_role", values: ["admin", "member"] }]);
    expect(p.tables[1].cols[0].autoInc && p.tables[1].cols[0].pk).toBe(true);
    expect(p.tables[1].indexes).toEqual([{ name: "teams_name_idx", cols: ["name"], unique: false }]);
    expect(p.rels).toEqual([
      { ft: "Users", fc: "team_id", tt: "teams", tc: "id", onDelete: "SET NULL" },
      { ft: "teams", fc: "id", tt: "Users", tc: "id", onDelete: "CASCADE" },
    ]);
    expect(p.skipped).toBe(1);
  });
});

describe("type conversion", () => {
  test("maps types and defaults to each engine", () => {
    expect(convertColumn(col("uuid", "gen_random_uuid()"), "postgres", "mssql")).toMatchObject({ type: "uniqueidentifier", def: "newid()" });
    expect(convertColumn(col("uuid", "gen_random_uuid()"), "postgres", "mysql")).toMatchObject({ type: "char(36)", def: "(uuid())" });
    expect(convertColumn(col("timestamptz", "now()"), "postgres", "sqlite")).toMatchObject({ type: "datetime", def: "current_timestamp" });
    expect(convertColumn(col("bigserial"), "postgres", "mysql")).toMatchObject({ type: "bigint", autoInc: true });
    expect(convertColumn(col("varchar(120)"), "postgres", "mssql").type).toBe("nvarchar(120)");
    expect(convertColumn(col("nvarchar(max)"), "mssql", "postgres").type).toBe("text");
    expect(convertColumn(col("char(36)"), "mysql", "postgres").type).toBe("uuid");
  });
  test("boolean defaults survive SQL Server", () => {
    const there = convertColumn(col("boolean", "true"), "postgres", "mssql");
    expect(there).toMatchObject({ type: "bit", def: "1" });
    expect(convertColumn(col(there.type, there.def), "mssql", "postgres")).toMatchObject({ type: "boolean", def: "true" });
  });
  test("leaves unknown types alone", () => {
    expect(convertColumn(col("order_status", "'pending'"), "postgres", "mysql")).toMatchObject({ type: "order_status", def: "'pending'" });
  });
});

describe("highlighting", () => {
  test("marks keywords, strings and comments, and escapes markup", () => {
    const html = highlightSql("-- a <b>\nCREATE TABLE t (name text DEFAULT '<x>');");
    expect(html).toContain('<span class="sc">-- a &lt;b&gt;</span>');
    expect(html).toContain('<span class="sk">CREATE</span>');
    expect(html).toContain('<span class="ss">\'&lt;x&gt;\'</span>');
    expect(html).not.toContain("<b>");
  });
});
