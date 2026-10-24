import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { resolve } from 'node:path';

const allowed = 'lrhsncjjwamdgqafzgpj.supabase.co';
const networkTrap = 'data:text/javascript,' + encodeURIComponent(`
  globalThis.fetch = async () => { process.stderr.write('UNEXPECTED_NETWORK'); throw new Error('Network forbidden in configuration tests'); };
`);

function invoke(url: string, args: string[] = [], configured = true) {
  return spawnSync(process.execPath, ['--import', networkTrap, resolve('scripts/test-hosted-preview.mjs'), ...args], {
    encoding: 'utf8', timeout: 5000,
    env: {
      ...process.env,
      SUPABASE_PREVIEW_TEST_URL: url,
      SUPABASE_PREVIEW_TEST_PUBLISHABLE_KEY: configured ? 'public-test-placeholder' : '',
      SUPABASE_PREVIEW_TEST_SECRET_KEY: configured ? 'private-test-placeholder' : '',
    },
  });
}

test('hosted preview help is credential-free and never connects', () => {
  const result = invoke('', ['--help'], false);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /Opt-in hosted Supabase preview/);
  assert.equal(result.stderr.includes('UNEXPECTED_NETWORK'), false);
});

test('hosted preview requires explicit environment and has no target override arguments', () => {
  const missing = invoke('', [], false);
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /Required preview test environment variables are missing/);
  const argument = invoke(`https://${allowed}`, ['--project', 'other']);
  assert.equal(argument.status, 1);
  assert.match(argument.stderr, /Unsupported arguments/);
  assert.equal((missing.stderr + argument.stderr).includes('UNEXPECTED_NETWORK'), false);
});

test('hosted preview rejects other projects and URL credential/path tricks before fetch', () => {
  for (const url of [
    'https://other-project.supabase.co',
    `http://${allowed}`,
    `https://${allowed}.example.com`,
    `https://attacker@${allowed}`,
    `https://${allowed}:8443`,
    `https://${allowed}/rest/v1`,
    `https://${allowed}?project=other`,
    `https://${allowed}#other`,
  ]) {
    const result = invoke(url);
    assert.equal(result.status, 1, url);
    assert.match(result.stderr, /Preview target rejected by hard allowlist/);
    assert.equal(result.stderr.includes('UNEXPECTED_NETWORK'), false, url);
    assert.equal(result.stdout.includes('Preview test run'), false, 'no run or fixture creation started');
  }
});
