// Where a project's map lives on disk, and the few reads every script shares.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import type { FileEntry } from './types.ts';

export function atlasPaths(project: string) {
  const store = path.join(project, '.atlas');
  const out = path.join(store, 'out');
  return {
    store,
    out,
    config: path.join(store, 'atlas.config.json'),
    descriptions: path.join(store, 'descriptions.local.json'),
    flows: path.join(store, 'flows.local.json'),
    skeleton: path.join(out, 'skeleton.json'),
    page: path.join(out, 'atlas.html'),
    context: path.join(out, 'atlas-context.md'),
  };
}

export const readJson = (file: string): unknown => JSON.parse(fs.readFileSync(file, 'utf8'));

/** For files the agent writes over time: absent means empty. */
export const readJsonOr = <T>(file: string, empty: T): T =>
  fs.existsSync(file) ? (readJson(file) as T) : empty;

export const sha8 = (text: string) => crypto.createHash('sha1').update(text).digest('hex').slice(0, 8);

/** A module's hash is the hash of its files' hashes, so any edit to any file changes it. */
export const moduleHash = (files: FileEntry[]) => sha8(files.map((f) => f.hash).join(''));
