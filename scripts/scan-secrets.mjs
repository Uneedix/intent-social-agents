import { execFileSync } from 'node:child_process';




const rules = [
  ['private-key', /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/g],
  ['github-token', /\b(?:gh[pousr]_[A-Za-z0-9]{36,255}|github_pat_[A-Za-z0-9_]{60,255})\b/g],
  ['aws-access-key', /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g],
  ['supabase-secret-key', /\bsb_secret_[A-Za-z0-9_-]{20,}\b/g],
  ['stripe-secret-key', /\b(?:sk|rk)_live_[A-Za-z0-9]{20,}\b/g],
  ['slack-token', /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/g],
  ['credential-assignment', /\b(?:SUPABASE_SERVICE_ROLE_KEY|VERCEL_TOKEN|DATABASE_PASSWORD|POSTGRES_PASSWORD|AWS_SECRET_ACCESS_KEY)\s*[:=]\s*["']?([A-Za-z0-9_+/=-]{20,})/g],
];

/** Report rule and location only: never copy the suspected secret into logs. */
export function scanText(source, path) {
  const findings = [];
  const add = (rule, index) => findings.push({ path, line: source.slice(0, index).split('\n').length, rule });
  for (const [rule, pattern] of rules) {
    pattern.lastIndex = 0;
    for (const match of source.matchAll(pattern)) {
      if (rule === 'credential-assignment' && /^(?:YOUR_|EXAMPLE_|PLACEHOLDER|REPLACE_ME)/i.test(match[1])) continue;
      add(rule, match.index);
    }
  }
  const jwt = /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g;
  for (const match of source.matchAll(jwt)) {
    try {
      const payload = JSON.parse(Buffer.from(match[0].split('.')[1], 'base64url').toString('utf8'));
      if (payload.role === 'service_role') add('supabase-service-role-jwt', match.index);
    } catch { /* Not a JWT payload. */ }
  }
  return findings;
}

export async function scanRepository(cwd = process.cwd()) {
  const paths = execFileSync('git', ['ls-files', '--cached', '-z'], { cwd, encoding: 'utf8' }).split('\0').filter(Boolean);
  const findings = [];
  for (const path of paths) {
    if (/(?:^|\/)\.env(?:\.[^/]+)?$/.test(path) && !path.endsWith('.env.example')) {
      findings.push({ path, line: 1, rule: 'committed-env-file' });
    }
    const bytes = execFileSync('git', ['show', ':' + path], { cwd, maxBuffer: 50 * 1024 * 1024 });
    findings.push(...scanText(bytes.toString('utf8'), path));
  }
  return findings;
}

async function main() {
  const findings = await scanRepository();
  for (const finding of findings) console.error(`${finding.path}:${finding.line}: ${finding.rule}`);
  console.log(`Secret scan: ${findings.length} finding(s). Heuristics do not replace provider-side secret scanning.`);
  if (findings.length) process.exitCode = 1;
}


if (process.argv[1] && /[\\/]scan-secrets\.mjs$/.test(process.argv[1])) void main().catch(error => { console.error(error.message); process.exitCode = 1; });

