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
    'src/lib/stock.ts': `const base = process.env.WAREHOUSE_URL;\nexport const left = (sku: string) => fetch(\`\${base}/stock/\${sku}\`);\nexport const post = () => fetch('https://ledger.example.com/entries');\n`,
    'src/ui/button.tsx': `export const Button = 'button';\n`,
    'src/ui/button.test.tsx': `throw new Error('tests are skipped');\n`,
  },
  billing: {
    'package.json': JSON.stringify({
      name: '@acme/billing',
      exports: { '.': './src/index.ts', './invoices': './src/invoices/index.ts' },
    }),
    'src/index.ts': `export * from './invoices';\nexport { total } from './tax';\n`,
    'src/tax.ts': `export const total = (n: number) => n * 1.2;\n`,
    'src/invoices/index.ts': `import { total } from '../tax';\nimport { render } from './pdf';\nexport const invoice = (n: number) => render(total(n));\n`,
    'src/invoices/pdf.ts': `export const render = (n: number) => String(n);\n`,
    'src/payouts.ts': `import Stripe from 'stripe';\nconst stripe = new Stripe(process.env.STRIPE_KEY ?? '');\nexport const pay = (cents: number) => stripe.payouts.create({ amount: cents, currency: 'usd' });\n`,
  },
};

const config = {
  name: 'Acme',
  language: 'en',
  languages: ['en', 'pt'],
  sources: [
    {
      id: 'web',
      dir: 'web',
      color: '#3b9ae8',
      aliases: { '@/': 'src/' },
      modules: [
        { match: '^src/app/api/([^/]+)/', area: 'api', module: '$1' },
        { match: '^src/app/page\\.tsx$', area: 'pages', module: 'home' },
        { match: '^src/(lib|ui)/([^/.]+)', area: '$1', module: '$2' },
      ],
    },
    {
      id: 'billing',
      dir: 'billing',
      name: 'billing-service',
      role: 'legacy',
      modules: [{ match: '^src/([^/.]+)', area: 'core', areaName: '@acme/billing', module: '$1' }],
    },
  ],
  externals: [
    { id: 'stripe', name: 'Stripe', kind: 'payments', packages: ['stripe'] },
    { id: 'warehouse', name: 'Warehouse API', kind: 'api', env: ['WAREHOUSE_'] },
    { id: 'ledger', name: 'Ledger', kind: 'api', code: ['ledger\\.example\\.com'] },
    { id: 'mail', name: 'Mail', kind: 'email', packages: ['@acme-mail/*'] },
  ],
  chat: { suggestions: { en: ['How does checkout work?'] } },
};

const semantic = {
  system: { biz: 'Uma loja.', biz_en: 'A shop.', tech: 'Um app web e um serviço de cobrança.' },
  caps: [
    {
      id: 'buy',
      name: 'Comprar',
      name_en: 'Buying',
      biz: 'Pôr coisas no carrinho e pagar.',
      biz_en: 'Put things in the cart and pay.',
      rules: ['^web/'],
    },
    { id: 'bill', name: 'Cobrar', rules: ['^billing/'] },
  ],
  desc: {
    'web/api/orders': {
      biz: 'Recebe pedidos.',
      biz_en: 'Takes orders.',
      tech: 'POST que chama a cobrança.',
      confidence: 'verified',
      anchors: [
        {
          path: 'web/src/app/api/orders/route.ts',
          line: 3,
          note: 'cria a fatura',
          note_en: 'creates the invoice',
        },
      ],
    },
    'billing/core/invoices': {
      tech: 'Gera faturas.',
      confidence: 'verified',
      anchors: [{ path: 'billing/src/invoices/index.ts', line: 3, note: 'invoice' }],
      describedHash: 'deadbeef',
    },
  },
  legacy: { extracted: { label: 'já extraído', label_en: 'extracted', note: 'Foi para outro lugar.' } },
  legacyStatus: { 'billing/core/tax': 'extracted' },
  decisions: [{ id: '0001', name: 'Cobrança separada', path: 'docs/0001.md', units: ['billing/core/index'] }],
  concepts: [{ id: 'order', name: 'Pedido', owner: ['web/api/orders'], writes: [], reads: ['web/lib/cart'] }],
  flows: [
    {
      id: 'checkout',
      name: 'Finalizar compra',
      name_en: 'Checkout',
      confidence: 'verified',
      steps: [
        {
          unit: 'web/api/orders',
          text: 'Recebe o pedido.',
          text_en: 'Takes the order.',
          anchor: 'web/src/app/api/orders/route.ts:3',
        },
        {
          unit: 'billing/core/invoices',
          text: 'Gera a fatura.',
          text_en: 'Makes the invoice.',
          anchor: 'billing/src/invoices/index.ts:3',
        },
      ],
    },
  ],
};
const store = {
  'descriptions.local.json': JSON.stringify({
    nodes: {
      'web/lib/cart': {
        biz: 'O carrinho.',
        biz_en: 'The cart.',
        confidence: 'generated',
        describedHash: 'stale000',
      },
    },
    files: {
      'web/src/lib/cart.ts': { tech_en: 'Adds an item.', confidence: 'generated', describedHash: 'x' },
    },
  }),
  'flows.local.json': JSON.stringify([
    {
      id: 'browse',
      name: 'Navegar',
      name_en: 'Browse',
      confidence: 'verified',
      steps: [
        {
          unit: 'web/pages/home',
          text: 'Abre a home.',
          text_en: 'Opens home.',
          anchor: 'web/src/app/page.tsx:1',
        },
        { unit: 'web/gone/module', text: 'Sumiu.', anchor: 'web/src/gone.ts:1' },
      ],
    },
  ]),
};

const gitEnv = {
  ...process.env,
  GIT_AUTHOR_NAME: 'Test',
  GIT_AUTHOR_EMAIL: 'test@example.com',
  GIT_COMMITTER_NAME: 'Test',
  GIT_COMMITTER_EMAIL: 'test@example.com',
  GIT_AUTHOR_DATE: '2000-01-01T00:00:00Z',
  GIT_COMMITTER_DATE: '2000-01-01T00:00:00Z',
};

function makeProject() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-test-'));
  for (const [repo, files] of Object.entries(repos)) {
    for (const [f, text] of Object.entries(files)) {
      fs.mkdirSync(path.dirname(path.join(dir, repo, f)), { recursive: true });
      fs.writeFileSync(path.join(dir, repo, f), text);
    }
    const git = (...args: string[]) =>
      execFileSync('git', args, { cwd: path.join(dir, repo), env: gitEnv, stdio: 'ignore' });
    git('init', '-q', '-b', 'main');
    git('add', '-A');
    git('commit', '-q', '-m', 'fixture');
  }
  fs.mkdirSync(path.join(dir, '.atlas'));
  fs.writeFileSync(path.join(dir, '.atlas/atlas.config.json'), JSON.stringify(config));
  fs.writeFileSync(path.join(dir, '.atlas/semantic.json'), JSON.stringify(semantic));
  for (const [f, text] of Object.entries(store)) fs.writeFileSync(path.join(dir, '.atlas', f), text);
  return dir;
}

const run = (script: string, project: string) =>
  execFileSync(process.execPath, [path.join(tool, 'src', script), project], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

test('skeleton and build produce the pinned map for a two-repo project', (t) => {
  const project = makeProject();
  try {
    run('skeleton.ts', project);
    run('build.ts', project);
    const out = path.join(project, '.atlas/out');

    const skeleton = JSON.parse(fs.readFileSync(path.join(out, 'skeleton.json'), 'utf8'));
    delete skeleton.generatedAt;
    t.assert.snapshot(skeleton);

    const context = fs
      .readFileSync(path.join(out, 'atlas-context.md'), 'utf8')
      .replace(/Generated \S+\./, 'Generated <time>.');
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
