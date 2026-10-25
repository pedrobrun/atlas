import fs from 'node:fs';
import path from 'node:path';
import type { Atlas, PageData } from './types.ts';
import { atlasPaths } from './project.ts';
import { loadAtlas } from './load.ts';
import { renderContext } from './context.ts';

const viewer = path.join(import.meta.dirname, 'viewer');
const bundled = path.join(import.meta.dirname, '..', 'dist', 'viewer.js');
const logo = path.join(import.meta.dirname, '..', 'assets', 'logo.svg');
const project = path.resolve(process.argv[2] || '.');
const paths = atlasPaths(project);

const { atlas, unknownIds, modulesWithoutCapability, droppedFlowSteps } = await loadAtlas(project);
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

function renderPage(data: PageData) {
  const js = fs.readFileSync(bundled, 'utf8').replace(/<\/script/gi, '<\\/script');
  const json = JSON.stringify(data).replace(/</g, '\\u003c');
  return `<!doctype html>
<html lang="${data.config.lang === 'pt' ? 'pt-BR' : 'en'}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Atlas · ${data.config.name.replace(/[<&]/g, '')}</title>
<link rel="icon" href="data:image/svg+xml,${encodeURIComponent(fs.readFileSync(logo, 'utf8'))}">
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

const page = renderPage(pageData(atlas));
const context = renderContext(atlas);
fs.mkdirSync(paths.out, { recursive: true });
fs.writeFileSync(paths.page, page);
fs.writeFileSync(paths.context, context);
console.error(
  `build: ${path.relative(project, paths.page)} (${Math.round(page.length / 1024)} KB), ` +
    `atlas-context.md (${context.split('\n').length} lines)`,
);
