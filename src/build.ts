// Merge a project's skeleton and semantic layer, bundle the viewer, and write one
// self-contained page plus a compact text version of the map for the chat agent.
// Usage: node src/build.ts <project>   (reads <project>/.atlas, writes <project>/.atlas/out)
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import * as esbuild from 'esbuild';
import type {
  Atlas,
  AtlasConfig,
  DescriptionsStore,
  Flow,
  PageData,
  Semantic,
  SemanticEn,
  Skeleton,
} from './types.ts';
import { atlasPaths, readJson, readJsonOr } from './project.ts';
import { mergeMap } from './merge.ts';
import { renderContext } from './context.ts';

const viewer = path.join(import.meta.dirname, 'viewer');
const project = path.resolve(process.argv[2] || '.');
const paths = atlasPaths(project);

/** The semantic layer is optional and may be written in TS or JS. */
async function loadModule<T>(name: string): Promise<Partial<T>> {
  for (const ext of ['.ts', '.mjs', '.js']) {
    const file = path.join(paths.store, name + ext);
    if (fs.existsSync(file)) return { ...(await import(pathToFileURL(file).href)) };
  }
  return {};
}

const { atlas, unknownIds, modulesWithoutCapability, droppedFlowSteps } = mergeMap({
  config: readJson(paths.config) as AtlasConfig,
  skeleton: readJson(paths.skeleton) as Skeleton,
  semantic: await loadModule<Semantic>('semantic'),
  english: await loadModule<SemanticEn>('semantic_en'),
  descriptions: readJsonOr<DescriptionsStore>(paths.descriptions, { nodes: {}, files: {} }),
  savedFlows: readJsonOr<Flow[]>(paths.flows, []),
});
if (unknownIds.length) {
  console.error('unknown ids:\n' + unknownIds.join('\n'));
  process.exit(1);
}
if (modulesWithoutCapability.length) {
  console.error(
    `modules without a capability: ${modulesWithoutCapability.length}\n  ${modulesWithoutCapability.join('\n  ')}`,
  );
}
for (const line of droppedFlowSteps) console.error(line);

/** What the viewer reads: the map minus what only the agent's context uses. */
function pageData(a: Atlas): PageData {
  return {
    config: a.config,
    system: a.system,
    nodes: a.nodes,
    edges: a.edges,
    caps: a.caps.map(({ rules, ...c }) => c),
    invariants: a.invariants,
    flows: a.flows,
    legacy: a.legacy,
  };
}

/** One offline page: the viewer bundled with three.js, its styles and markup, and the map as JSON. */
async function renderPage(data: PageData) {
  const bundle = await esbuild.build({
    entryPoints: [path.join(viewer, 'main.ts')],
    bundle: true,
    write: false,
    format: 'iife',
    minify: true,
    target: 'es2022',
    legalComments: 'none',
  });
  const js = bundle.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
  const json = JSON.stringify(data).replace(/</g, '\\u003c');
  return `<!doctype html>
<html lang="${data.config.lang === 'pt' ? 'pt-BR' : 'en'}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Atlas · ${data.config.name.replace(/[<&]/g, '')}</title>
<style>${fs.readFileSync(path.join(viewer, 'styles.css'), 'utf8')}</style>
</head>
<body>
${fs.readFileSync(path.join(viewer, 'shell.html'), 'utf8')}
<script id="atlas-data" type="application/json">${json}</script>
<script>${js}</script>
</body>
</html>
`;
}

const page = await renderPage(pageData(atlas));
const context = renderContext(atlas);
fs.mkdirSync(paths.out, { recursive: true });
fs.writeFileSync(paths.page, page);
fs.writeFileSync(paths.context, context);
console.error(
  `build: ${path.relative(project, paths.page)} (${Math.round(page.length / 1024)} KB), ` +
    `atlas-context.md (${context.split('\n').length} lines)`,
);
