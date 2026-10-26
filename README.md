# Move to Collection for Zotero 10

A small Zotero 10 plugin that adds a **Move to Collection / 移动到分类** submenu to the item context menu.

## Features

- Move one or multiple selected top-level items from the current Collection to another Collection.
- Dynamically displays the current Collection hierarchy.
- Supports nested Collections.
- Shows up to five recently used Collections at the top.
- Preserves PDFs, notes, tags, metadata, and memberships in other Collections.
- Moves only within the same Zotero library.
- Uses Zotero 10's `Zotero.MenuManager` API rather than modifying Zotero's native fixed-index menu DOM.

## Repository structure

```text
.
├── bootstrap.js     # Main plugin logic
├── manifest.json    # Zotero plugin metadata and compatibility
├── build.sh         # Builds the .xpi package
├── README.md
├── CHANGELOG.md
├── LICENSE
└── .gitignore
```

## Build

On macOS/Linux:

```bash
chmod +x build.sh
./build.sh
```

The generated plugin will be placed at:

```text
dist/move-to-collection-0.1.0.xpi
```

An `.xpi` file is a ZIP archive with a different extension. No JavaScript compilation or bundling is required for this plugin.

## Install

1. Open Zotero 10.
2. Open **Tools → Plugins**.
3. Open the gear/menu button.
4. Choose **Install Plugin From File…**.
5. Select the generated `.xpi` file.
6. Restart Zotero if the context-menu entry does not appear immediately.

## Use

1. Open a normal Collection in Zotero's left pane.
2. Select one or more paper items.
3. Right-click → **Move to Collection / 移动到分类**.
4. Choose the destination Collection.

The selected items are added to the destination Collection and removed only from the Collection currently being viewed. Other Collection memberships remain unchanged.

## Compatibility

- Zotero: `10.0.*`

## License

MIT
