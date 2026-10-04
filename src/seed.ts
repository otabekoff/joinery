import { DEFAULT_ENGINE } from "./engines";
import type { Column, EnumType, Project, Rel, Table } from "./types";

type ColOpts = { pk?: boolean; n?: boolean; u?: boolean; d?: string };

function c(name: string, type: string, o: ColOpts = {}): Column {
  return { id: name, name, type, pk: !!o.pk, nullable: !!o.n, unique: !!o.u, def: o.d || "" };
}

function uid(): Column {
  return c("id", "uuid", { pk: true, d: "gen_random_uuid()" });
}

function r(id: string, ft: string, fc: string, tt: string, tc: string): Rel {
  return { id, from: { t: ft, c: fc }, to: { t: tt, c: tc } };
}

function commerceCore(): { tables: Table[]; rels: Rel[]; enums: EnumType[] } {
  const tables: Table[] = [
    { id: "customers", name: "customers", x: 40, y: 40, cols: [uid(), c("email", "varchar(255)", { u: true }), c("full_name", "varchar(120)"), c("phone", "varchar(32)", { n: true }), c("created_at", "timestamptz", { d: "now()" })] },
    { id: "addresses", name: "addresses", x: 40, y: 279, cols: [uid(), c("customer_id", "uuid"), c("line1", "varchar(200)"), c("city", "varchar(100)"), c("postal_code", "varchar(20)", { n: true }), c("country", "char(2)")] },
    { id: "orders", name: "orders", x: 320, y: 40, cols: [uid(), c("customer_id", "uuid"), c("shipping_address_id", "uuid", { n: true }), c("status", "order_status", { d: "'pending'" }), c("total_cents", "bigint", { d: "0" }), c("placed_at", "timestamptz", { n: true })], indexes: [{ id: "ix1", name: "orders_status_placed_at_idx", cols: ["status", "placed_at"], unique: false }] },
    { id: "payments", name: "payments", x: 320, y: 279, cols: [uid(), c("order_id", "uuid"), c("provider", "varchar(32)"), c("amount_cents", "bigint"), c("status", "payment_status"), c("captured_at", "timestamptz", { n: true })] },
    { id: "order_items", name: "order_items", x: 600, y: 40, cols: [c("id", "bigserial", { pk: true }), c("order_id", "uuid"), c("variant_id", "uuid"), c("quantity", "integer", { d: "1" }), c("unit_price_cents", "bigint")] },
    { id: "product_variants", name: "product_variants", x: 600, y: 279, cols: [uid(), c("product_id", "uuid"), c("sku", "varchar(64)", { u: true }), c("price_cents", "bigint"), c("stock", "integer", { d: "0" })] },
    { id: "categories", name: "categories", x: 320, y: 518, cols: [c("id", "serial", { pk: true }), c("parent_id", "integer", { n: true }), c("name", "varchar(100)"), c("slug", "varchar(100)", { u: true })] },
    { id: "products", name: "products", x: 600, y: 518, cols: [uid(), c("category_id", "integer", { n: true }), c("name", "varchar(200)"), c("slug", "varchar(200)", { u: true }), c("description", "text", { n: true }), c("created_at", "timestamptz", { d: "now()" })] },
  ];
  const rels: Rel[] = [
    r("r1", "addresses", "customer_id", "customers", "id"),
    r("r2", "orders", "customer_id", "customers", "id"),
    r("r3", "orders", "shipping_address_id", "addresses", "id"),
    r("r4", "order_items", "order_id", "orders", "id"),
    r("r5", "order_items", "variant_id", "product_variants", "id"),
    r("r6", "product_variants", "product_id", "products", "id"),
    r("r7", "products", "category_id", "categories", "id"),
    r("r8", "payments", "order_id", "orders", "id"),
    r("r9", "categories", "parent_id", "categories", "id"),
  ];
  const enums: EnumType[] = [
    { name: "order_status", values: ["pending", "paid", "shipped", "delivered", "cancelled"] },
    { name: "payment_status", values: ["authorized", "captured", "refunded", "failed"] },
  ];
  return { tables, rels, enums };
}

// First-run sample so the editor has something to show.
export function sampleProject(): Omit<Project, "path"> {
  const now = Date.now();
  return {
    id: crypto.randomUUID(),
    name: "Storefront Platform",
    modified: now,
    designs: [{ id: crypto.randomUUID(), name: "commerce_core", engine: DEFAULT_ENGINE, modified: now, ...commerceCore() }],
  };
}
