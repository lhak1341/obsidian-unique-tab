# obsidian-unique-tab

- `eslint-plugin-obsidianmd` requires `typescript-eslint`/`@typescript-eslint/parser`, which peer-cap `typescript` at `<6.1.0` — pin `typescript@6.0.3`, don't let bun resolve to the TS7 `latest` tag.
