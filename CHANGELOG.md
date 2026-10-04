# Changelog

## 1.0.0

First release.

### Projects and storage
- Projects are saved as files on disk, one folder per project, in a default folder chosen on first launch (`Documents\Joinery` unless changed).
- Create, rename, move, open from another folder, and delete projects. Renaming a project renames its folder.
- Designs can be renamed, duplicated, deleted, sorted by any column, or dragged into an order of your own, on the project page or in the navigation pane.
- Each project has its own settings: name, engine for new designs, order of designs and folder.
- Work is saved automatically, and again before the window closes.

### Editor
- Tables with columns, primary keys, nullable and unique flags, defaults, auto increment and comments.
- Relationships by dragging from one column to another; reconnect by dragging either end. One to many, one to one, many to many (through a junction table) and self-referencing, with ON DELETE and ON UPDATE actions.
- Enum types, multi-column and unique indexes, column reordering.
- Undo and redo, copy / cut / paste (also between designs), duplicate, multi-select, auto layout.
- Search, minimap, an issue checker, and notes in five colors.
- `T` and `N` add a table or a note near the pointer. An optional ripple marks where the empty canvas was clicked.
- Zoom with the mouse wheel, trackpad pinch or two-finger touch; this can be turned off in Settings.

### Engines, SQL and images
- PostgreSQL 16–18, MySQL 8.0 and 8.4, MariaDB 11.8, SQLite 3, SQL Server 2022 and 2025.
- Changing a design's engine converts column types and defaults.
- SQL export for the design's engine or any other, and SQL import, both with syntax highlighting.
- PNG and SVG export of the diagram.

### App
- Light and dark themes, and settings for the defaults.
- The navigation pane (Ctrl+B), toolbar (Ctrl+Shift+T), inspector (Ctrl+.), status bar (Ctrl+Shift+S) and minimap (M) can each be shown or hidden on their own. Ctrl+Shift+/ hides or restores all of them. F11 is full screen.
- Keyboard shortcuts work on non-Latin keyboard layouts such as Cyrillic.
- Windows installers (NSIS and MSI) with Joinery's own icon, images, publisher details and license.
