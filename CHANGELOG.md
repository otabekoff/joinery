# Changelog

## 1.0.1

### Fixed
- Trackpad pinch and two-finger touch now zoom the canvas. The webview was discarding pinch gestures before the app saw them.
- Keyboard shortcuts work on non-Latin keyboard layouts such as Cyrillic (Ctrl+B, Ctrl+N, T, N and the rest).
- Full screen from a maximized window no longer leaves an uncovered strip at the taskbar.
- The status bar can be shown while the interface is hidden (Ctrl+Shift+\ or Ctrl+Shift+/).
- The Settings icon is a gear instead of a sun.
- The app icon in the title bar lines up with the navigation pane's column.

### Added
- Designs can be dragged into a new order in the navigation pane, not only on the project page.
- Project settings (name, engine for new designs, order of designs, folder) have their own dialog on the project page.
- A setting to turn pinch and Ctrl+scroll zoom off.
- "Many to many" is a choice in the relationship type list, next to one to many and one to one.

## 1.0.0

First release.

### Projects and storage
- Projects are saved as files on disk, one folder per project, in a default folder chosen on first launch (`Documents\Joinery` unless changed).
- Create, rename, move, open from another folder, and delete projects. Renaming a project renames its folder.
- Designs can be renamed, duplicated, deleted, sorted by any column, or dragged into an order of your own.
- Work is saved automatically, and again before the window closes.

### Editor
- Tables with columns, primary keys, nullable and unique flags, defaults, auto increment and comments.
- Relationships by dragging from one column to another; reconnect by dragging either end; many-to-one or one-to-one; ON DELETE and ON UPDATE actions; convert to many-to-many with a junction table.
- Enum types, multi-column and unique indexes, column reordering.
- Undo and redo, copy / cut / paste (also between designs), duplicate, multi-select, auto layout.
- Search, minimap, notes, an issue checker, zoom with the mouse wheel, trackpad pinch or touch.
- Full screen (F11) and a mode that hides the interface (Ctrl+\\).

### Engines, SQL and images
- PostgreSQL 16–18, MySQL 8.0 and 8.4, MariaDB 11.8, SQLite 3, SQL Server 2022 and 2025.
- Changing a design's engine converts column types and defaults.
- SQL export with syntax highlighting, for the design's engine or any other; SQL import.
- PNG and SVG export of the diagram.

### App
- Light and dark themes, settings for defaults, per-project default engine.
- Windows installers (NSIS and MSI).
