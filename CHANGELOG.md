# Changelog

## 1.0.2

### Fixed
- The installers carry Joinery's own icon, images, publisher, description and license instead of the toolkit's defaults.

### Added
- The SQL import box highlights syntax as you type or paste, like the export view.

## 1.0.1

### Fixed
- With the whole interface hidden, selecting a table, column or relationship brings the inspector up again. In a narrow window the inspector opens on selection instead of waiting behind a rail, and a closed inspector always leaves a rail to reopen it.
- Trackpad pinch and two-finger touch now zoom the canvas. The webview was discarding pinch gestures before the app saw them.
- Keyboard shortcuts work on non-Latin keyboard layouts such as Cyrillic (Ctrl+B, Ctrl+N, T, N and the rest).
- Full screen from a maximized window no longer leaves an uncovered strip at the taskbar.
- `N` adds a note where the pointer is (or where the canvas was last clicked) instead of the middle of the view.
- The Settings icon is a gear instead of a sun.
- The app icon in the title bar lines up with the navigation pane's column.

### Added
- Notes come in five colors; hover a note and pick one from its top strip.
- `T` adds a table near the pointer, like `N` does for notes. An optional ripple (Settings → Canvas) marks where the empty canvas was clicked.
- The navigation pane (Ctrl+B), toolbar (Ctrl+Shift+T), inspector (Ctrl+.), status bar (Ctrl+Shift+S) and minimap (M) can each be shown or hidden on their own. Ctrl+Shift+/ hides or restores all of them.
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
