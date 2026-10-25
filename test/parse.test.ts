import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseChatRequest, parseConfig, parseDescription, parseFlow } from '../src/parse.ts';

test('a chat request passes through; a bad language is refused by name', () => {
  const ok = { message: 'hi', session: null, lang: 'pt', about: 'module web/api/orders' };
  assert.deepEqual(parseChatRequest(ok), ok);
  assert.throws(() => parseChatRequest({ ...ok, lang: 'fr' }), /lang: expected one of en, pt/);
  assert.throws(() => parseChatRequest('hi'), /chat request: expected an object/);
});

test('a flow keeps its fields; a step without text is refused with its position', () => {
  const flow = {
    id: 'checkout',
    name: 'Comprar',
    confidence: 'verified',
    steps: [{ unit: 'web/api/orders', text: 'Recebe.', anchor: null }],
  };
  assert.equal(JSON.stringify(parseFlow(flow)), JSON.stringify(flow));
  assert.throws(() => parseFlow({ ...flow, steps: [{ unit: 'x', anchor: null }] }), /flow\.steps\[0\]\.text/);
});

test('config: unknown keys are ignored, a source without rules is refused', () => {
  const config = { name: 'Acme', languages: ['en'], sources: [{ id: 'web', dir: 'web', modules: [] }] };
  assert.equal(parseConfig(config).name, 'Acme');
  assert.throws(
    () => parseConfig({ name: 'Acme', sources: [{ id: 'web', dir: 'web' }] }),
    /sources\[0\]\.modules: expected an array/,
  );
});

test("the agent's description may omit the module; files default to none", () => {
  assert.deepEqual(parseDescription({}), { module: undefined, files: {} });
  const got = parseDescription({ files: { 'a.ts': { biz_en: 'Adds.', tech_pt: 'Soma.' } } });
  assert.equal(got.files['a.ts'].biz_en, 'Adds.');
  assert.throws(() => parseDescription({ files: { 'a.ts': { biz_en: 3 } } }), /files\.a\.ts\.biz_en/);
});
