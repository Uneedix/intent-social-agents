import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assertPreviewBuild } from '../scripts/assert-preview.mjs';

test('deployment build guard permits local builds and explicit Vercel previews only', () => {
  assert.doesNotThrow(() => assertPreviewBuild({}));
  assert.doesNotThrow(() => assertPreviewBuild({ VERCEL: '1', VERCEL_ENV: 'preview', VERCEL_TARGET_ENV: 'preview' }));
  assert.doesNotThrow(() => assertPreviewBuild({ VERCEL: '1', VERCEL_ENV: 'preview' }));
  for (const env of [
    { VERCEL: '1' },
    { VERCEL: '1', VERCEL_ENV: 'production' },
    { VERCEL: '1', VERCEL_ENV: 'production', VERCEL_TARGET_ENV: 'preview' },
    { VERCEL: '1', VERCEL_ENV: 'preview', VERCEL_TARGET_ENV: 'production' },
    { VERCEL: '1', VERCEL_ENV: 'preview', VERCEL_TARGET_ENV: 'staging' },
  ]) assert.throws(() => assertPreviewBuild(env), /only Vercel preview builds are approved/);
});
