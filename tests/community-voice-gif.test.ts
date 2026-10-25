import assert from 'node:assert/strict';
import { test } from 'node:test';
import { encodeGifBody, parseGifBody } from '../lib/community-gif';
import { canJoinVoice, channelKind, clampCapacity, normalizeVoiceName, VOICE_DEFAULT } from '../components/communities/model';
import { DICT_COMMUNITIES } from '../lib/i18n-communities';

const giphy = 'https://media2.giphy.com/media/abc123/giphy.gif';

test('GIF body round-trips for allowed provider hosts', () => {
  const body = encodeGifBody({ url: giphy, width: 480, height: 270, provider: 'giphy' });
  assert.equal(body, `gif:480x270:${giphy}`);
  assert.deepEqual(parseGifBody(body), { url: giphy, width: 480, height: 270, provider: 'giphy' });
  const tenor = 'https://media.tenor.com/xyz/clip.mp4';
  assert.equal(parseGifBody(encodeGifBody({ url: tenor, width: 200, height: 200, provider: 'tenor' }))?.provider, 'tenor');
});

test('encode refuses uploads, disallowed hosts and bad sizes', () => {
  assert.equal(encodeGifBody({ url: 'data:image/gif;base64,R0lGODlh', width: 10, height: 10, provider: 'upload' }), null);
  assert.equal(encodeGifBody({ url: 'https://evil.example/x.gif', width: 10, height: 10, provider: 'giphy' }), null);
  assert.equal(encodeGifBody({ url: 'http://media.giphy.com/x.gif', width: 10, height: 10, provider: 'giphy' }), null);
  assert.equal(encodeGifBody({ url: giphy, width: 0, height: 10, provider: 'giphy' }), null);
  assert.equal(encodeGifBody({ url: giphy, width: 5000, height: 10, provider: 'giphy' }), null);
});

test('parse treats anything not on the allow-list as plain text', () => {
  for (const body of [
    'hello 👋', 'gif:', 'gif:10x10:', `gif:10x10:${giphy} trailing`, `prefix gif:10x10:${giphy}`,
    'gif:10x10:https://media.giphy.com.evil.example/x.gif', 'gif:10x10:https://evilgiphy.com/x.gif',
    'gif:10x10:https://user:pw@media.giphy.com/x.gif', 'gif:10x10:https://media.giphy.com:8443/x.gif',
    'gif:10x10:https://127.0.0.1/x.gif', 'gif:10x10:javascript:alert(1)', 'gif:0x10:' + giphy, 'gif:99999x10:' + giphy,
    `gif:10x10:${giphy}\n<script>`, 'gif:10x10:data:image/gif;base64,R0lGODlh',
  ]) assert.equal(parseGifBody(body), null, body);
  assert.equal(parseGifBody(null), null);
  assert.equal(parseGifBody(42), null);
});

test('voice helpers mirror the SQL rules', () => {
  assert.equal(channelKind({}), 'text');
  assert.equal(channelKind({ kind: 'voice' }), 'voice');
  assert.equal(clampCapacity(1), 2);
  assert.equal(clampCapacity(150), 99);
  assert.equal(clampCapacity('25'), 25);
  assert.equal(clampCapacity('abc'), VOICE_DEFAULT);
  assert.equal(canJoinVoice('open', 'member'), true);
  assert.equal(canJoinVoice('open', null), false);
  assert.equal(canJoinVoice('closed', 'member'), false);
  assert.equal(canJoinVoice('closed', 'moderator'), true);
  assert.equal(canJoinVoice('closed', 'editor'), true);
  assert.equal(canJoinVoice('closed', 'owner'), true);
  assert.equal(normalizeVoiceName('  Main   lounge '), 'Main lounge');
});

test('voice/GIF strings are translated into all seven languages', () => {
  for (const k of ['Voice channels', 'Join call', 'Voice calls are not available yet — the channel and its settings are saved.', 'Max participants', 'Open channel', 'Closed channel']) {
    const row = DICT_COMMUNITIES[k];
    assert.ok(row && row.length === 7 && row.every(x => x.trim()), k);
  }
});
