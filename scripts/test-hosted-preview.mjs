import { randomBytes, randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const ALLOWED_HOST = 'lrhsncjjwamdgqafzgpj.supabase.co';
const HELP = `Opt-in hosted Supabase preview integration tests.
Target: https://${ALLOWED_HOST} (hard allowlist; all other targets rejected).

Required environment variables (provide privately; never commit them):
  SUPABASE_PREVIEW_TEST_URL
  SUPABASE_PREVIEW_TEST_PUBLISHABLE_KEY
  SUPABASE_PREVIEW_TEST_SECRET_KEY

Run: node scripts/test-hosted-preview.mjs
Help: node scripts/test-hosted-preview.mjs --help

Creates exactly three temporary, email-confirmed Auth users without sending emails.
Exercises authenticated HTTP requests and RLS, then deletes only users created by
this run in finally. Their test communities/messages are removed by FK cascades.
No migrations, project settings, key discovery, deployment or production actions.
Not part of default CI. An interrupted process may need run-specific cleanup.
`;

class TestFailure extends Error {
  constructor(label) { super(label); this.name = 'TestFailure'; }
}

function safeMetadata(result) {
  const code = result?.error?.code;
  const status = result?.status ?? result?.error?.status;
  const parts = [];
  if (typeof code === 'string' && /^[A-Z0-9_]{1,16}$/.test(code)) parts.push(`code=${code}`);
  if (Number.isInteger(status) && status >= 100 && status <= 599) parts.push(`status=${status}`);
  return parts.length ? ` [${parts.join(' ')}]` : '';
}

function requireTrue(condition, label, result) {
  if (!condition) throw new TestFailure(label + safeMetadata(result));
}

function configuration() {
  const url = process.env.SUPABASE_PREVIEW_TEST_URL;
  const publishableKey = process.env.SUPABASE_PREVIEW_TEST_PUBLISHABLE_KEY;
  const secretKey = process.env.SUPABASE_PREVIEW_TEST_SECRET_KEY;
  requireTrue(!!url && !!publishableKey && !!secretKey, 'Required preview test environment variables are missing');
  let parsed;
  try { parsed = new URL(url); } catch { throw new TestFailure('Invalid preview test URL'); }
  requireTrue(parsed.protocol === 'https:' && parsed.hostname === ALLOWED_HOST &&
    !parsed.port && !parsed.username && !parsed.password && parsed.pathname === '/' &&
    !parsed.search && !parsed.hash, 'Preview target rejected by hard allowlist');
  requireTrue(publishableKey !== secretKey, 'Publishable and privileged keys must differ');
  return { url: parsed.origin, publishableKey, secretKey };
}

// Bound every SDK request, refuse redirected requests, and never log request headers.
function previewFetch(input, init = {}) {
  const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
  if (url.protocol !== 'https:' || url.hostname !== ALLOWED_HOST || url.port || url.username || url.password) {
    return Promise.reject(new TestFailure('SDK request rejected by hard allowlist'));
  }
  const timeout = AbortSignal.timeout(20_000);
  const signal = init.signal ? AbortSignal.any([init.signal, timeout]) : timeout;
  return fetch(input, { ...init, signal, redirect: 'error' });
}

function client(url, key) {
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: previewFetch },
  });
}

async function response(label, operation) {
  try { return await operation(); } catch { throw new TestFailure(label); }
}

async function ok(label, operation) {
  const result = await response(label, operation);
  requireTrue(!result.error, label, result);
  console.log(`PASS ${label}`);
  return result.data;
}

async function denied(label, operation, allowedCodes = ['42501']) {
  const result = await response(label, operation);
  // A network/auth/schema failure is not proof that the authorization rule worked.
  requireTrue(!!result.error && allowedCodes.includes(result.error.code), label, result);
  console.log(`PASS ${label}`);
}

async function empty(label, operation) {
  const result = await response(label, operation);
  requireTrue(!result.error && Array.isArray(result.data) && result.data.length === 0, label, result);
  console.log(`PASS ${label}`);
}

async function rows(label, operation, predicate) {
  const result = await response(label, operation);
  requireTrue(!result.error && predicate(result.data), label, result);
  console.log(`PASS ${label}`);
  return result.data;
}

async function run(config) {
  const runId = randomUUID();
  const admin = client(config.url, config.secretKey);
  const anon = client(config.url, config.publishableKey);
  const createdUsers = [];
  const signedInClients = [];
  const communityIds = [];
  const groupIds = [];
  let failed = false;
  let cleanupFailed = false;
  console.log(`Preview test run ${runId}; target ${ALLOWED_HOST}`);
  try {
    const accounts = {};
    for (const role of ['owner', 'member', 'outsider']) {
      const email = `intent-preview-${runId}-${role}@example.com`;
      const password = `${randomBytes(36).toString('base64url')}aA1!`;
      const created = await response(`Create temporary ${role} account`, () => admin.auth.admin.createUser({
        email, password, email_confirm: true,
        app_metadata: { intent_preview_test_run: runId },
      }));
      // Record the returned identity before any further assertion or network request.
      if (!created.error && created.data?.user?.id) createdUsers.push(created.data.user.id);
      requireTrue(!created.error && !!created.data?.user?.id, `Create temporary ${role} account`, created);
      const userClient = client(config.url, config.publishableKey);
      const signedIn = await response(`Sign in temporary ${role}`, () => userClient.auth.signInWithPassword({ email, password }));
      signedInClients.push(userClient);
      requireTrue(!signedIn.error && signedIn.data?.user?.id === created.data.user.id && !!signedIn.data.session, `Sign in temporary ${role}`, signedIn);
      await rows(`Verify authenticated ${role} identity`, () => userClient.auth.getUser(), data => data?.user?.id === created.data.user.id);
      accounts[role] = { id: created.data.user.id, db: userClient };
    }
    requireTrue(createdUsers.length === 3 && new Set(createdUsers).size === 3, 'Exactly three distinct temporary accounts created');
    const { owner, member, outsider } = accounts;
    const communities = {};
    for (const privacy of ['public', 'request', 'private']) {
      const data = await rows(`Owner creates ${privacy} community`, () => owner.db.from('communities').insert({
        owner_id: owner.id, name: `Preview ${privacy} ${runId}`, description: `Ephemeral test ${runId}`,
        privacy, channels_enabled: true, posting_permission: privacy === 'public' ? 'members' : 'staff',
      }).select('id').single(), data => typeof data?.id === 'string');
      communityIds.push(data.id);
      communities[privacy] = data.id;
      await rows(`Owner role trigger for ${privacy} community`, () => owner.db.from('community_members')
        .select('user_id,role').eq('community_id', data.id).eq('user_id', owner.id), data => data?.length === 1 && data[0].role === 'owner');
    }
    await rows('Anonymous can read public community', () => anon.from('communities').select('id').eq('id', communities.public), data => data?.length === 1);
    await empty('Anonymous cannot read private community', () => anon.from('communities').select('id').eq('id', communities.private));
    await ok('Member joins public community', () => member.db.from('community_members').insert({ community_id: communities.public, user_id: member.id, role: 'member' }));
    await denied('Outsider cannot self-assign owner role', () => outsider.db.from('community_members').insert({ community_id: communities.public, user_id: outsider.id, role: 'owner' }));
    await denied('Member cannot join private community directly', () => member.db.from('community_members').insert({ community_id: communities.private, user_id: member.id, role: 'member' }));
    await denied('Member cannot join request community directly', () => member.db.from('community_members').insert({ community_id: communities.request, user_id: member.id, role: 'member' }));
    for (const attempt of ['initial', 'repeat']) {
      await ok(`Member submits ${attempt} pending join request`, () => member.db.from('community_join_requests').upsert({
        community_id: communities.request, user_id: member.id, status: 'pending',
      }, { onConflict: 'community_id,user_id' }));
    }
    await denied('Applicant cannot approve own request', () => member.db.from('community_join_requests').update({ status: 'approved' })
      .eq('community_id', communities.request).eq('user_id', member.id));
    await denied('Outsider cannot approve another request', () => outsider.db.rpc('intent_approve_request', { cid: communities.request, applicant: member.id }), ['P0001']);
    await ok('Owner approves pending member request', () => owner.db.rpc('intent_approve_request', { cid: communities.request, applicant: member.id }));
    await rows('Approved request creates membership', () => member.db.from('community_members').select('user_id,role')
      .eq('community_id', communities.request).eq('user_id', member.id), data => data?.length === 1 && data[0].role === 'member');
    await rows('Approved request status persists', () => member.db.from('community_join_requests').select('status')
      .eq('community_id', communities.request).eq('user_id', member.id), data => data?.length === 1 && data[0].status === 'approved');
    await ok('Public member can publish post', () => member.db.from('community_posts').insert({ community_id: communities.public, author_id: member.id, body: 'Public member fixture' }));
    await denied('Regular member cannot publish staff-only post', () => member.db.from('community_posts').insert({ community_id: communities.request, author_id: member.id, body: 'Forbidden staff fixture' }));
    await denied('Nonmember cannot publish public community post', () => outsider.db.from('community_posts').insert({ community_id: communities.public, author_id: outsider.id, body: 'Forbidden outsider fixture' }));
    await ok('Owner can publish staff-only post', () => owner.db.from('community_posts').insert({ community_id: communities.request, author_id: owner.id, body: 'Staff fixture' }));
    await ok('Owner can publish private community post', () => owner.db.from('community_posts').insert({ community_id: communities.private, author_id: owner.id, body: 'Private fixture' }));
    await empty('Outsider cannot read private community', () => outsider.db.from('communities').select('id').eq('id', communities.private));
    await empty('Outsider cannot read private posts', () => outsider.db.from('community_posts').select('id').eq('community_id', communities.private));
    await empty('Outsider cannot read private member roster', () => outsider.db.from('community_members').select('user_id').eq('community_id', communities.private));
    const channel = await rows('Owner creates private channel', () => owner.db.from('community_channels').insert({ community_id: communities.private, name: 'Preview fixture' }).select('id').single(), data => typeof data?.id === 'string');
    await ok('Owner sends private channel message', () => owner.db.from('community_messages').insert({ channel_id: channel.id, author_id: owner.id, body: 'Private channel fixture' }));
    await empty('Outsider cannot read private channel messages', () => outsider.db.from('community_messages').select('id').eq('channel_id', channel.id));
    await denied('Outsider cannot send private channel message', () => outsider.db.from('community_messages').insert({ channel_id: channel.id, author_id: outsider.id, body: 'Forbidden channel fixture' }));
    const groupId = await rows('Owner creates group through RPC', () => owner.db.rpc('create_message_group', { p_title: `Preview ${runId}`, p_description: 'Ephemeral hosted test' }), data => typeof data === 'string');
    groupIds.push(groupId);
    await rows('Group RPC creates owner membership', () => owner.db.from('message_group_members').select('user_id,role')
      .eq('group_id', groupId).eq('user_id', owner.id), data => data?.length === 1 && data[0].role === 'owner');
    await empty('Uninvited member cannot read group', () => member.db.from('message_groups').select('id').eq('id', groupId));
    await denied('Outsider cannot add group participant', () => outsider.db.rpc('add_message_group_member', { p_group_id: groupId, p_user_id: outsider.id }), ['P0001']);
    await ok('Owner adds group member through RPC', () => owner.db.rpc('add_message_group_member', { p_group_id: groupId, p_user_id: member.id }));
    await rows('Invited member can read group', () => member.db.from('message_groups').select('id').eq('id', groupId), data => data?.length === 1);
    await ok('Group member sends message', () => member.db.from('message_group_messages').insert({ group_id: groupId, body: 'Member group fixture' }));
    await rows('Owner reads member group message', () => owner.db.from('message_group_messages').select('sender_id,body').eq('group_id', groupId), data => data?.length === 1 && data[0].sender_id === member.id);
    await denied('Member cannot spoof group sender', () => member.db.from('message_group_messages').insert({ group_id: groupId, sender_id: owner.id, body: 'Forbidden spoof fixture' }));
    await denied('Member cannot invite outsider', () => member.db.rpc('add_message_group_member', { p_group_id: groupId, p_user_id: outsider.id }), ['P0001']);
    await empty('Outsider cannot read group', () => outsider.db.from('message_groups').select('id').eq('id', groupId));
    await empty('Outsider cannot read group roster', () => outsider.db.from('message_group_members').select('user_id').eq('group_id', groupId));
    await empty('Outsider cannot read group messages', () => outsider.db.from('message_group_messages').select('id').eq('group_id', groupId));
    await denied('Outsider cannot send group message', () => outsider.db.from('message_group_messages').insert({ group_id: groupId, body: 'Forbidden outsider group fixture' }));
    console.log('PASS hosted Auth, Communities and group permissions');
  } catch (error) {
    failed = true;
    console.error(`FAIL ${error instanceof TestFailure ? error.message : 'Hosted preview request or assertion failed'}`);
  } finally {
    // No enumerate/list/delete-by-query APIs: only IDs returned by this run's createUser.
    for (const userClient of signedInClients) {
      try { await userClient.auth.signOut({ scope: 'local' }); } catch { /* Account deletion below remains mandatory. */ }
    }
    for (const id of [...createdUsers].reverse()) {
      try {
        const result = await admin.auth.admin.deleteUser(id);
        if (result.error) cleanupFailed = true;
      } catch { cleanupFailed = true; }
    }
    // Read-only verification that owning-user FK cascades removed this run's fixtures.
    for (const [table, ids] of [['communities', communityIds], ['message_groups', groupIds]]) {
      if (!ids.length) continue;
      try {
        const result = await admin.from(table).select('id').in('id', ids);
        if (result.error || result.data?.length !== 0) cleanupFailed = true;
      } catch { cleanupFailed = true; }
    }
    console.log(`${cleanupFailed ? 'FAIL' : 'PASS'} cleanup of ${createdUsers.length} run-owned temporary accounts and cascaded fixtures; run ${runId}`);
  }
  if (failed || cleanupFailed) process.exitCode = 1;
}

async function main() {
  if (process.argv.length === 3 && process.argv[2] === '--help') { console.log(HELP); return; }
  requireTrue(process.argv.length === 2, 'Unsupported arguments; use --help');
  const config = configuration(); // Validate everything before any outbound request.
  await run(config);
}

void main().catch(error => {
  console.error(`FAIL ${error instanceof TestFailure ? error.message : 'Preview test initialization failed'}`);
  process.exitCode = 1;
});
