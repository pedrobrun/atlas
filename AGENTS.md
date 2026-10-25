# Agent instructions

## Nothing project- or company-specific, ever

This repository will be open source. It must never contain anything that belongs to a real company, client or person — not in code, comments, tests, fixtures, examples, docs, commit messages, branch names, PR titles or PR descriptions. Once something reaches git history or GitHub it is effectively public; a later commit does not remove it.

That includes, without exception:
- names of companies, clients, products, people, repos, packages or package scopes;
- repo layouts, file paths, module names, table names or routes taken from a real codebase;
- semantic descriptions, flows, invariants or decisions written about a real codebase;
- example questions, prompts or screenshots that show a real codebase;
- emails, domains, URLs, keys or IDs.

Where that material goes instead: the project's own `.atlas/` folder (`<project>/.atlas/atlas.config.json`, `semantic*.mjs`, the generated `out/`), which lives with the project and outside this repo. The tool reads it at runtime; it is never copied here.

When an example is needed, invent one (`Acme`, `web`, `billing`, `orders`). Do not "anonymize" a real project by renaming it — its shape is still identifying.

## Before every commit and push

1. Keep a local list of private terms in `.private-terms` (one per line; `#` comments). It is gitignored and must stay that way — the list itself is private.
2. Turn on the guard once per clone: `git config core.hooksPath .githooks`. The pre-push hook runs `scripts/check-private.sh` over the files and the full history being pushed and refuses the push on any match.
3. Run it yourself before opening a PR: `scripts/check-private.sh`.
4. If something private ever lands in a commit that was pushed, stop and tell the user: force-pushing is not enough (pull-request refs keep the old commits). The repo has to be deleted and recreated, or history rewritten and every ref purged.

If you are unsure whether something is specific to a real project, assume it is and ask.

## Working here

- TypeScript throughout. Node runs `src/*.ts` directly (type stripping), so only erasable syntax: no `enum`, `namespace` or parameter properties; type-only imports use `import type`; local imports keep the `.ts` extension. `src/viewer` is bundled by esbuild at build time.
- `npm run typecheck` must pass before committing.
- The scripts take the project folder as their first argument; see `README.md`. To try changes against a real project, point them at that project's folder. Its data stays there.
