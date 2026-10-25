// Characterization test: builds a made-up two-repo project, runs the real skeleton and build
// scripts on it, and pins their output. Regenerate after an intended change with
// `npm run test:update`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const tool = path.resolve(import.meta.dirname, '..');

const repos: Record<string, Record<string, string>> = {
  web: {
    'package.json': JSON.stringify({ name: 'web' }),
    'src/app/api/orders/route.ts': `import { addItem } from '@/lib/cart';\nimport { invoice } from '@acme/billing/invoices';\nexport const POST = () => invoice(addItem());\n`,
    'src/app/page.tsx': `import { Button } from '../ui/button';\nexport default () => Button;\n`,
    'src/lib/cart.ts': `export const addItem = () => 1;\n`,
    'src/ui/button.tsx': `export const Button = 'button';\n`,
    'src/ui/button.test.tsx': `throw new Error('tests are skipped');\n`,
  },
  billing: {
    'package.json': JSON.stringify({ name: '@acme/billing', exports: { '.': './src/index.ts', './invoices': './src/invoices/index.ts' } }),
    'src/index.ts': `export * from './invoices';\nexport { total } from './tax';\n`,
    'src/tax.ts': `export const total = (n: number) => n * 1.2;\n`,
    'src/invoices/index.ts': `import { total } from '../tax';\nimport { render } from './pdf';\nexport const invoice = (n: number) => render(total(n));\n`,
    'src/invoices/pdf.ts': `export const render = (n: number) => String(n);\n`,
  },
};

const config = {
  name: 'Acme',
  language: 'en',
  languages: ['en', 'pt'],
  sources: [
    { id: 'web', dir: 'web', color: '#3b9ae8', aliases: { '@/': 'src/' },
      modules: [
        { match: '^src/app/api/([^/]+)/', area: 'api', module: '$1' },
        { match: '^src/app/page\\.tsx$', area: 'pages', module: 'home' },
        { match: '^src/(lib|ui)/([^/.]+)', area: '$1', module: '$2' },
      ] },
    { id: 'billing', dir: 'billing', name: 'billing-service', role: 'legacy',
      modules: [{ match: '^src/([^/.]+)', area: 'core', areaName: '@acme/billing', module: '$1' }] },
  ],
  chat: { suggestions: { en: ['How does checkout work?'] } },
};

const semantic = `
export const system = { biz: 'Uma loja.', tech: 'Um app web e um serviço de cobrança.' };
export const caps = [
  { id: 'buy', name: 'Comprar', biz: 'Pôr coisas no carrinho e pagar.', rules: [/^web\\//] },
  { id: 'bill', name: 'Cobrar', rules: [/^billing\\//] },
];
export const desc = {
  'web/api/orders': { biz: 'Recebe pedidos.', tech: 'POST que chama a cobrança.', confidence: 'verified',
    anchors: [{ path: 'web/src/app/api/orders/route.ts', line: 3, note: 'cria a fatura' }] },
  'billing/core/invoices': { tech: 'Gera faturas.', confidence: 'inferred', describedHash: 'deadbeef' },
};
export const legacy = { extracted: { label: 'já extraído', note: 'Foi para outro lugar.' } };
export const legacyStatus = { 'billing/core/tax': 'extracted' };
export const invariants = [
  { id: 'tax', name: 'Imposto num lugar só', guard: 'none', guardPath: 'docs/tax.md', scope: ['billing/core/tax'] },
];
export const decisions = [{ id: '0001', name: 'Cobrança separada', path: 'docs/0001.md', units: ['billing/core/index'] }];
export const concepts = [{ id: 'order', name: 'Pedido', owner: ['web/api/orders'], writes: [], reads: ['web/lib/cart'] }];
export const flows = [{ id: 'checkout', name: 'Finalizar compra', confidence: 'verified', steps: [
  { unit: 'web/api/orders', text: 'Recebe o pedido.', anchor: 'web/src/app/api/orders/route.ts:3' },
  { unit: 'billing/core/invoices', text: 'Gera a fatura.', anchor: null },
] }];
`;
const semanticEn = `
export const system = { biz: 'A shop.' };
export const caps = { buy: { name: 'Buying', biz: 'Put things in the cart and pay.' } };
export const desc = { 'web/api/orders': { biz: 'Takes orders.' } };
export const anchorNotes = { 'cria a fatura': 'creates the invoice' };
export const legacy = { extracted: { label: 'extracted' } };
export const invariants = { tax: { name: 'Tax in one place' } };
export const flows = { checkout: { name: 'Checkout', steps: ['Takes the order.', 'Makes the invoice.'] } };
`;
const store = {
  'descriptions.local.json': JSON.stringify({
    nodes: { 'web/lib/cart': { biz: 'O carrinho.', biz_en: 'The cart.', confidence: 'generated', describedHash: 'stale000' } },
    files: { 'web/src/lib/cart.ts': { tech_en: 'Adds an item.', confidence: 'generated', describedHash: 'x' } },
  }),
  'flows.local.json': JSON.stringify([
    { id: 'browse', name: 'Navegar', name_en: 'Browse', confidence: 'inferred', steps: [
      { unit: 'web/pages/home', text: 'Abre a home.', text_en: 'Opens home.', anchor: null },
      { unit: 'web/gone/module', text: 'Sumiu.', anchor: null },
    ] },
  ]),
};

// Fixed identity and dates, so commit hashes in the skeleton are stable.
const gitEnv = { ...process.env, GIT_AUTHOR_NAME: 'Test', GIT_AUTHOR_EMAIL: 'test@example.com', GIT_COMMITTER_NAME: 'Test',
  GIT_COMMITTER_EMAIL: 'test@example.com', GIT_AUTHOR_DATE: '2000-01-01T00:00:00Z', GIT_COMMITTER_DATE: '2000-01-01T00:00:00Z' };

function makeProject() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-test-'));
  for (const [repo, files] of Object.entries(repos)) {
    for (const [f, text] of Object.entries(files)) {
      fs.mkdirSync(path.dirname(path.join(dir, repo, f)), { recursive: true });
      fs.writeFileSync(path.join(dir, repo, f), text);
    }
    const git = (...args: string[]) => execFileSync('git', args, { cwd: path.join(dir, repo), env: gitEnv, stdio: 'ignore' });
    git('init', '-q', '-b', 'main');
    git('add', '-A');
    git('commit', '-q', '-m', 'fixture');
  }
  fs.mkdirSync(path.join(dir, '.atlas'));
  fs.writeFileSync(path.join(dir, '.atlas/atlas.config.json'), JSON.stringify(config));
  fs.writeFileSync(path.join(dir, '.atlas/semantic.mjs'), semantic);
  fs.writeFileSync(path.join(dir, '.atlas/semantic_en.mjs'), semanticEn);
  for (const [f, text] of Object.entries(store)) fs.writeFileSync(path.join(dir, '.atlas', f), text);
  return dir;
}

const run = (script: string, project: string) =>
  execFileSync(process.execPath, [path.join(tool, 'src', script), project], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

test('skeleton and build produce the pinned map for a two-repo project', (t) => {
  const project = makeProject();
  try {
    run('skeleton.ts', project);
    run('build.ts', project);
    const out = path.join(project, '.atlas/out');

    const skeleton = JSON.parse(fs.readFileSync(path.join(out, 'skeleton.json'), 'utf8'));
    delete skeleton.generatedAt;
    t.assert.snapshot(skeleton);

    const context = fs.readFileSync(path.join(out, 'atlas-context.md'), 'utf8').replace(/Generated \S+\./, 'Generated <time>.');
    t.assert.snapshot(context);

    const html = fs.readFileSync(path.join(out, 'atlas.html'), 'utf8');
    const embedded = html.match(/<script id="atlas-data" type="application\/json">(.*?)<\/script>/s);
    assert.ok(embedded, 'page embeds its data');
    const data = JSON.parse(embedded[1]);
    delete data.generatedAt;
    t.assert.snapshot(data);
    assert.ok(html.includes('<title>Atlas · Acme</title>'), 'page is titled after the project');
  } finally {
    fs.rmSync(project, { recursive: true, force: true });
  }
});
