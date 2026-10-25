# Contributing

Atlas runs its TypeScript sources directly on Node 24, so only erasable syntax works: no enums, no namespaces, no parameter properties. Import with `.ts` extensions and `import type` for types.

```sh
npm run check        # types, formatting, tests, private-terms scan; must pass before a commit
npm run format       # Prettier
npm run test:update  # rewrite snapshots after a deliberate output change
```

Read [AGENTS.md](AGENTS.md) before your first commit. Nothing specific to a real project, company or person may enter this repo.

## Where things are

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
