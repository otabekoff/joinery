# File format

## Where things are

| What | Where |
|---|---|
| A project | `<project folder>\project.joinery.json` |
| App settings | `%APPDATA%\uz.nurafshon.joinery\settings.json` |

The default projects folder is scanned on startup: every sub-folder containing a `project.joinery.json` is listed. Projects stored elsewhere are remembered by path in the settings file.

Files are written to a temporary file first and then renamed into place, so a crash cannot leave a half-written project.

## `project.joinery.json`

```jsonc
{
  "id": "…",                    // stable id; survives renames and moves
  "name": "Storefront Platform",
  "modified": 1759570000000,    // milliseconds since 1970
  "sort": { "key": "custom", "desc": false },  // optional: how the designs list is ordered
  "engine": "PostgreSQL 18",    // optional: engine preselected for new designs
  "designs": [
    {
      "id": "…",
      "name": "commerce_core",
      "engine": "PostgreSQL 18",
      "modified": 1759570000000,
      "tables": [
        {
          "id": "orders",       // internal id; relationships refer to it. Not changed by renaming.
          "name": "orders",
          "x": 320, "y": 40,    // position on the canvas
          "comment": "…",       // optional
          "cols": [
            { "id": "id", "name": "id", "type": "uuid", "pk": true, "nullable": false,
              "unique": false, "def": "gen_random_uuid()", "autoInc": false, "comment": "…" }
          ],
          "indexes": [          // optional: indexes defined by hand
            { "id": "…", "name": "orders_status_placed_at_idx", "cols": ["status", "placed_at"], "unique": false }
          ]
        }
      ],
      "rels": [
        { "id": "r2",
          "from": { "t": "orders", "c": "customer_id" },   // the foreign key column
          "to":   { "t": "customers", "c": "id" },         // the referenced column
          "onDelete": "CASCADE", "onUpdate": "NO ACTION",  // optional
          "one": false }                                   // optional: true for one-to-one
      ],
      "enums": [ { "name": "order_status", "values": ["pending", "paid"] } ],
      "notes": [ { "id": "…", "x": 40, "y": 520, "text": "…" } ]
    }
  ]
}
```

Column ids in `indexes[].cols` and in relationships are column `id`s, not names.

## `settings.json`

```jsonc
{
  "root": "C:\\Users\\you\\Documents\\Joinery",  // default projects folder
  "extra": ["D:\\Work\\Billing"],                // project folders outside the default
  "theme": null,                                 // "light", "dark", or null to follow Windows
  "sbCollapsed": false,
  "defaultEngine": "PostgreSQL 18",
  "showStatus": true,
  "showMinimap": true,
  "projectSort": { "key": "modified", "desc": true },
  "pinchZoom": true
}
```

## Portable or isolated data

If the environment variable `JOINERY_DATA_DIR` is set, Joinery keeps `settings.json` in that directory and uses `<that directory>\Projects` as the default projects folder, instead of the locations above. This is how the automated tests run the app without touching real projects, and it can be used for a portable install.
