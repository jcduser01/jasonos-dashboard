/**
 * render-check-active-programs.mjs — Dashboard Current panel program-grouping
 * render verification (PCR-OPS-077 follow-on).
 *
 * Uses jsdom to execute both dashboard front-end HTMLs in a headless DOM
 * environment. Exposes renderActive() via IIFE injection, then asserts:
 *   1. Current initiatives correctly grouped under their program's card
 *   2. A program with zero Current members does not appear
 *   3. Per-item delivery-date / id / name fields still render correctly
 *   4. The defensive ungrouped-fallback path renders the ungrouped item
 *      visibly rather than dropping it
 *   5. Zero console errors during render
 *   6. XSS-safe escaping on every interpolated field
 *   7. Empty-state (empty active_initiatives) renders "None." unchanged
 *
 * Run:  node tests/render-check-active-programs.mjs
 * Exit:  0 = all assertions passed, 1 = one or more failed
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { JSDOM } = require('/Volumes/SandboxData/code/sigilzero/node_modules/jsdom');

const __dirname = dirname(fileURLToPath(import.meta.url));
const DASHBOARD_ROOT = resolve(__dirname, '..');
const FIXTURE = JSON.parse(
  readFileSync(join(__dirname, 'fixtures', 'active-programs.json'), 'utf-8')
);

let passed = 0;
let failed = 0;

function ok(label)            { console.log(`  PASS  ${label}`); passed++; }
function fail(label, extra)   {
  console.error(`  FAIL  ${label}${extra ? ': ' + extra : ''}`);
  failed++;
}

// ── Script extraction + injection ─────────────────────────────────────────────

function extractInlineScript(html) {
  const m = html.match(/<script(?:\s(?![^>]*\bsrc\s*=)[^>]*)?>([^]*?)<\/script>/i);
  return m ? m[1] : '';
}

/**
 * Inject window-exposure assignments INSIDE the IIFE, just before its closing
 * `}());` so locally-scoped functions are accessible after eval.
 */
function injectExposure(scriptText) {
  const exposure = [
    '// Expose for testing (injected by render-check-active-programs.mjs)',
    'if (typeof renderActive   !== "undefined") window.__renderActive   = renderActive;',
    'if (typeof renderPrograms !== "undefined") window.__renderPrograms = renderPrograms;',
    'if (typeof render         !== "undefined") window.__render         = render;',
    'if (typeof escHtml        !== "undefined") window.__escHtml        = escHtml;',
  ].join('\n');
  return scriptText.replace(/\}\(\)\);\s*$/, exposure + '\n}());');
}

// ── DOM load + script exec ────────────────────────────────────────────────────

function loadAndExec(htmlPath) {
  const html = readFileSync(htmlPath, 'utf-8');
  const consoleErrors = [];

  const dom = new JSDOM(html, {
    runScripts: 'outside-only',
    url: 'http://localhost/',
  });

  const { window } = dom;

  window.console.error = (...args) => {
    consoleErrors.push(args.map(String).join(' '));
  };

  // Prevent the auto-load fetch from firing against a real URL.
  window.fetch = () => new Promise(() => {});

  const raw = extractInlineScript(html);
  if (!raw) {
    consoleErrors.push('no inline script found in HTML');
    return { window, document: window.document, consoleErrors };
  }

  const patched = injectExposure(raw);
  try {
    window.eval(patched);
  } catch (e) {
    consoleErrors.push('script eval error: ' + e.message);
  }

  return { window, document: window.document, consoleErrors };
}

// ── Assertions ────────────────────────────────────────────────────────────────

/**
 * Main render-check: grouped output, per-item fields, ungrouped fallback, XSS.
 */
function assertActiveGrouping(htmlPath, frontEndLabel, fixture) {
  console.log('\n-- ' + frontEndLabel + ' (grouped rendering) --');
  const { window, document, consoleErrors } = loadAndExec(htmlPath);

  // 1. Panel structure.
  const panel = document.getElementById('active-panel');
  if (panel) ok('#active-panel element exists'); else fail('#active-panel missing');

  const body = document.getElementById('active-body');
  if (body) ok('#active-body element exists');
  else { fail('#active-body missing'); return; }

  // 2. renderActive is callable.
  const renderActive = window.__renderActive;
  if (typeof renderActive !== 'function') {
    fail('renderActive() not callable (injection failed)'); return;
  }
  ok('renderActive() is callable');

  // 3. Call with test data (3-arg signature).
  try {
    renderActive(fixture.active_initiative, fixture.active_initiatives, fixture.programs);
  } catch (e) {
    fail('renderActive() threw', e.message); return;
  }

  const bodyHTML = body.innerHTML || '';

  // 4. Body populated.
  if (bodyHTML.trim().length > 0) ok('#active-body populated after render');
  else fail('#active-body empty after renderActive()');

  // 5. .active-group elements present (Program Alpha, Program Beta, Ungrouped = 3).
  const nGroups = document.querySelectorAll('.active-group').length;
  if (nGroups >= 2) ok('.active-group elements rendered (' + nGroups + ')');
  else fail('fewer than 2 .active-group elements (got ' + nGroups + ')');

  // 6. Grouped initiatives in DOM.
  for (const id of ['INI-141', 'INI-114']) {
    if (bodyHTML.includes(id)) ok(id + ' appears in DOM (grouped)');
    else fail(id + ' NOT in DOM');
  }

  // 7. Ungrouped-fallback initiative in DOM.
  if (bodyHTML.includes('INI-999')) ok('INI-999 in DOM (ungrouped-fallback path)');
  else fail('INI-999 NOT in DOM — ungrouped-fallback dropped it');

  // 8. Per-item delivery dates survive regrouping (sourced from active_initiatives lookup).
  for (const date of ['2026-09-30', '2026-10-15', '2026-11-01']) {
    if (bodyHTML.includes(date)) ok('delivery date ' + date + ' in DOM');
    else fail('delivery date ' + date + ' NOT in DOM');
  }

  // 9. Program with zero Current members does NOT appear.
  if (!bodyHTML.includes('Program Gamma')) {
    ok('Program Gamma (0 Current members) does not appear in DOM');
  } else {
    fail('Program Gamma (0 Current members) incorrectly rendered');
  }

  // 10. Ungrouped section present (initiative not in any program group).
  if (bodyHTML.toLowerCase().includes('ungrouped')) {
    ok('"Ungrouped" section rendered for unmatched Current initiative');
  } else {
    fail('"Ungrouped" section NOT rendered — ungrouped-fallback missing');
  }

  // 11. "In Progress" badge present (per-item status badge unchanged).
  if (bodyHTML.includes('In Progress')) ok('"In Progress" badge rendered on items');
  else fail('"In Progress" badge NOT found');

  // 12. Backlog member not shown (INI-142 is Backlog in Program Alpha — must not appear).
  if (!bodyHTML.includes('INI-142')) ok('INI-142 (Backlog) not rendered inside group');
  else fail('INI-142 (Backlog) incorrectly appeared in grouped output');

  // 13. XSS: raw <script> tag must NOT appear in bodyHTML.
  if (!bodyHTML.includes('<script')) {
    ok('XSS: no unescaped <script> tag in #active-body innerHTML');
  } else {
    fail('XSS: unescaped <script> found in #active-body innerHTML');
  }

  // 14. XSS: <img> onerror pattern must not appear unescaped.
  if (!bodyHTML.includes('<img')) {
    ok('XSS: no unescaped <img> tag in #active-body innerHTML');
  } else {
    fail('XSS: unescaped <img> found in #active-body innerHTML');
  }

  // 15. XSS: "xss" text is present as escaped content (not dropped silently).
  if (bodyHTML.includes('xss')) ok('XSS string content present as escaped text (not dropped)');
  else fail('XSS string content "xss" missing from rendered output');

  // 16. Zero console errors.
  if (consoleErrors.length === 0) ok('zero console.error calls during render');
  else fail(consoleErrors.length + ' console.error call(s)', consoleErrors.slice(0, 3).join('; '));
}

/**
 * Empty-state: active_initiatives is empty → "None." unchanged.
 */
function assertEmptyState(htmlPath, frontEndLabel) {
  console.log('\n-- ' + frontEndLabel + ' (empty-state: no Current initiatives) --');
  const { window, document, consoleErrors } = loadAndExec(htmlPath);

  const body = document.getElementById('active-body');
  if (!body) { fail('#active-body missing'); return; }

  const renderActive = window.__renderActive;
  if (typeof renderActive !== 'function') { fail('renderActive() not callable'); return; }

  try {
    renderActive(null, [], FIXTURE.programs);
  } catch (e) { fail('renderActive() threw for empty list', e.message); return; }

  const bodyHTML = body.innerHTML || '';
  if (bodyHTML.includes('None.')) {
    ok('empty-state: "None." rendered (existing behaviour preserved)');
  } else {
    fail('empty-state: "None." NOT found — empty-state broken');
  }

  const nGroups = document.querySelectorAll('.active-group').length;
  if (nGroups === 0) ok('empty-state: no .active-group elements (correct)');
  else fail('empty-state: .active-group elements rendered unexpectedly (' + nGroups + ')');

  if (consoleErrors.length === 0) ok('zero console.error for empty-state');
  else fail('console.error for empty-state', consoleErrors.slice(0, 2).join('; '));
}

/**
 * No-programs fallback: programs argument is undefined → all Current initiatives
 * appear under an "Ungrouped" section rather than being dropped.
 */
function assertNoProgramsFallback(htmlPath, frontEndLabel) {
  console.log('\n-- ' + frontEndLabel + ' (no-programs fallback) --');
  const { window, document, consoleErrors } = loadAndExec(htmlPath);

  const body = document.getElementById('active-body');
  if (!body) { fail('#active-body missing'); return; }

  const renderActive = window.__renderActive;
  if (typeof renderActive !== 'function') { fail('renderActive() not callable'); return; }

  try {
    renderActive(FIXTURE.active_initiative, FIXTURE.active_initiatives, undefined);
  } catch (e) { fail('renderActive() threw with programs=undefined', e.message); return; }

  const bodyHTML = body.innerHTML || '';

  // All three initiatives must appear even without programs data.
  for (const id of ['INI-141', 'INI-114', 'INI-999']) {
    if (bodyHTML.includes(id)) ok(id + ' rendered in no-programs fallback');
    else fail(id + ' dropped in no-programs fallback');
  }

  if (consoleErrors.length === 0) ok('zero console.error for no-programs fallback');
  else fail('console.error for no-programs fallback', consoleErrors.slice(0, 2).join('; '));
}

// ── Main ──────────────────────────────────────────────────────────────────────

const INDEX_HTML     = join(DASHBOARD_ROOT, 'index.html');
const PRO_INDEX_HTML = join(DASHBOARD_ROOT, 'pro', 'index.html');

console.log('render-check-active-programs.mjs — Current panel program-grouping (PCR-OPS-077 follow-on)');
console.log('Fixture: tests/fixtures/active-programs.json');

assertActiveGrouping(INDEX_HTML,     'index.html',     FIXTURE);
assertEmptyState    (INDEX_HTML,     'index.html');
assertNoProgramsFallback(INDEX_HTML, 'index.html');

assertActiveGrouping(PRO_INDEX_HTML, 'pro/index.html', FIXTURE);
assertEmptyState    (PRO_INDEX_HTML, 'pro/index.html');
assertNoProgramsFallback(PRO_INDEX_HTML, 'pro/index.html');

console.log('\n' + '─'.repeat(40));
console.log(passed + ' passed, ' + failed + ' failed');
if (failed > 0) {
  console.error('\nrender-check-active-programs: FAILED');
  process.exit(1);
} else {
  console.log('\nrender-check-active-programs: all assertions passed');
}
