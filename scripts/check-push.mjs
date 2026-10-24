import { readFileSync } from 'node:fs';

/** Git pre-push input: local-ref local-sha remote-ref remote-sha. */
export function blockedPushes(input) {
  return input.split(/\r?\n/).filter(Boolean).filter(line => line.trim().split(/\s+/)[2] === 'refs/heads/main');
}

if (process.argv[1] && /[\\/]check-push\.mjs$/.test(process.argv[1])) {
  if (blockedPushes(readFileSync(0, 'utf8')).length) {
    console.error('INTENT: direct pushes/deletions to main are blocked. Publish a feature branch and open a PR.');
    process.exitCode = 1;
  }
}
