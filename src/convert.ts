import { family, type Family } from "./engines";
import type { Column, Design } from "./types";

// Engine-neutral kinds that column types are translated through.
type Kind =
  | "uuid" | "tinyint" | "smallint" | "int" | "bigint" | "decimal" | "real" | "double"
  | "text" | "varchar" | "char" | "citext" | "date" | "time" | "timestamp" | "timestamptz"
  | "boolean" | "json" | "jsonb" | "bytes" | "inet" | "money" | "xml" | "year";

const COMMON: Record<string, Kind> = {
  uuid: "uuid", uniqueidentifier: "uuid",
  tinyint: "tinyint", smallint: "smallint", int2: "smallint", int: "int", integer: "int", int4: "int", bigint: "bigint", int8: "bigint",
  decimal: "decimal", numeric: "decimal", double: "double", "double precision": "double",
  text: "text", mediumtext: "text", longtext: "text", varchar: "varchar", nvarchar: "varchar", "character varying": "varchar",
  char: "char", nchar: "char", character: "char", citext: "citext",
  date: "date", time: "time", datetime: "timestamp", datetime2: "timestamp", timestamptz: "timestamptz", "timestamp with time zone": "timestamptz", datetimeoffset: "timestamptz",
  boolean: "boolean", bool: "boolean", bit: "boolean", json: "json", jsonb: "jsonb",
  bytea: "bytes", blob: "bytes", varbinary: "bytes", inet: "inet", inet6: "inet", money: "money", xml: "xml", year: "year",
};
// Names that mean different things depending on the engine.
const OWN: Record<Family, Record<string, Kind>> = {
  postgres: { timestamp: "timestamp", real: "real", float: "double" },
  mysql: { timestamp: "timestamptz", real: "double", float: "real" },
  mariadb: { timestamp: "timestamptz", real: "double", float: "real" },
  sqlite: { timestamp: "timestamp", real: "double", float: "double", numeric: "decimal" },
  mssql: { timestamp: "bytes", real: "real", float: "double" },
};

type Emit = string | ((args: string) => string);
const withArgs = (name: string) => (args: string) => name + args;
const EMIT: Record<Family, Record<Kind, Emit>> = {
  postgres: {
    uuid: "uuid", tinyint: "smallint", smallint: "smallint", int: "integer", bigint: "bigint", decimal: withArgs("numeric"), real: "real", double: "double precision",
    text: "text", varchar: withArgs("varchar"), char: withArgs("char"), citext: "citext", date: "date", time: "time", timestamp: "timestamp", timestamptz: "timestamptz",
    boolean: "boolean", json: "json", jsonb: "jsonb", bytes: "bytea", inet: "inet", money: "numeric(19,4)", xml: "xml", year: "smallint",
  },
  mysql: {
    uuid: "char(36)", tinyint: "tinyint", smallint: "smallint", int: "int", bigint: "bigint", decimal: withArgs("decimal"), real: "float", double: "double",
    text: "text", varchar: (a) => "varchar" + (a || "(255)"), char: withArgs("char"), citext: "varchar(255)", date: "date", time: "time", timestamp: "datetime", timestamptz: "timestamp",
    boolean: "boolean", json: "json", jsonb: "json", bytes: "blob", inet: "varchar(45)", money: "decimal(19,4)", xml: "text", year: "year",
  },
  mariadb: {
    uuid: "uuid", tinyint: "tinyint", smallint: "smallint", int: "int", bigint: "bigint", decimal: withArgs("decimal"), real: "float", double: "double",
    text: "text", varchar: (a) => "varchar" + (a || "(255)"), char: withArgs("char"), citext: "varchar(255)", date: "date", time: "time", timestamp: "datetime", timestamptz: "timestamp",
    boolean: "boolean", json: "json", jsonb: "json", bytes: "blob", inet: "inet6", money: "decimal(19,4)", xml: "text", year: "year",
  },
  sqlite: {
    uuid: "text", tinyint: "integer", smallint: "integer", int: "integer", bigint: "integer", decimal: "numeric", real: "real", double: "real",
    text: "text", varchar: withArgs("varchar"), char: withArgs("char"), citext: "text", date: "date", time: "text", timestamp: "datetime", timestamptz: "datetime",
    boolean: "boolean", json: "json", jsonb: "json", bytes: "blob", inet: "text", money: "numeric", xml: "text", year: "integer",
  },
  mssql: {
    uuid: "uniqueidentifier", tinyint: "tinyint", smallint: "smallint", int: "int", bigint: "bigint", decimal: withArgs("decimal"), real: "real", double: "float",
    text: "nvarchar(max)", varchar: (a) => "nvarchar" + (a || "(255)"), char: withArgs("nchar"), citext: "nvarchar(255)", date: "date", time: "time", timestamp: "datetime2", timestamptz: "datetimeoffset",
    boolean: "bit", json: "nvarchar(max)", jsonb: "nvarchar(max)", bytes: "varbinary(max)", inet: "varchar(45)", money: "money", xml: "xml", year: "smallint",
  },
};

const UUID_FN: Record<Family, string> = { postgres: "gen_random_uuid()", mysql: "(uuid())", mariadb: "uuid()", sqlite: "", mssql: "newid()" };
const NOW_FN: Record<Family, string> = { postgres: "now()", mysql: "current_timestamp", mariadb: "current_timestamp", sqlite: "current_timestamp", mssql: "sysdatetimeoffset()" };

function kindOf(type: string, from: Family): { kind: Kind | null; args: string } {
  const m = /^\s*([a-z_][a-z0-9_ ]*?)\s*(\(.*\))?\s*$/i.exec(type);
  if (!m) return { kind: null, args: "" };
  const base = m[1].toLowerCase(), args = (m[2] || "").replace(/\s+/g, "");
  if ((from === "mysql" || from === "mariadb") && base === "char" && args === "(36)") return { kind: "uuid", args: "" };
  if (from === "mssql" && (base === "nvarchar" || base === "varchar") && args === "(max)") return { kind: "text", args: "" };
  return { kind: OWN[from][base] || COMMON[base] || null, args };
}

// The column's type, default and auto-increment flag as the target engine would write them.
// Types with no known equivalent (enums, custom types) are left as they are.
export function convertColumn(c: Column, from: Family, to: Family): Pick<Column, "type" | "def" | "autoInc"> {
  let type = c.type, def = c.def, autoInc = c.autoInc;
  let bool = false;
  const serial = /^\s*(big|small)?serial\s*$/i.exec(type);
  if (serial && from === "postgres") {
    type = EMIT[to][serial[1] && serial[1].toLowerCase() === "big" ? "bigint" : "int"] as string;
    autoInc = true;
  } else {
    const { kind, args } = kindOf(type, from);
    bool = kind === "boolean";
    if (kind) {
      const e = EMIT[to][kind];
      type = typeof e === "string" ? e : e(args);
    }
  }
  const d = def.trim().toLowerCase().replace(/\s+/g, "");
  if (["gen_random_uuid()", "uuid()", "(uuid())", "newid()", "uuid_generate_v4()"].includes(d)) def = UUID_FN[to];
  else if (["now()", "current_timestamp", "current_timestamp()", "getdate()", "sysdatetime()", "sysdatetimeoffset()"].includes(d)) def = NOW_FN[to];
  // SQL Server writes boolean defaults as 1 and 0; everything else uses true and false.
  else if (bool && to === "mssql" && (d === "true" || d === "false")) def = d === "true" ? "1" : "0";
  else if (bool && from === "mssql" && to !== "mssql" && (d === "1" || d === "0")) def = d === "1" ? "true" : "false";
  return { type, def, autoInc };
}

export function convertDesign(design: Design, engine: string) {
  const from = family(design.engine), to = family(engine);
  if (from !== to) design.tables.forEach((t) => t.cols.forEach((c) => Object.assign(c, convertColumn(c, from, to))));
  design.engine = engine;
}
