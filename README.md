# Unique Tab

Ensures each note is opened in only one tab, preventing duplicates and keeping your workspace clean.

## Features

- **Single tab per file** — opening a note, Canvas, or other file that's already open focuses the existing tab instead of creating a duplicate.
- **Smart redirection** — works whether the file is opened via the file explorer, Quick Switcher, global search, or internal links.
- **No visual flicker** — the throwaway empty tab created before redirection is hidden and detached immediately.
- **Universal file support** — works with Markdown, Canvas, and custom view types from other plugins.

## Development

```bash
bun install
bun run build      # bundle main.ts -> main.js
bun run typecheck  # tsc --noEmit
bun run lint       # eslint .
bun run deploy     # build + copy into the local vault's plugins/unique-tab folder
```

## Manual installation

1. Download `main.js`, `manifest.json`, and `styles.css` from the [Releases](https://github.com/lhak1341/obsidian-unique-tab/releases) page.
2. Create a `unique-tab` folder inside your vault's `.obsidian/plugins/` directory.
3. Place the three files inside it.
4. Reload Obsidian and enable the plugin under **Settings > Community plugins**.
