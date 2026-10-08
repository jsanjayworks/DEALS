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
 *   - the built bundle does not contain the production URL,
 *   - the key is wrong, or the production database is not on the newest
 *     migration (SCHEMA below), or is not marked as production.
 *
 * The build is made with EXPO_PUBLIC_APP_ENV=production, so it refuses to run
 * as the demo, and with EXPO_PUBLIC_SIGNIN as set (default: phone). The server
 * side (/api/assist) gets only the EAS production environment, never this
 * computer's .env files. After the deploy it checks that /api/assist refuses
 * anyone not signed in.
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

/** The newest migration the app needs: supabase/migrations/0020_review_fixes.sql. */
const SCHEMA = 20;

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

// ---- the key works and the production database is current and marked ----
{
  const rpc = (name) =>
    fetch(url.replace(/\/$/, '') + '/rest/v1/rpc/' + name, {
      method: 'POST',
      headers: { apikey: key, 'Content-Type': 'application/json' },
      body: '{}',
    }).catch(() => null);
  const res = await rpc('schema_version');
  if (!res) fail('Could not reach ' + url + '. Check the URL and that the project is not paused.');
  if (res.status === 401 || res.status === 403) {
    fail('Supabase refused the key (' + res.status + '). Copy the publishable key of this project again.');
  }
  if (res.status === 404) {
    fail('The production database is not on migration ' + SCHEMA + '. Push the migrations first: npx supabase db push (see docs/LAUNCH.md).');
  }
  if (!res.ok) fail('Supabase answered ' + res.status + ' to the schema check. Try again once the project is healthy.');
  const version = await res.json().catch(() => null);
  if (typeof version !== 'number' || version < SCHEMA) {
    fail('The production database is on migration ' + version + ', the app needs ' + SCHEMA + '. Run npx supabase db push.');
  }
  ok('Production database is on migration ' + version);
  const marked = await rpc('is_production');
  if (!marked?.ok || (await marked.json().catch(() => null)) !== true) {
    fail('Mark the database as production first (docs/LAUNCH.md step 2): the sample seed then can never run on it.');
  }
  ok('Database is marked as production');
}

// ---- sign-in method ----
const signin = env.EXPO_PUBLIC_SIGNIN || 'phone';
if (/phone/.test(signin) && env.YOLO_SMS_READY !== 'yes') {
  console.warn(
    '\n! Sign-in is by phone (EXPO_PUBLIC_SIGNIN=' + signin + '). Real codes need an SMS provider and DLT registration in\n' +
      '  Supabase Auth > Phone; until then only the test numbers you add there can sign in. Set\n' +
      '  EXPO_PUBLIC_SIGNIN=phone,email to offer email too, and YOLO_SMS_READY=yes to hide this note.\n',
  );
}
ok('Sign-in: ' + signin);

// ---- operator details for the privacy policy and terms ----
const legal = readFileSync('src/lib/legal.ts', 'utf8');
const block = legal.slice(legal.indexOf('export const LEGAL'), legal.indexOf('} as const'));
const empty = [...block.matchAll(/^\s*(\w+):\s*''\s*,/gm)].map((m) => m[1]);
if (empty.length) fail('Fill these in src/lib/legal.ts first: ' + empty.join(', '));
ok('Privacy policy and terms have the operator details');

// ---- build ----
execSync('npx expo export --platform web --clear', {
  stdio: 'inherit',
  // A production build refuses to start without its backend (src/data/index.ts).
  env: { ...env, NODE_ENV: 'production', EXPO_PUBLIC_APP_ENV: 'production', EXPO_PUBLIC_SIGNIN: signin },
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
// The server's env comes only from the EAS production environment: no .env
// file from this computer (a personal API key, a local database) is uploaded.
const out = execSync('npx eas-cli@latest deploy --prod --environment production', {
  env: { ...env, EXPO_NO_DOTENV: '1' },
  encoding: 'utf8',
});
process.stdout.write(out);
ok('Deployed');

// ---- the voice API must not be open to anyone ----
const site = (out.match(/https:\/\/[a-z0-9-]+\.expo\.app/i) ?? [])[0];
if (site) {
  const res = await fetch(site + '/api/assist', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ task: 'customer', text: 'hello', lang: 'en-IN' }),
  }).catch(() => null);
  if (!res) console.warn('! Could not reach ' + site + '/api/assist to check it.');
  else if (res.status === 401) ok('/api/assist refuses callers who are not signed in');
  else if (res.status === 503) {
    const why = (await res.json().catch(() => ({}))).error ?? '503';
    console.warn(
      '! /api/assist is not set up (' + why + '). Add ANTHROPIC_API_KEY (--visibility sensitive) and both\n' +
        '  EXPO_PUBLIC_SUPABASE_ values (plain text) to the EAS production environment with eas env:create,\n' +
        '  then deploy again. See docs/LAUNCH.md step 7.',
    );
  } else console.error('✗ /api/assist answered ' + res.status + ' to a caller who is not signed in. Check it at once: it may be spending the Anthropic key for anyone.');
}
