# obsidian-unique-tab

House conventions for Obsidian plugin repos live in the `obsidian-plugin-dev` skill —
including the `typescript` version pin that used to be the only note here.

Single-file plugin (`main.ts` at repo root). No bundler config: `build` calls the `esbuild`
CLI directly with inline flags, and there is no `dev` watch script.
