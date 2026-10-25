# Atlas

A living, semantic, 3D map of a codebase — macro to micro, kept up to date by the agents that write the code.

As more code is written by agents, it gets harder to hold the architecture in your head: which services exist, how they talk, what a module is *for*. Static dependency graphs show structure but lose meaning; generated wikis read like API docs and go stale. Atlas keeps both: a deterministic skeleton (modules, imports, hashes) as evidence, and a semantic layer (what each thing does, flows, invariants, decisions) on top, anchored to `file:line`.

> **Status: prototype.**

## Run it

A project is any folder holding one or more git repos, plus a `.atlas/` folder that describes them.

```sh
node skeleton.mjs <project>          # deterministic skeleton → <project>/.atlas/out/skeleton.json
node build.mjs <project>             # merge the semantic layer → <project>/.atlas/out/atlas.html
node serve.mjs <project> 4317        # page + chat at http://127.0.0.1:4317
```

`atlas.html` also opens straight from disk (no chat, no on-demand descriptions). The chat and the descriptions run your own Claude Code headless (`claude -p`) inside the project with read-only tools — no API key.

## The project folder

```
<project>/
  .atlas/
    atlas.config.json        # sources and how their paths become modules (required)
    semantic.mjs             # semantic layer in the base language (optional)
    semantic_en.mjs          # English twins of its text (optional)
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
  "languages": ["en", "pt"],
  "sources": [
    { "id": "web", "dir": "web", "color": "#3b9ae8", "aliases": { "@/": "src/" },
      "modules": [
        { "match": "^src/app/api/([^/]+)/", "area": "api", "module": "$1" },
        { "match": "^src/([^/]+)/([^/.]+)", "area": "$1", "module": "$2" }
      ] },
    { "id": "billing", "dir": "billing", "role": "legacy",
      "modules": [ { "match": "^lib/([^/.]+)", "area": "lib", "module": "$1" } ] }
  ],
  "chat": { "suggestions": { "en": ["How does checkout work?"] } }
}
```

Each `modules` rule is a regex over the file path; the first match names the area and module (`$1`, `$2` are capture groups). Imports are resolved through each package's `package.json` `exports`, relative paths, and the `aliases` you give.

`semantic.mjs` exports any of: `system`, `caps` (capabilities, each with `rules` matching module ids), `desc` (per node), `flows`, `invariants`, `decisions`, `concepts`, `legacy` + `legacyStatus`. `build.mjs` checks every id against the skeleton and fails on unknown ones.

## What's in the box

| File | What it does |
|---|---|
| `skeleton.mjs` | Walks each source's `git ls-files`, maps files to areas → modules by the config rules, resolves imports into edges, hashes content. No LLM. |
| `build.mjs` | Validates semantic ids, marks descriptions stale by hash, merges agent-written descriptions and flows, inlines Three.js, writes the page and the agent's context file. |
| `template3d.html` | The viewer: glass districts per capability (or repo), modules as blocks sized by code, click to open down to files, dependency arcs, flow tours, EN/PT, chat, in-scene captions. |
| `serve.mjs` | Local server: `/chat` (streams the agent's answer, which can light modules up in 3D), `/describe` (describes a module and its files on first visit, cached), `/flows` (saves a flow the chat documented). |
| `vendor/three` | Three.js r128 + OrbitControls + CSS2DRenderer (MIT), inlined at build so the page works offline. |

## Decisions so far

- **Semantics first, structure as evidence.** Every claim should point at `file:line`; descriptions carry the hash they were written against and show as stale when the code moves.
- **Generic meta-model, per-project taxonomy.** Capability, Unit, Flow, Concept, Invariant, Decision are fixed; *which* capabilities a project has is data.
- **The map lives with the project, never with the tool.** Per repo, at a workspace root, in its own repo, or in a "home" repo that describes several.
- **Updates:** the skeleton always; semantic text is marked stale immediately and regenerated at the end of an agent session (`Stop` hook) or on `atlas sync`.
- **Runs on the user's agent** locally; a hosted view (with an architecture diff per PR) needs its own key.
- **Language per project**, switchable in the viewer.

## Known limits

- Chat answers take ~1–3 min (a full Claude Code session per question); the first visit to an undescribed module takes ~45–90 s.
- Labels can overlap in dense districts; arcs to far modules leave the screen.
- Not built yet: branch/PR architecture diff, `atlas sync`, hooks, generating the semantic layer (today it is hand-written or filled in on demand).
