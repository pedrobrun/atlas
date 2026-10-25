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
npm run check                        # types, formatting, tests, private-terms scan
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

## What's in the box

| Path              | What it does                                                                                                                                                                                                                                                                                              |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/types.ts`    | The contract: project config, semantic layer, skeleton, the merged map, the data embedded in the page, and the server protocols.                                                                                                                                                                          |
| `src/parse.ts`    | Turns outside JSON (config, request bodies, the agent's output, the local store) into those types, naming the field it can't use.                                                                                                                                                                         |
| `src/skeleton.ts` | Walks each source's `git ls-files`, maps files to areas and modules by the config rules, resolves imports into edges, hashes content. No LLM.                                                                                                                                                             |
| `src/merge.ts`    | Pure: joins the skeleton, the semantic layer and what the agent wrote into one map, and reports unknown ids.                                                                                                                                                                                              |
| `src/context.ts`  | Pure: the map as markdown for the chat agent.                                                                                                                                                                                                                                                             |
| `src/build.ts`    | The shell around those two: reads the project, bundles the viewer with esbuild, writes the page and the context file.                                                                                                                                                                                     |
| `src/agent.ts`    | Pure: prompts and flags for Claude Code, and reading its stream-json output.                                                                                                                                                                                                                              |
| `src/serve.ts`    | Local server: `/chat` streams the agent's answer, `/describe` describes a module and its files on first visit, `/flows` saves a flow the chat documented.                                                                                                                                                 |
| `src/viewer/`     | The viewer, bundled into the page. `tree.ts` lays out the nested boxes, `roles.ts` decides what is visible, `scene.ts` draws and animates, `nav.ts` moves around, `cards.ts` and `html.ts` build the panels' HTML, `answer.ts` reads the agent's reply, `panels.ts`, `chat.ts` and `pick.ts` wire the UI. |
| `test/`           | A characterization test that runs the real scripts on a made-up two-repo project, and tests for the parsers.                                                                                                                                                                                              |

## Decisions so far

- **Semantics first, structure as evidence.** Every claim should point at `file:line`; descriptions carry the hash they were written against and show as stale when the code moves.
- **Generic meta-model, per-project taxonomy.** Capability, Unit, Flow, Concept, Invariant, Decision are fixed; _which_ capabilities a project has is data.
- **The map lives with the project, never with the tool.** Per repo, at a workspace root, in its own repo, or in a "home" repo that describes several.
- **Updates:** the skeleton always; semantic text is marked stale immediately and regenerated at the end of an agent session (`Stop` hook) or on `atlas sync`.
- **Runs on the user's agent** locally; a hosted view (with an architecture diff per PR) needs its own key.
- **Language per project**, switchable in the viewer.

## Known limits

- Chat answers take ~1–3 min (a full Claude Code session per question); the first visit to an undescribed module takes ~45–90 s.
- Labels can overlap in dense districts; arcs to far modules leave the screen.
- Not built yet: branch/PR architecture diff, `atlas sync`, hooks, generating the semantic layer (today it is hand-written or filled in on demand).
