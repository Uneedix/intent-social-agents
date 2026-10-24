import assert from 'node:assert/strict';
import { test } from 'node:test';
import { blockedPushes } from '../scripts/check-push.mjs';

test('pre-push blocks main even when the local branch has a different name', () => {
  assert.equal(blockedPushes('refs/heads/feature abc refs/heads/main def\n').length, 1);
  assert.equal(blockedPushes('(delete) 000 refs/heads/main def\n').length, 1);
  assert.equal(blockedPushes('refs/heads/main abc refs/heads/feature def\n').length, 0);
  assert.equal(blockedPushes('refs/heads/feature abc refs/heads/feature def\n').length, 0);
});
