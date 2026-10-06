/**
 * Builds the website and deploys it to EAS Hosting.
 *
 *   npm run deploy:web            build, check, deploy to production
 *   npm run deploy:web -- --check build and check only
 *
 * Reads EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY from
 * the environment or from .env.production.local (git-ignored). It refuses to
 * deploy when:
 *   - either value is missing (the site would quietly run on demo data),
 *   - the URL points at this computer (127.0.0.1, localhost),
 *   - the key is a secret or service_role key (it would ship to every visitor),
 *   - the operator details in src/lib/legal.ts are still empty,
 *   - the built bundle does not contain the production URL.
 */

import { execSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const check = process.argv.includes('--check');
const fail = (msg) => {
  console.error('\n✗ ' + msg + '\n');
  process.exit(1);
};
const ok = (msg) => console.log('✓ ' + msg);

// ---- environment ----
const env = { ...process.env };
if (existsSync('.env.production.local')) {
  for (const line of readFileSync('.env.production.local', 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !env[m[1]]) env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
}
const url = env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const key = env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

if (!url || !key) {
  fail('Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY in .env.production.local (see .env.example).');
}
if (!/^https:\/\//.test(url) || /localhost|127\.0\.0\.1/.test(url)) {
  fail('EXPO_PUBLIC_SUPABASE_URL must be the hosted project (https://<ref>.supabase.co), not ' + url);
}
const jwtRole = (() => {
  try {
    return JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString()).role;
  } catch {
    return null;
  }
})();
if (key.startsWith('sb_secret_') || jwtRole === 'service_role') {
  fail('That is a secret key. Use the publishable key: it is public by design, the secret one is not.');
}
ok('Supabase project ' + url);

// ---- operator details for the privacy policy and terms ----
const legal = readFileSync('src/lib/legal.ts', 'utf8');
const block = legal.slice(legal.indexOf('export const LEGAL'), legal.indexOf('} as const'));
const empty = [...block.matchAll(/^\s*(\w+):\s*''\s*,/gm)].map((m) => m[1]);
if (empty.length) fail('Fill these in src/lib/legal.ts first: ' + empty.join(', '));
ok('Privacy policy and terms have the operator details');

// ---- build ----
execSync('npx expo export --platform web --clear', {
  stdio: 'inherit',
  env: { ...env, NODE_ENV: 'production' },
});
// app.json sets web.output "server": every page is rendered on request, so a
// shared link to /deal/<id> or /category/food opens directly instead of 404ing.
if (!existsSync('dist/client') || !existsSync('dist/server')) fail('The export did not produce dist/client and dist/server');

const files = [];
const walk = (dir) => {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p);
    else if (p.endsWith('.js')) files.push(p);
  }
};
walk('dist');
const bundle = files.map((f) => readFileSync(f, 'utf8')).join('\n');
if (!bundle.includes(url)) fail('The bundle does not contain ' + url + '; the site would run on demo data.');
if (/127\.0\.0\.1:54321/.test(bundle)) fail('The bundle still points at the local Supabase.');
ok('Bundle points at the production database');

if (check) {
  console.log('\nChecked. Run without --check to deploy.');
  process.exit(0);
}

// ---- deploy ----
execSync('npx eas-cli@latest deploy --prod', { stdio: 'inherit', env });
ok('Deployed');
