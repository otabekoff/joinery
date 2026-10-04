import type { Column } from "./types";

export type Family = "postgres" | "mysql" | "mariadb" | "sqlite" | "mssql";
export type TypeGroup = { g: string; items: [string, string][] };

export const ENGINES = [
  "PostgreSQL 18", "PostgreSQL 17", "PostgreSQL 16",
  "MySQL 8.4", "MySQL 8.0",
  "MariaDB 11.8",
  "SQLite 3",
  "SQL Server 2025", "SQL Server 2022",
];
export const DEFAULT_ENGINE = ENGINES[0];

export function family(engine: string): Family {
  if (engine.startsWith("MySQL")) return "mysql";
  if (engine.startsWith("MariaDB")) return "mariadb";
  if (engine.startsWith("SQLite")) return "sqlite";
  if (engine.startsWith("SQL Server")) return "mssql";
  return "postgres";
}

const POSTGRES: TypeGroup[] = [
  { g: "Identifiers", items: [["uuid", "128-bit UUID"]] },
  { g: "Numeric", items: [["smallint", "2-byte integer"], ["integer", "4-byte integer"], ["bigint", "8-byte integer"], ["numeric(12,2)", "exact decimal"], ["real", "4-byte float"], ["double precision", "8-byte float"], ["serial", "auto-increment"], ["bigserial", "auto-increment, 8-byte"]] },
  { g: "Text", items: [["text", "unlimited length"], ["varchar(255)", "limited length"], ["char(2)", "fixed length"], ["citext", "case-insensitive"]] },
  { g: "Date & time", items: [["date", "calendar date"], ["time", "time of day"], ["timestamp", "without time zone"], ["timestamptz", "with time zone"], ["interval", "time span"]] },
  { g: "Other", items: [["boolean", "true / false"], ["jsonb", "binary JSON"], ["json", "text JSON"], ["bytea", "binary data"], ["inet", "IP address"]] },
];
const MYSQL: TypeGroup[] = [
  { g: "Numeric", items: [["tinyint", "1-byte integer"], ["smallint", "2-byte integer"], ["int", "4-byte integer"], ["bigint", "8-byte integer"], ["decimal(12,2)", "exact decimal"], ["float", "4-byte float"], ["double", "8-byte float"]] },
  { g: "Text", items: [["varchar(255)", "limited length"], ["char(2)", "fixed length"], ["text", "up to 64 KB"], ["mediumtext", "up to 16 MB"], ["longtext", "up to 4 GB"]] },
  { g: "Date & time", items: [["date", "calendar date"], ["time", "time of day"], ["datetime", "date and time"], ["timestamp", "UTC timestamp"], ["year", "4-digit year"]] },
  { g: "Other", items: [["boolean", "tinyint(1)"], ["json", "JSON document"], ["blob", "binary data"], ["binary(16)", "fixed binary"], ["char(36)", "UUID as text"]] },
];
const MARIADB: TypeGroup[] = MYSQL.map((g) => (g.g === "Other" ? { g: g.g, items: [...g.items, ["uuid", "128-bit UUID"], ["inet6", "IP address"]] } : g));
const SQLITE: TypeGroup[] = [
  { g: "Storage classes", items: [["integer", "signed integer"], ["real", "8-byte float"], ["text", "text string"], ["blob", "binary data"], ["numeric", "numeric affinity"]] },
  { g: "Common aliases", items: [["boolean", "stored as integer"], ["varchar(255)", "stored as text"], ["date", "stored as text"], ["datetime", "stored as text"], ["json", "stored as text"]] },
];
const MSSQL: TypeGroup[] = [
  { g: "Identifiers", items: [["uniqueidentifier", "128-bit GUID"]] },
  { g: "Numeric", items: [["tinyint", "1-byte integer"], ["smallint", "2-byte integer"], ["int", "4-byte integer"], ["bigint", "8-byte integer"], ["decimal(12,2)", "exact decimal"], ["float", "8-byte float"], ["money", "currency"]] },
  { g: "Text", items: [["nvarchar(255)", "Unicode, limited"], ["nvarchar(max)", "Unicode, unlimited"], ["varchar(255)", "limited length"], ["nchar(2)", "fixed length"]] },
  { g: "Date & time", items: [["date", "calendar date"], ["time", "time of day"], ["datetime2", "date and time"], ["datetimeoffset", "with time zone"]] },
  { g: "Other", items: [["bit", "true / false"], ["varbinary(max)", "binary data"], ["xml", "XML document"]] },
];

const TYPES: Record<Family, TypeGroup[]> = { postgres: POSTGRES, mysql: MYSQL, mariadb: MARIADB, sqlite: SQLITE, mssql: MSSQL };

export function typeGroups(engine: string): TypeGroup[] {
  return TYPES[family(engine)];
}

// The primary key column a new table starts with.
export function idColumn(engine: string): Column {
  const base = { id: "id", name: "id", pk: true, nullable: false, unique: false };
  switch (family(engine)) {
    case "postgres": return { ...base, type: "uuid", def: "gen_random_uuid()" };
    case "sqlite": return { ...base, type: "integer", def: "", autoInc: true };
    default: return { ...base, type: "bigint", def: "", autoInc: true };
  }
}
