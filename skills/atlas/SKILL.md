---
name: atlas
description: Build or open the Atlas map of this codebase, a 3D semantic architecture map kept current by the agent. Use when the user asks to map, visualize or explain the architecture, or says "atlas".
argument-hint: '[open | status | refresh]'
---

# Atlas

The Atlas CLI is `node "${CLAUDE_PLUGIN_ROOT}/src/cli.ts"`. Below it is written `atlas`. It needs Node 24 or later; check with `node --version` and stop with a clear message if it is older.

Run `atlas status`. What happens next depends on the result and on `$ARGUMENTS`.

- It prints a report: the project already has a map. With `status`, summarize the report. With `refresh`, run `atlas refresh` and say how many descriptions were rewritten. Otherwise run `atlas open` and give the user the URL it prints.
- It says there is no `.atlas/atlas.config.json`: build the map from scratch with the steps below, then run `atlas open`.

## Building the map from scratch

Work through these in order. Each step ends with a command whose output tells you whether to move on.

### 1. Choose the project folder

The project folder holds `.atlas/` and is where the map lives. Use the current directory. If the current directory is a git repo and its parent folder contains other git repos, ask the user once whether to map only this repo or the whole parent folder. A map can also live in one "home" repo and describe its sibling repos.

The sources are the git repos inside the project folder: the folder itself if it is a repo, otherwise each direct child that is one. In a monorepo, make each top-level app or package its own source, so the map shows them as separate blocks.

### 2. Write `.atlas/atlas.config.json`

Look at each source's layout with `git ls-files` and its manifests (`package.json`, `tsconfig.json`, workspace files). Then write the config:

```json
{
  "name": "Acme",
  "language": "en",
  "sources": [
    {
      "id": "web",
      "dir": "web",
      "aliases": { "@/": "src/" },
      "modules": [
        { "match": "^src/app/api/([^/]+)/", "area": "api", "module": "$1" },
        { "match": "^src/([^/]+)/([^/.]+)", "area": "$1", "module": "$2" }
      ]
    }
  ]
}
```

- `language` is `en` or `pt`: the language the user writes to you in.
- `dir` is relative to the project folder; use `"."` when the project folder is the repo.
- `modules` are regexes over each file path; the first match wins and `$1`, `$2` are capture groups. Module ids become `<source>/<area>/<module>`. Files no rule matches are left out.
- A module is a unit with one responsibility: a feature folder, a package, a route group, a service. Aim for 20 to 150 modules in total, grouped into areas the team would recognize.
- `aliases` come from `tsconfig.json` `paths` or the bundler config, so imports resolve into edges.
- Add `"role": "legacy"` to a source that is being retired.

Then declare the external systems the code talks to: databases, queues, storage, payment, email, AI and SaaS APIs. Find them in each `package.json`'s dependencies, in `.env.example` files and in the variables the code reads, and in hard-coded hosts or provider names. Add them as `externals`:

```json
"externals": [
  { "id": "postgres", "name": "Postgres", "kind": "database", "packages": ["pg"], "env": ["DATABASE_URL"] },
  { "id": "stripe", "name": "Stripe", "kind": "payments", "packages": ["stripe"], "env": ["STRIPE_"] },
  { "id": "crm", "name": "CRM", "kind": "crm", "code": ["['\"]crm-provider['\"]"] }
]
```

A file calls a system when it imports one of its `packages` (`"@aws-sdk/*"` matches every subpath), reads an environment variable starting with one of its `env` prefixes (`process.env.STRIPE_KEY`, `env.STRIPE_KEY`), or matches one of its `code` regexes. Use `code` for systems reached without an SDK: a REST host, or a provider key passed to an integration proxy. Keep `kind` short and shared between similar systems.

Run `atlas build`, then read `.atlas/out/skeleton.json` (module ids, file counts, lines). Adjust the rules and rebuild until no module swallows unrelated code, no important folder is missing, and the count is in range. `atlas status` lists `systemsNeverCalled`: fix those systems' signals, or drop the ones the code doesn't use.

### 3. Write `.atlas/semantic.json`

This is the meaning layer: what each part is for and how the parts work together. The format is in [semantic-format.md](semantic-format.md); read it first.

Read the code before you write about it: entry points, routes, the main types, READMEs. On a large codebase, hand areas to parallel subagents and have each return the `desc` entries for its modules, then merge them.

- `system`: what the whole thing is, in two or three sentences.
- `caps`: 4 to 12 capabilities, the business-level groups a newcomer should see first. Their `rules` must place every module in exactly one.
- `desc`: one entry per module, and one per external system (`ext:<id>`) saying what the project uses it for. `biz` says what it is for in plain words, `tech` how it does it, one or two sentences each. Add one to three `anchors`, the `path:line` places that prove it, and `"confidence": "verified"`. Write nothing you didn't read in the code: the build refuses a description without anchors.
- `flows`: the 3 to 6 paths through the code that matter most, 4 to 10 steps each. Every step is an existing module id with an anchor you read, or an external system (`ext:<id>`) where the flow leaves the code.
- `decisions`: only choices with written evidence (an ADR, a design doc, a comment that explains a why).

If `language` is `pt`, write Portuguese in the base fields and English in the `_en` twins. If it is `en`, write English and skip the twins.

Run `atlas build` and fix everything it reports: unknown ids, modules without a capability, dropped flow steps. Repeat until it is clean.

### 4. Finish

- If the project folder is a git repo, add `.atlas/out/` to its `.gitignore`. The rest of `.atlas/` is meant to be committed.
- Run `atlas open`, give the user the URL, and summarize what you mapped: the capabilities, the module count and the flows.
- Tell the user the map now updates itself. Each session starts with a short brief of it, and module descriptions are rewritten after a turn that changed their code.
