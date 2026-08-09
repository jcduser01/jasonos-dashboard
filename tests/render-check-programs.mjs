/**
 * render-check-programs.mjs — Dashboard Programs panel render verification
 * (PCR-OPS-077 Definition of Done: zero console errors, panel renders correctly).
 *
 * Uses jsdom to execute both dashboard front-end HTMLs in a headless DOM
 * environment. Each HTML's main script is inside an IIFE; we inject window
 * exposure assignments inside the IIFE before it closes, then call
 * renderPrograms() with the PCR-OPS-077 fixture data and assert:
 *   1. #programs-panel and #programs-body elements exist
 *   2. #programs-body is populated after renderPrograms() call
 *   3. At least one .prog-group element is rendered
 *   4. Program names from the fixture appear in the DOM
 *   5. Status badges (CURRENT/NEXT/PAUSED/BACKLOG) appear in the DOM
 *   6. No console.error calls fired during render
 *   7. Empty groups contract: groups:[] renders placeholder, not groups
 *   8. No CEO/AGENT action badges in Programs panel (GAP-104 boundary)
 *
 * Run:  node tests/render-check-programs.mjs
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
  readFileSync(join(__dirname, 'fixtures', 'programs-pcr077.json'), 'utf-8')
);

let passed = 0;
let failed = 0;

function ok(label) { console.log(`  PASS  ${label}`); passed++; }
function fail(label, extra) {
  console.error(`  FAIL  ${label}${extra ? ': ' + extra : ''}`);
  failed++;
}

// ── Script extraction + injection ─────────────────────────────────────────────

function extractInlineScript(html) {
  // Return the content of the first non-src inline <script> tag.
  const m = html.match(/<script(?:\s(?![^>]*\bsrc\s*=)[^>]*)?>([^]*?)<\/script>/i);
  return m ? m[1] : '';
}

/**
 * Inject window-exposure assignments INSIDE the IIFE, just before its closing
 * `}());` so the locally-scoped functions are accessible after eval.
 */
function injectExposure(scriptText) {
  const exposure = [
    '// Expose for testing (injected by render-check-programs.mjs)',
    'if (typeof renderPrograms !== "undefined") window.__renderPrograms = renderPrograms;',
    'if (typeof renderProjects !== "undefined") window.__renderProjects = renderProjects;',
    'if (typeof render         !== "undefined") window.__render         = render;',
    'if (typeof escHtml        !== "undefined") window.__escHtml        = escHtml;',
  ].join('\n');
  // Match the closing }()); pattern — dashboard IIFE is (function(){...}());
  // Actual byte sequence at end: } ( ) ) ; \n
  return scriptText.replace(/\}\(\)\);\s*$/, exposure + '\n}());');
}

// ── DOM load + script exec ────────────────────────────────────────────────────

function loadAndExec(htmlPath) {
  const html = readFileSync(htmlPath, 'utf-8');
  const consoleErrors = [];

  // Use http://localhost/ (not file://) — file: URLs create an opaque origin
  // in jsdom which blocks sessionStorage access and aborts eval mid-script.
  const dom = new JSDOM(html, {
    runScripts: 'outside-only',
    url: 'http://localhost/',
  });

  const { window } = dom;

  // Capture console.error calls.
  window.console.error = (...args) => {
    consoleErrors.push(args.map(String).join(' '));
  };

  // Override fetch so the auto-load scheduling never fires against a real URL.
  window.fetch = () => new Promise(() => {});

  // Modify the script to expose functions, then eval it.
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

function assertProgramsPanel(htmlPath, frontEndLabel, programsData) {
  console.log('\n-- ' + frontEndLabel + ' --');
  const { window, document, consoleErrors } = loadAndExec(htmlPath);

  // 1. HTML structure.
  const panel = document.getElementById('programs-panel');
  if (panel) ok('#programs-panel element exists'); else fail('#programs-panel missing');

  const body = document.getElementById('programs-body');
  if (body) ok('#programs-body element exists');
  else { fail('#programs-body missing'); return; }

  // 2. renderPrograms is callable.
  const renderPrograms = window.__renderPrograms;
  if (typeof renderPrograms !== 'function') {
    fail('renderPrograms() not callable (injection failed)'); return;
  }
  ok('renderPrograms() is callable');

  // 3. Call it with test data.
  try {
    renderPrograms(programsData);
  } catch (e) {
    fail('renderPrograms() threw', e.message); return;
  }

  const bodyText = body.innerHTML || '';

  // 4. Body populated.
  if (bodyText.trim().length > 0) ok('#programs-body populated after render');
  else fail('#programs-body empty after renderPrograms()');

  // 5. .prog-group elements present.
  const nGroups = document.querySelectorAll('.prog-group').length;
  if (nGroups > 0) ok('.prog-group elements rendered (' + nGroups + ')');
  else fail('no .prog-group elements rendered');

  // 6. Program names in DOM.
  for (const name of ['Dyson Hope Reels', 'Venture Opportunity Engine', 'JCD Website']) {
    if (bodyText.includes(name)) ok('program "' + name + '" in DOM');
    else fail('program "' + name + '" NOT in DOM');
  }

  // 7. Status badges in DOM.
  const bodyUpper = bodyText.toUpperCase();
  for (const badge of ['CURRENT', 'NEXT', 'PAUSED', 'BACKLOG']) {
    if (bodyUpper.includes(badge)) ok('status "' + badge + '" badge in DOM');
    else fail('status "' + badge + '" badge NOT in DOM');
  }

  // 8. INI IDs in DOM.
  for (const id of ['INI-141', 'INI-111', 'INI-114', 'INI-039']) {
    if (bodyText.includes(id)) ok(id + ' in DOM');
    else fail(id + ' NOT in DOM');
  }

  // 9. Description text in DOM.
  const hasDesc = bodyText.includes('Dyson Hope Reels production system') ||
                  bodyText.includes('discovery and filtering engine');
  if (hasDesc) ok('program description text rendered');
  else fail('program description text NOT in DOM');

  // 10. No CEO/AGENT action badges (GAP-104 boundary).
  if (!bodyText.includes('CEO ACTION') && !bodyText.includes('AGENT ACTION')) {
    ok('no CEO/AGENT action badges in Programs (GAP-104 boundary respected)');
  } else {
    fail('CEO ACTION or AGENT ACTION badge found in Programs panel');
  }

  // 11. Zero console errors.
  if (consoleErrors.length === 0) ok('zero console.error calls during render');
  else fail(consoleErrors.length + ' console.error call(s)', consoleErrors.slice(0, 3).join('; '));
}

function assertEmptyGroupsContract(htmlPath, frontEndLabel) {
  console.log('\n-- ' + frontEndLabel + ' (empty groups contract) --');
  const { window, document, consoleErrors } = loadAndExec(htmlPath);
  const body = document.getElementById('programs-body');
  if (!body) { fail('#programs-body missing'); return; }

  const renderPrograms = window.__renderPrograms;
  if (typeof renderPrograms !== 'function') { fail('renderPrograms() not callable'); return; }

  try {
    renderPrograms({ groups: [], generated_at: '2026-08-09T00:00:00Z' });
  } catch (e) { fail('renderPrograms() threw for empty groups', e.message); return; }

  const nGroups = document.querySelectorAll('.prog-group').length;
  const bodyText = (body.innerHTML || '').trim();

  if (nGroups === 0 && bodyText.length > 0) {
    ok('empty groups: placeholder rendered, no .prog-group');
  } else if (nGroups > 0) {
    fail('empty groups: .prog-group rendered unexpectedly');
  } else {
    fail('empty groups: body is empty (expected placeholder text)');
  }

  if (consoleErrors.length === 0) ok('zero console.error for empty groups');
  else fail('console.error for empty groups', consoleErrors.slice(0, 2).join('; '));
}

// ── Main ──────────────────────────────────────────────────────────────────────

const INDEX_HTML     = join(DASHBOARD_ROOT, 'index.html');
const PRO_INDEX_HTML = join(DASHBOARD_ROOT, 'pro', 'index.html');

console.log('render-check-programs.mjs -- Dashboard Programs panel (PCR-OPS-077)');
console.log('Fixture: tests/fixtures/programs-pcr077.json');

assertProgramsPanel(INDEX_HTML,     'index.html',     FIXTURE.programs);
assertEmptyGroupsContract(INDEX_HTML,     'index.html');
assertProgramsPanel(PRO_INDEX_HTML, 'pro/index.html', FIXTURE.programs);
assertEmptyGroupsContract(PRO_INDEX_HTML, 'pro/index.html');

console.log('\n' + '─'.repeat(40));
console.log(passed + ' passed, ' + failed + ' failed');
if (failed > 0) {
  console.error('\nrender-check-programs: FAILED');
  process.exit(1);
} else {
  console.log('\nrender-check-programs: all assertions passed');
}
