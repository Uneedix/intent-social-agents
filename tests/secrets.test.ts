import assert from 'node:assert/strict';
import { test } from 'node:test';
import { scanText } from '../scripts/scan-secrets.mjs';

const fakeJwt = (role: string) => [
  Buffer.from(JSON.stringify({ alg: 'HS256' })).toString('base64url'),
  Buffer.from(JSON.stringify({ role })).toString('base64url'),
  'synthetic-signature',
].join('.');

test('scanner detects provider secrets and private keys without logging their values', () => {
  const samples = [
    ['github-token', 'gh' + 'p_' + 'a'.repeat(36)],
    ['supabase-secret-key', 'sb_' + 'secret_' + 'x'.repeat(30)],
    ['aws-access-key', 'AK' + 'IA' + 'A'.repeat(16)],
    ['private-key', '-----BEGIN ' + 'PRIVATE KEY-----'],
    ['stripe-secret-key', 'sk_' + 'live_' + 'x'.repeat(24)],
    ['credential-assignment', 'VERCEL_TOKEN=' + 'x'.repeat(30)],
    ['supabase-service-role-jwt', fakeJwt('service_role')],
  ];
  for (const [rule, value] of samples) {
    const result = scanText('safe line\n' + value, 'fixture.txt');
    assert.equal(result.some(item => item.rule === rule && item.line === 2), true, rule);
    assert.equal(JSON.stringify(result).includes(value), false, 'secret must not appear in finding');
  }
});

test('scanner allows public anon credentials and explicit setup placeholders', () => {
  assert.deepEqual(scanText([
    fakeJwt('anon'),
    'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_YOUR_KEY',
    'SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVICE_ROLE_KEY_HERE',
  ].join('\n'), '.env.example'), []);
});
