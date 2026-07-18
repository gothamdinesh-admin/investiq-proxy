#!/usr/bin/env node
/*
 * smoke-test.js — zero-dependency pre-flight for the InvestIQ / Harbour SPA.
 *
 * Not a browser test (the app is a static SPA with no build/test infra). It's a
 * fast STATIC gate that catches the regression classes we've actually shipped
 * bugs from this project:
 *   1. Syntax errors in the inline <script> blocks or any standalone/js module.
 *   2. A stale / inconsistent cache-buster (?b=…) across module tags — the
 *      "edited a module but the browser served the old one" bug.
 *   3. showSection('x') dispatching to a section id that has no #section-x in
 *      the DOM — the "added a nav item but the page is blank" bug.
 *
 * Run:  node scripts/smoke-test.js     (exit 0 = pass, 1 = fail)
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..', 'standalone');
const htmlPath = path.join(root, 'index.html');
const jsDir = path.join(root, 'js');
const html = fs.readFileSync(htmlPath, 'utf8');

const fails = [];
const pass = (m) => console.log('  ✓ ' + m);
const fail = (m) => { fails.push(m); console.log('  ✗ ' + m); };

// ── 1. Syntax: inline scripts + every module ──────────────────────────────
console.log('[1] Syntax');
let inlineOk = 0;
const reInline = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g;
let m;
while ((m = reInline.exec(html))) {
  const body = m[1];
  if (body.trim().length < 40) continue;
  // Skip only SHORT HTML-comment fragments the regex catches between tags —
  // never a real code block (the main inline script is ~600 KB and legitimately
  // contains '-->' inside strings/regexes, so it must still be parsed).
  if (/<!--|-->/.test(body) && body.trim().length < 200) continue;
  try { new vm.Script(body); inlineOk++; }
  catch (e) { fail(`inline block #${inlineOk + 1}: ${e.message}`); }
}
pass(`${inlineOk} inline script block(s) parse`);

const modules = fs.readdirSync(jsDir).filter(f => f.endsWith('.js')).sort();
modules.forEach(f => {
  try { new vm.Script(fs.readFileSync(path.join(jsDir, f), 'utf8')); }
  catch (e) { fail(`module ${f}: ${e.message}`); }
});
pass(`${modules.length} module(s) parse`);

// ── 2. Cache-buster consistency ───────────────────────────────────────────
console.log('[2] Cache-buster');
const busters = [...html.matchAll(/src="js\/[^"?]+\.js\?b=([^"]+)"/g)].map(x => x[1]);
const tagsNoBuster = [...html.matchAll(/src="js\/[^"?]+\.js"/g)].length;
if (!busters.length) fail('no module tags with ?b= found');
else if (tagsNoBuster) fail(`${tagsNoBuster} module tag(s) missing a ?b= buster`);
else if (new Set(busters).size !== 1) fail(`module tags have mixed busters: ${[...new Set(busters)].join(', ')}`);
else if (/^\d+$/.test(busters[0])) fail(`buster is a manual counter (?b=${busters[0]}) — run scripts/stamp-cache-bust.js`);
else pass(`${busters.length} module tags share one content-hash buster (?b=${busters[0]})`);

// ── 3. showSection targets exist ──────────────────────────────────────────
console.log('[3] Section dispatch');
// Strip comments so commented-out examples (e.g. onclick="showSection('x')")
// don't count as real dispatch targets.
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1').replace(/<!--[\s\S]*?-->/g, '');
const sources = stripComments(html + '\n' + modules.map(f => fs.readFileSync(path.join(jsDir, f), 'utf8')).join('\n'));
const sectionIds = new Set([...html.matchAll(/id="section-([a-z0-9_-]+)"/gi)].map(x => x[1]));
const targets = new Set([...sources.matchAll(/showSection\(\s*['"]([a-z0-9_-]+)['"]/gi)].map(x => x[1]));
const missing = [...targets].filter(t => !sectionIds.has(t));
if (missing.length) fail(`showSection() targets with no #section-… node: ${missing.join(', ')}`);
else pass(`${targets.size} showSection() target(s) all resolve to a section`);

// ── Result ────────────────────────────────────────────────────────────────
console.log('');
if (fails.length) { console.error(`SMOKE TEST FAILED — ${fails.length} issue(s).`); process.exit(1); }
console.log('SMOKE TEST PASSED.');
