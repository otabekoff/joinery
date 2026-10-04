// Writes the test schema as a SQL script for each engine, so CI can run them
// against real database servers:  bun scripts/export-sample.ts <output folder>
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { sqlFor } from "../tests/fixture";

const out = process.argv[2] || "sql-out";
mkdirSync(out, { recursive: true });
const FILES: Record<string, string> = {
  "postgres.sql": "PostgreSQL 18",
  "mysql.sql": "MySQL 8.4",
  "mariadb.sql": "MariaDB 11.8",
  "sqlite.sql": "SQLite 3",
  "mssql.sql": "SQL Server 2025",
};
for (const [file, engine] of Object.entries(FILES)) {
  writeFileSync(join(out, file), sqlFor(engine).sql);
  console.log("wrote " + join(out, file));
}
