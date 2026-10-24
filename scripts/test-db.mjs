import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';

// Entirely in-memory PostgreSQL. This never connects to the configured Supabase project.
// Only Supabase's auth identity contract is emulated; hosted auth/PostgREST need E2E tests.
const root = new URL('../', import.meta.url);
const db = new PGlite();

async function verifyMigrationIntegrity() {
  const base = new URL('supabase/', root);
  const manifest = JSON.parse(await readFile(new URL('migration-manifest.json', base), 'utf8'));
  if (manifest.formatVersion !== 1 || !Array.isArray(manifest.mappings) || !manifest.mappings.length) throw new Error('Invalid migration manifest');
  const names = (await readdir(new URL('migrations/', base))).filter(name => name.endsWith('.sql'));
  const versions = new Set();
  for (const name of names) {
    const match = /^(\d{14})_.+\.sql$/.exec(name);
    if (!match || versions.has(match[1])) throw new Error(`Invalid or duplicate migration version: ${name}`);
    versions.add(match[1]);
  }
  const mappedPaths = new Set();
  for (const entry of manifest.mappings) {
    for (const field of ['legacy', 'canonical']) {
      const relative = entry[field];
      if (typeof relative !== 'string' || !/^(?:legacy-migrations|migrations)\/[\w.-]+\.sql$/.test(relative) || mappedPaths.has(relative)) throw new Error('Invalid migration mapping path');
      mappedPaths.add(relative);
      const digest = createHash('sha256').update(await readFile(new URL(relative, base))).digest('hex');
      if (digest !== entry.sha256) throw new Error(`Migration integrity mismatch: ${relative}`);
    }
  }
  console.log(`PASS migration manifest (${manifest.mappings.length} legacy mappings, ${names.length} canonical migrations)`);
}

async function runSqlFile(path) {
  let pending = '';
  try {
    for (const line of (await readFile(path, 'utf8')).split(/\r?\n/)) {
      if (/^\\set ON_ERROR_STOP on\s*$/.test(line)) continue;
      const include = /^\\ir (.+)\s*$/.exec(line);
      if (include) {
        if (pending.trim()) await db.exec(pending);
        pending = '';
        const target = new URL(include[1].trim(), path);
        if (!target.href.startsWith(new URL('supabase/', root).href)) throw new Error('SQL include escapes supabase directory');
        await runSqlFile(target);
      } else if (/^\\echo\b/.test(line)) {
        if (pending.trim()) await db.exec(pending);
        pending = '';
        console.log(line.slice(6));
      } else {
        if (/^\\/.test(line)) throw new Error(`Unsupported psql directive: ${line}`);
        pending += `${line}\n`;
      }
    }
    if (pending.trim()) await db.exec(pending);
    console.log(`PASS ${fileURLToPath(path)}`);
  } catch (error) {
    throw new Error(`SQL failed: ${fileURLToPath(path)}`, { cause: error });
  }
}

try {
  await verifyMigrationIntegrity();
  await db.exec(`
    CREATE ROLE anon NOLOGIN;
    CREATE ROLE authenticated NOLOGIN;
    CREATE ROLE service_role NOLOGIN BYPASSRLS;
    CREATE SCHEMA auth;
    CREATE TABLE auth.users (id uuid PRIMARY KEY, email text);
    CREATE FUNCTION auth.uid() RETURNS uuid
      LANGUAGE sql STABLE AS $$
        SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
      $$;
    GRANT USAGE ON SCHEMA auth, public TO anon, authenticated, service_role;
    GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated, service_role;
  `);
  await runSqlFile(new URL('supabase/tests/fresh_install.sql', root));
  console.log('Database migrations and access-control tests passed (isolated PGlite).');
} finally {
  await db.close();
}
