import { convertDesign } from "../src/convert";
import { sampleProject } from "../src/seed";
import { generateSql } from "../src/sql/export";
import type { Design } from "../src/types";

// The sample schema plus one of everything optional: comments, foreign key actions,
// a multi-column unique index, a one-to-one relationship, reserved and mixed-case
// names, an auto-increment key and a boolean default.
export function fixture(): Design {
  const d = sampleProject().designs[0];
  d.tables[0].comment = "People who buy things";
  d.tables[0].cols[1].comment = "Login email, it's unique";
  d.rels[0].onDelete = "CASCADE";
  d.rels[2].onDelete = "SET NULL";
  d.rels[7].one = true;
  d.tables[1].indexes = [{ id: "x", name: "addresses_city_country_key", cols: ["city", "country"], unique: true }];
  d.tables.push({
    id: "order", name: "order", x: 0, y: 0,
    cols: [
      { id: "id", name: "id", type: "integer", pk: true, nullable: false, unique: false, def: "", autoInc: true },
      { id: "user", name: "user", type: "varchar(40)", pk: false, nullable: true, unique: false, def: "" },
      { id: "Mixed Case", name: "Mixed Case", type: "boolean", pk: false, nullable: false, unique: false, def: "true" },
    ],
  });
  return d;
}

export const ENGINES_UNDER_TEST = ["PostgreSQL 18", "MySQL 8.4", "MariaDB 11.8", "SQLite 3", "SQL Server 2025"];

export function sqlFor(engine: string): { design: Design; sql: string } {
  const design = JSON.parse(JSON.stringify(fixture())) as Design;
  convertDesign(design, engine);
  return { design, sql: generateSql(design) };
}
