// supabase/functions/_test/observability.test.ts
//
// B3.8 — Negative observability tests.
//
// Static analysis of the four Apple-related Edge Functions to confirm that
// no console.* call concatenates raw secret material — refresh tokens,
// authorization codes, identity tokens, raw Apple subs, or raw user UUIDs —
// into log lines that ship to Supabase Logs / Logflare / Sentry.
//
// Approach: pure source-file regex scanning. We deliberately do NOT invoke
// the functions over the network. The runtime tests in each function's
// own index.test.ts already exercise the error paths; this suite is the
// safety net that catches log-discipline drift.
//
// The discipline we enforce on B3-touched logs:
//   1. Every Apple-related console.* call must wrap a JSON.stringify({ ... })
//      structured object — never pass an Error/object directly.
//   2. Token/code/identity-token identifiers must never appear as
//      arguments to console.*.
//   3. Raw user UUIDs (`${userId}`) must never appear inside a console.*
//      call's arguments — only the 16-char SHA-256 prefix via hashUserId().
//   4. Raw apple_sub identifiers (`${appleSub}`, `${storedAppleSub}`,
//      `${decodedSub}`) must never appear inside a console.* call's
//      arguments.
//
// Scope notes:
//   - delete-account contains pre-B3.6 console.log/error template strings
//     in steps 2-7 (e.g. `console.log(\`delete-account: ... ${userId}\`)`)
//     which DO embed raw userIds. Those lines were not modified by B3.6 and
//     are explicitly out of scope here. We assert ONLY on the Apple/
//     delete-account-event-tagged blocks that B3.6 added/touched.
//
// Run:
//   deno test --allow-read supabase/functions/_test/observability.test.ts

import {
  assert,
  assertEquals,
} from 'https://deno.land/std@0.224.0/assert/mod.ts';

const REPO_ROOT = new URL('../../../', import.meta.url).pathname;

function read(rel: string): string {
  return Deno.readTextFileSync(REPO_ROOT + rel);
}

// ---------------------------------------------------------------------------
// Helpers — scan for console.* calls and inspect their argument text
// ---------------------------------------------------------------------------

interface ConsoleCall {
  /** 1-indexed line where the `console.` token starts. */
  line: number;
  /** Level: log, warn, error, info. */
  level: string;
  /** Raw text of arguments between the outer parens, balanced. */
  args: string;
  /** Whole snippet from `console.` to the matching `)`. */
  full: string;
}

/**
 * Extract every console.{log,warn,error,info} call from `src` along with
 * its (paren-balanced) argument text. Multiline calls are joined.
 */
function findConsoleCalls(src: string): ConsoleCall[] {
  const calls: ConsoleCall[] = [];
  const re = /console\.(log|warn|error|info)\s*\(/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    const start = m.index;
    const openParen = re.lastIndex - 1;
    // Walk forward, tracking string/template/paren depth, until the matching ')'.
    let depth = 1;
    let i = openParen + 1;
    let inSingle = false;
    let inDouble = false;
    let inTemplate = false;
    let inLineComment = false;
    let inBlockComment = false;
    let templateBraceDepth = 0;
    while (i < src.length && depth > 0) {
      const ch = src[i];
      const prev = src[i - 1];
      if (inLineComment) {
        if (ch === '\n') inLineComment = false;
        i++;
        continue;
      }
      if (inBlockComment) {
        if (ch === '*' && src[i + 1] === '/') {
          inBlockComment = false;
          i += 2;
          continue;
        }
        i++;
        continue;
      }
      if (inSingle) {
        if (ch === '\\') { i += 2; continue; }
        if (ch === "'") inSingle = false;
        i++;
        continue;
      }
      if (inDouble) {
        if (ch === '\\') { i += 2; continue; }
        if (ch === '"') inDouble = false;
        i++;
        continue;
      }
      if (inTemplate) {
        if (ch === '\\') { i += 2; continue; }
        if (ch === '`' && templateBraceDepth === 0) {
          inTemplate = false;
          i++;
          continue;
        }
        if (ch === '$' && src[i + 1] === '{') {
          templateBraceDepth++;
          i += 2;
          continue;
        }
        if (ch === '}' && templateBraceDepth > 0) {
          templateBraceDepth--;
          i++;
          continue;
        }
        // Inside ${...}, parens still need to be balanced w.r.t. JS expressions
        if (templateBraceDepth > 0) {
          if (ch === '(') depth++;
          else if (ch === ')') depth--;
          // If we somehow underflow inside template, treat as exit
          if (depth === 0) break;
        }
        i++;
        continue;
      }
      if (ch === '/' && src[i + 1] === '/') { inLineComment = true; i += 2; continue; }
      if (ch === '/' && src[i + 1] === '*') { inBlockComment = true; i += 2; continue; }
      if (ch === "'") { inSingle = true; i++; continue; }
      if (ch === '"') { inDouble = true; i++; continue; }
      if (ch === '`') { inTemplate = true; i++; continue; }
      if (ch === '(') depth++;
      else if (ch === ')') {
        depth--;
        if (depth === 0) break;
      }
      i++;
      // suppress unused warning
      void prev;
    }
    if (depth !== 0) {
      // Malformed — skip rather than throw (defensive).
      continue;
    }
    const argsText = src.slice(openParen + 1, i);
    const full = src.slice(start, i + 1);
    const lineNum = src.slice(0, start).split('\n').length;
    calls.push({ line: lineNum, level: m[1], args: argsText, full });
  }
  return calls;
}

/**
 * Forbidden identifier names that, if interpolated into a console.* call's
 * arguments, indicate a raw secret leak. We match `${name}` (template),
 * naked `name` references inside JSON.stringify({ ... name ... }),
 * and `name:` shorthand-property usage.
 */
const FORBIDDEN_TOKEN_IDENTIFIERS = [
  'authorizationCode',
  'authorization_code', // raw form-body fragment as a key/value
  'identityToken',
  'identity_token',
  'refreshToken',
  'refresh_token',
  'providerRefreshToken',
  'provider_refresh_token',
  'accessToken',
  'access_token',
  'idToken',
  'id_token',
];

/** Apple `sub` identifiers we never want to log raw. */
const FORBIDDEN_SUB_IDENTIFIERS = [
  'appleSub',
  'storedAppleSub',
  'decodedSub',
];

/** Raw user-id identifier — must always be hashed before logging. */
const FORBIDDEN_USERID_IDENTIFIERS = ['userId', 'user_id'];

/**
 * Identifiers wrapping a forbidden raw value that ARE safe to log. If the
 * forbidden identifier appears only as an argument to one of these wrappers,
 * it doesn't count as a leak. Any free-standing reference outside the
 * wrapper is still flagged.
 *
 * `hashUserId(userId)` / `hashUserIdSync(userId)` produce a 16-char SHA-256
 * prefix — the canonical safe form. Recognised in apple-token-exchange,
 * apple-token-persist, and delete-account.
 */
const SAFE_WRAPPERS = ['hashUserId', 'hashUserIdSync'];

/**
 * Returns true if `args` contains a problematic reference to `name`:
 *   - `${name}` inside a template literal
 *   - bare `name` token used as a property-shorthand value
 *   - `name` used as an expression elsewhere
 *
 * Excludes:
 *   - string-literal keys/values (`'authorization_code'`, `"id_token"`)
 *   - line and block comments
 *   - calls of the form `safeWrapper(name)` — the wrapper hashes/scrubs
 *     before the value escapes into the log payload
 *
 * We strip string literals and comments first to remove false positives
 * from event-name strings like `'apple_invalid_grant'`.
 */
function containsIdentifierUse(args: string, ident: string): boolean {
  // Strip line comments
  let scrubbed = args.replace(/\/\/[^\n]*/g, '');
  // Strip block comments
  scrubbed = scrubbed.replace(/\/\*[\s\S]*?\*\//g, '');
  // Strip single-quoted strings
  scrubbed = scrubbed.replace(/'(?:\\.|[^'\\])*'/g, "''");
  // Strip double-quoted strings
  scrubbed = scrubbed.replace(/"(?:\\.|[^"\\])*"/g, '""');
  // KEEP template literals — `${ident}` inside a template is exactly what
  // we're trying to catch. We strip non-`${...}` chars from templates by
  // walking templates and only retaining ${...} expressions.
  scrubbed = scrubbed.replace(/`((?:\\.|\$\{[^}]*\}|[^`\\])*)`/g, (_full, body) => {
    // Keep only the ${...} substitutions, separated by spaces.
    const parts: string[] = [];
    const subRe = /\$\{([^}]*)\}/g;
    let mm: RegExpExecArray | null;
    while ((mm = subRe.exec(body)) !== null) {
      parts.push(mm[1]);
    }
    return parts.join(' ');
  });

  // Remove safe-wrapper calls so `hashUserId(userId)` doesn't trip the bare
  // `userId` check. Match `wrapper ( <anything-not-a-paren> )` non-greedily;
  // since wrapper args here are simple (`userId` / `await hashUserId(userId)`
  // is itself only one nesting deep but we run the substitution iteratively
  // until stable).
  for (const wrapper of SAFE_WRAPPERS) {
    const wrapperRe = new RegExp(
      `(^|[^A-Za-z0-9_$])${wrapper}\\s*\\(([^()]*)\\)`,
      'g',
    );
    let prev = '';
    while (prev !== scrubbed) {
      prev = scrubbed;
      scrubbed = scrubbed.replace(wrapperRe, '$1__SAFE_WRAPPED__');
    }
  }

  const re = new RegExp(`(^|[^A-Za-z0-9_$])${ident}([^A-Za-z0-9_$]|$)`);
  return re.test(scrubbed);
}

/**
 * Returns true if the call's arguments are a single JSON.stringify({...})
 * expression (with optional whitespace). This is the canonical structured
 * shape for B3 logs.
 */
function isStructuredJsonStringify(args: string): boolean {
  const trimmed = args.trim();
  return /^JSON\.stringify\s*\(\s*\{[\s\S]*\}\s*\)$/.test(trimmed);
}

// ---------------------------------------------------------------------------
// Test 1 — apple-token-exchange
// ---------------------------------------------------------------------------

Deno.test('apple-token-exchange: no token/sub/userId leaks in source', () => {
  const src = read('supabase/functions/apple-token-exchange/index.ts');
  const calls = findConsoleCalls(src);
  assert(calls.length > 0, 'expected at least one console.* call to scan');

  const violations: string[] = [];

  for (const call of calls) {
    // 1. No token identifier may appear as an argument.
    for (const ident of FORBIDDEN_TOKEN_IDENTIFIERS) {
      if (containsIdentifierUse(call.args, ident)) {
        violations.push(
          `line ${call.line}: console.${call.level} references forbidden token identifier '${ident}': ${call.full}`,
        );
      }
    }
    // 2. No raw apple_sub identifier may appear.
    for (const ident of FORBIDDEN_SUB_IDENTIFIERS) {
      if (containsIdentifierUse(call.args, ident)) {
        violations.push(
          `line ${call.line}: console.${call.level} references forbidden apple_sub identifier '${ident}': ${call.full}`,
        );
      }
    }
    // 3. No raw userId may appear (must be hashed).
    for (const ident of FORBIDDEN_USERID_IDENTIFIERS) {
      if (containsIdentifierUse(call.args, ident)) {
        violations.push(
          `line ${call.line}: console.${call.level} references raw user id '${ident}' (use hashUserId): ${call.full}`,
        );
      }
    }
    // 4. Must be structured JSON.stringify({...}) — no raw err/Error pass-through.
    if (!isStructuredJsonStringify(call.args)) {
      violations.push(
        `line ${call.line}: console.${call.level} is not JSON.stringify({...}) — ${call.full}`,
      );
    }
  }

  assertEquals(
    violations,
    [],
    `apple-token-exchange log discipline violations:\n  ${violations.join('\n  ')}`,
  );
});

// ---------------------------------------------------------------------------
// Test 2 — apple-token-persist
// ---------------------------------------------------------------------------

Deno.test('apple-token-persist: no token/sub/userId leaks in source', () => {
  const src = read('supabase/functions/apple-token-persist/index.ts');
  const calls = findConsoleCalls(src);
  assert(calls.length > 0, 'expected at least one console.* call to scan');

  const violations: string[] = [];

  for (const call of calls) {
    for (const ident of FORBIDDEN_TOKEN_IDENTIFIERS) {
      if (containsIdentifierUse(call.args, ident)) {
        violations.push(
          `line ${call.line}: console.${call.level} references forbidden token identifier '${ident}': ${call.full}`,
        );
      }
    }
    for (const ident of FORBIDDEN_SUB_IDENTIFIERS) {
      if (containsIdentifierUse(call.args, ident)) {
        violations.push(
          `line ${call.line}: console.${call.level} references forbidden apple_sub identifier '${ident}': ${call.full}`,
        );
      }
    }
    for (const ident of FORBIDDEN_USERID_IDENTIFIERS) {
      if (containsIdentifierUse(call.args, ident)) {
        violations.push(
          `line ${call.line}: console.${call.level} references raw user id '${ident}' (use hashUserId): ${call.full}`,
        );
      }
    }
    if (!isStructuredJsonStringify(call.args)) {
      violations.push(
        `line ${call.line}: console.${call.level} is not JSON.stringify({...}) — ${call.full}`,
      );
    }
  }

  assertEquals(
    violations,
    [],
    `apple-token-persist log discipline violations:\n  ${violations.join('\n  ')}`,
  );
});

// ---------------------------------------------------------------------------
// Test 3 — apple-revocation-retry
// ---------------------------------------------------------------------------

Deno.test('apple-revocation-retry: no token/sub/userId leaks in source', () => {
  const src = read('supabase/functions/apple-revocation-retry/index.ts');
  const calls = findConsoleCalls(src);
  assert(calls.length > 0, 'expected at least one console.* call to scan');

  const violations: string[] = [];

  for (const call of calls) {
    for (const ident of FORBIDDEN_TOKEN_IDENTIFIERS) {
      if (containsIdentifierUse(call.args, ident)) {
        violations.push(
          `line ${call.line}: console.${call.level} references forbidden token identifier '${ident}': ${call.full}`,
        );
      }
    }
    for (const ident of FORBIDDEN_SUB_IDENTIFIERS) {
      if (containsIdentifierUse(call.args, ident)) {
        violations.push(
          `line ${call.line}: console.${call.level} references forbidden apple_sub identifier '${ident}': ${call.full}`,
        );
      }
    }
    // apple-revocation-retry runs at the table-row level — there is no
    // userId in scope at all (it operates on pending_apple_revocations.id).
    // Still assert to catch any future drift.
    for (const ident of FORBIDDEN_USERID_IDENTIFIERS) {
      if (containsIdentifierUse(call.args, ident)) {
        violations.push(
          `line ${call.line}: console.${call.level} references raw user id '${ident}': ${call.full}`,
        );
      }
    }
    if (!isStructuredJsonStringify(call.args)) {
      violations.push(
        `line ${call.line}: console.${call.level} is not JSON.stringify({...}) — ${call.full}`,
      );
    }
  }

  assertEquals(
    violations,
    [],
    `apple-revocation-retry log discipline violations:\n  ${violations.join('\n  ')}`,
  );
});

// ---------------------------------------------------------------------------
// Test 4 — delete-account: only the Apple-related blocks
// ---------------------------------------------------------------------------
//
// delete-account predates B3.6 and contains many template-string console
// calls in steps 2-7 that bake the raw userId into log lines. Those lines
// are explicitly out of scope.
//
// We scope this test to console.* calls whose argument text mentions an
// Apple-related event tag — i.e. `apple_*` or `delete_account_*` event
// names. Those are the ones B3.6 added (or in the lock/unlock case,
// touched). They are the ones we own.

const APPLE_BLOCK_EVENT_PATTERN = /['"](apple_[a-z_]+|delete_account_[a-z_]+)['"]/;

Deno.test('delete-account: Apple branches use structured logs only', () => {
  const src = read('supabase/functions/delete-account/index.ts');
  const calls = findConsoleCalls(src);
  assert(calls.length > 0, 'expected at least one console.* call to scan');

  const appleCalls = calls.filter((c) => APPLE_BLOCK_EVENT_PATTERN.test(c.args));
  assert(
    appleCalls.length > 0,
    'expected at least one Apple-tagged console.* call (apple_* or delete_account_* event)',
  );

  const violations: string[] = [];

  for (const call of appleCalls) {
    for (const ident of FORBIDDEN_TOKEN_IDENTIFIERS) {
      if (containsIdentifierUse(call.args, ident)) {
        violations.push(
          `line ${call.line}: console.${call.level} references forbidden token identifier '${ident}': ${call.full}`,
        );
      }
    }
    for (const ident of FORBIDDEN_SUB_IDENTIFIERS) {
      if (containsIdentifierUse(call.args, ident)) {
        violations.push(
          `line ${call.line}: console.${call.level} references forbidden apple_sub identifier '${ident}': ${call.full}`,
        );
      }
    }
    for (const ident of FORBIDDEN_USERID_IDENTIFIERS) {
      if (containsIdentifierUse(call.args, ident)) {
        violations.push(
          `line ${call.line}: console.${call.level} references raw user id '${ident}' (use hashUserId): ${call.full}`,
        );
      }
    }
    if (!isStructuredJsonStringify(call.args)) {
      violations.push(
        `line ${call.line}: console.${call.level} is not JSON.stringify({...}) — ${call.full}`,
      );
    }
  }

  assertEquals(
    violations,
    [],
    `delete-account Apple-branch log discipline violations:\n  ${violations.join('\n  ')}`,
  );
});

// ---------------------------------------------------------------------------
// Test 5 — sanity: forbidden literal substrings nowhere in any source.
// ---------------------------------------------------------------------------
//
// Belt-and-suspenders. Catches things the structural scan might miss —
// e.g. an `'authorization_code=' + code` concatenation that wraps a raw
// secret into a string before logging.

const FORBIDDEN_LITERAL_FRAGMENTS = [
  'authorization_code=',
  'id_token=',
  'access_token=',
  'refresh_token=',
  'Bearer eyJ',
];

Deno.test('Apple Edge Functions: no raw secret-form literals concatenated into logs', () => {
  const files = [
    'supabase/functions/apple-token-exchange/index.ts',
    'supabase/functions/apple-token-persist/index.ts',
    'supabase/functions/apple-revocation-retry/index.ts',
    'supabase/functions/delete-account/index.ts',
  ];

  const violations: string[] = [];

  for (const file of files) {
    const src = read(file);
    const calls = findConsoleCalls(src);
    for (const call of calls) {
      for (const frag of FORBIDDEN_LITERAL_FRAGMENTS) {
        if (call.args.includes(frag)) {
          violations.push(
            `${file}:${call.line} console.${call.level} contains forbidden literal '${frag}': ${call.full}`,
          );
        }
      }
    }
  }

  assertEquals(
    violations,
    [],
    `forbidden literal fragments in console.* calls:\n  ${violations.join('\n  ')}`,
  );
});
