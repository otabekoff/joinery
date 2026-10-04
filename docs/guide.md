# User guide

## Projects and designs

A **project** is a folder on disk. It holds one or more **designs**, and each design is one database schema.

- **New project**: on the Projects page choose *New project*. The row shows where it will be saved; *Choose another folder…* puts this one project somewhere else.
- **Open…** adds a project that already exists in another folder, for example one copied from a colleague.
- The **⋯** menu on a project renames it, moves it to another folder or deletes it. Renaming also renames the folder when the folder was named after the project.
- Inside a project, *New design* asks for a name and a database engine.
- Click a column header to sort the designs. A third click returns to your own order, which you set by dragging rows up and down.

## The editor

### Tables and columns
- **Add table** (or `T`) places a table in free space near the middle of the view. Type the table name, press Enter, then add columns: name, Enter, type, Enter. *Done* or Esc finishes.
- Click a table to see it in the inspector on the right. There you can rename it, add a comment, flip the PK / nullable / unique flags and manage indexes.
- Click a column for its own inspector: type, default, comment, flags, and arrows to move it up or down.

### Relationships
- Hover a column and drag the round handle at its right edge onto a column in another table. The tip tells you whether the types match.
- Click a line to select it. The inspector shows both ends as dropdowns, the ON DELETE and ON UPDATE actions, and the type (many to one, or one to one).
- To **reconnect**, select the line and drag either round handle at its ends onto a different column.
- *Convert to many-to-many* replaces the relationship with a junction table referencing both sides.

### Types
- The **Types** button defines enum types and their values. They appear in the type picker as *Enums in this design*.
- The type picker lists the built-in types of the design's engine. You can also type any type by hand.

### Moving around
- Drag the canvas to pan; Ctrl+scroll or pinch to zoom; `Shift+1` fits everything.
- The minimap in the corner shows the whole schema; click or drag in it to jump.
- `Ctrl+K` searches tables and columns.
- `N` adds a note. Drag it by its top strip; hover to delete it.

### Checking your work
When something would make the exported SQL wrong, the status bar shows a count of **issues**. Click it for the list; choosing an entry takes you to the table, column or relationship.

## Engines

The design name in the toolbar opens the design menu, where *Change engine* switches the target database. Column types and defaults are converted where the new engine has an equivalent (for example `uuid` becomes `uniqueidentifier` on SQL Server). Types with no equivalent, such as your own enums, are left as they are. Changing engine clears that design's undo history.

## Import and export

The **File** menu in the toolbar has:

- **Import SQL…** — paste `CREATE TABLE` statements or open a `.sql` file. Tables, keys, indexes, foreign keys and enums are added as one step you can undo. Statements Joinery does not understand are skipped and counted.
- **Export SQL…** — shows the script. The dropdown at the top generates it for another engine without changing the design.
- **Export PNG / SVG image…** — the whole diagram in the current theme.

## Window and view

| Key | What it does |
|---|---|
| `F11` | Full screen |
| `Ctrl+\` | Hide or show the interface, leaving only the canvas. The inspector still appears when you select something. |
| `Ctrl+B` | Navigation pane |
| `Ctrl+.` | Inspector |
| `Ctrl+Shift+\` | Status bar |
| `M` | Minimap |
| `Ctrl+,` | Settings |

## Settings

*Settings* (bottom of the navigation pane) covers the theme, the status bar and minimap, the engine preselected for new designs, and the default projects folder. When a project is open it also shows that project's own settings: the engine for its new designs, and its folder.
