import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeMap } from '../src/merge.ts';
import { moduleHash } from '../src/project.ts';
import type { Desc, Skeleton } from '../src/types.ts';

const files = [{ path: 'src/orders/index.ts', hash: 'aaaa1111', loc: 10 }];
const skeleton: Skeleton = {
  generatedAt: '',
  nodes: [{ id: 'web/src/orders', kind: 'module', name: 'orders', files, loc: 10 }],
  edges: [],
};
const merge = (written: Desc | undefined, stored: Desc | undefined) =>
  mergeMap({
    config: { name: 'Acme', sources: [] },
    skeleton,
    semantic: { desc: written && { 'web/src/orders': written } },
    english: {},
    descriptions: { nodes: stored ? { 'web/src/orders': stored } : {}, files: {} },
    savedFlows: [],
  }).atlas.nodes[0].desc?.biz;

test('a description is shown from whichever source matches the current code', () => {
  const now = moduleHash(files);
  assert.equal(
    merge({ biz: 'written', describedHash: now }, { biz: 'stored', describedHash: now }),
    'written',
  );
  assert.equal(
    merge({ biz: 'written', describedHash: 'old' }, { biz: 'stored', describedHash: now }),
    'stored',
  );
  assert.equal(
    merge({ biz: 'written', describedHash: 'old' }, { biz: 'stored', describedHash: 'old' }),
    'written',
  );
  assert.equal(merge({ biz: 'written' }, { biz: 'stored', describedHash: now }), 'written');
  assert.equal(merge(undefined, undefined), undefined);
});
