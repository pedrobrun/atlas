# Atlas

A living, semantic, 3D map of a codebase — macro to micro, kept up to date by the agents that write the code.

As more code is written by agents, it gets harder to hold the architecture in your head: which services exist, how they talk, what a module is _for_. Static dependency graphs show structure but lose meaning; generated wikis read like API docs and go stale. Atlas keeps both: a deterministic skeleton (modules, imports, hashes) as evidence, and a semantic layer (what each thing does, flows, invariants, decisions) on top, anchored to `file:line`.

> **Status: prototype.**

## Run it

Needs Node 24+ (it runs the TypeScript sources directly) and, for the chat, Claude Code.
A project is any folder holding one or more git repos, plus a `.atlas/` folder that describes them.

```sh
npm install
npm run skeleton -- <project>        # deterministic skeleton → <project>/.atlas/out/skeleton.json
npm run build -- <project>           # merge the semantic layer, bundle the viewer → <project>/.atlas/out/atlas.html
npm run serve -- <project> 4317      # page + chat at http://127.0.0.1:4317
```

`atlas.html` also opens straight from disk (no chat, no on-demand descriptions). The chat and the descriptions run your own Claude Code headless (`claude -p`) inside the project with read-only tools — no API key.

## The project folder

```
<project>/
  .atlas/
    atlas.config.json        # sources and how their paths become modules (required)
    semantic.ts              # semantic layer in the base language (optional; .mjs also works)
    semantic_en.ts           # English twins of its text (optional)
    descriptions.local.json  # written by the agent when you open an undescribed module
    flows.local.json         # flows documented from the chat
    out/                     # generated: skeleton.json, atlas.html, atlas-context.md
  web/        (a git repo)
  billing/    (a git repo)
```

`atlas.config.json`, for a made-up shop with two repos:

```json
{
  "name": "Acme",
  "language": "en",
  "sources": [
    {
      "id": "web",
      "dir": "web",
      "color": "#3b9ae8",
      "aliases": { "@/": "src/" },
      "modules": [
        { "match": "^src/app/api/([^/]+)/", "area": "api", "module": "$1" },
        { "match": "^src/([^/]+)/([^/.]+)", "area": "$1", "module": "$2" }
      ]
    },
    {
      "id": "billing",
      "dir": "billing",
      "role": "legacy",
      "modules": [{ "match": "^lib/([^/.]+)", "area": "lib", "module": "$1" }]
    }
  ],
  "chat": { "suggestions": { "en": ["How does checkout work?"] } }
}
```

Each `modules` rule is a regex over the file path; the first match names the area and module (`$1`, `$2` are capture groups). Imports are resolved through each package's `package.json` `exports`, relative paths, and the `aliases` you give.

The config and the semantic layer are typed in `src/types.ts` (`AtlasConfig`, `Semantic`, `SemanticEn`). `semantic.ts` exports any of: `system`, `caps` (capabilities, each with `rules` matching module ids), `desc` (per node), `flows`, `invariants`, `decisions`, `concepts`, `legacy` + `legacyStatus`. The build checks every id against the skeleton and fails on unknown ones.

## Known limits

- Chat answers take ~1–3 min (a full Claude Code session per question); the first visit to an undescribed module takes ~45–90 s.
- Labels can overlap in dense districts; arcs to far modules leave the screen.
- Not built yet: branch/PR architecture diff, `atlas sync`, hooks, generating the semantic layer (today it is hand-written or filled in on demand).

Working on Atlas itself? See [CONTRIBUTING.md](CONTRIBUTING.md).
