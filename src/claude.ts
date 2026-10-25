import { spawn } from 'node:child_process';

export const CHILD = 'ATLAS_CHILD';

export const runClaude = (project: string, args: string[]) =>
  spawn('claude', [...args, '--settings', JSON.stringify({ disableAllHooks: true })], {
    cwd: project,
    env: { ...process.env, [CHILD]: '1', CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
