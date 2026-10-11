# obsidian-unique-tab

House conventions live in the `obsidian-plugin-dev` skill.

Deviates from that skill's declared script contract: no `esbuild.config.mjs` (build uses
inline esbuild flags in `package.json`), and no `dev` script. `test` is `bun test`: colocated
`*.test.ts` files run against hand-written fakes of `App`/`WorkspaceLeaf`; `obsidian` ships types
only, so modules under test import it with `import type` and take runtime functions as arguments.
