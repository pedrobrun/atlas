import fs from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseChatRequest, parseConfig, parseDescription, parseFlow, parseSemantic } from '../src/parse.ts';

test('a chat request passes through; a bad language is refused by name', () => {
  const ok = { message: 'hi', session: null, lang: 'pt', about: 'module web/api/orders' };
  assert.deepEqual(parseChatRequest(ok), ok);
  assert.throws(() => parseChatRequest({ ...ok, lang: 'fr' }), /lang: expected one of en, pt/);
  assert.throws(() => parseChatRequest('hi'), /chat request: expected an object/);
});

test('a flow keeps its fields; a step without text or anchor is refused with its position', () => {
  const step = { unit: 'web/api/orders', text: 'Recebe.', anchor: 'web/src/orders.ts:3' };
  const flow = { id: 'checkout', name: 'Comprar', confidence: 'verified', steps: [step] };
  assert.equal(JSON.stringify(parseFlow(flow)), JSON.stringify(flow));
  assert.throws(
    () => parseFlow({ ...flow, steps: [{ unit: 'x', anchor: 'a.ts:1' }] }),
    /flow\.steps\[0\]\.text/,
  );
  assert.throws(() => parseFlow({ ...flow, steps: [{ ...step, anchor: null }] }), /flow\.steps\[0\]\.anchor/);
  assert.throws(() => parseFlow({ ...flow, confidence: 'inferred' }), /flow\.confidence/);
});

test('a written description must point at the code that proves it', () => {
  const anchors = [{ path: 'web/src/orders.ts', line: 3, note: 'POST' }];
  assert.ok(parseSemantic({ desc: { 'web/api/orders': { biz: 'Takes orders.', anchors } } }).desc);
  assert.throws(
    () => parseSemantic({ desc: { 'web/api/orders': { biz: 'Takes orders.' } } }),
    /desc\.web\/api\/orders\.anchors/,
  );
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

test('the semantic.json example the skill teaches is valid', () => {
  const doc = fs.readFileSync(new URL('../skills/atlas/semantic-format.md', import.meta.url), 'utf8');
  const example = doc.match(/```json\n([\s\S]*?)```/)?.[1] ?? '';
  const semantic = parseSemantic(JSON.parse(example));
  assert.ok(semantic.caps?.[0].rules[0] instanceof RegExp);
  const stamped = parseSemantic({
    desc: {
      'web/api/orders': {
        biz: 'Takes orders.',
        anchors: [{ path: 'web/src/orders.ts', line: 3, note: 'POST' }],
        describedHash: 'abcd1234',
      },
    },
  });
  assert.equal(stamped.desc?.['web/api/orders'].describedHash, 'abcd1234');
  assert.throws(
    () => parseSemantic({ caps: [{ id: 'x', name: 'X', rules: ['('] }] }),
    /caps\[0\]\.rules\[0\]/,
  );
});
