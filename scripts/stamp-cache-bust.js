#!/usr/bin/env node
/*
 * stamp-cache-bust.js — makes the module cache-buster automatic.
 *
 * The problem it solves: standalone/index.html loads ~15 JS modules as
 *   <script src="js/XX.js?b=NN">
 * The ?b= query is what forces browsers (and the Netlify CDN) to fetch a fresh
 * module after an edit. When it was bumped by hand it was easy to forget —
 * you'd edit a module, deploy, and the browser would keep serving the OLD file.
 *
 * This script derives the buster from a SHA-1 of every standalone/js/*.js file,
 * so it changes if and only if a module's content changes — no counter to
 * remember, no stale modules. Run manually (`node scripts/stamp-cache-bust.js`)
 * or let the pre-commit hook (.githooks/pre-commit) run it for you.
 *
 * Pure Node fs/crypto — no dependencies, safe to run anywhere.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const root = path.join(__dirname, '..', 'standalone');
const jsDir = path.join(root, 'js');
const htmlPath = path.join(root, 'index.html');

try {
  const files = fs.readdirSync(jsDir).filter(f => f.endsWith('.js')).sort();
  const h = crypto.createHash('sha1');
  files.forEach(f => h.update(fs.readFileSync(path.join(jsDir, f))));
  const hash = h.digest('hex').slice(0, 8);

  let html = fs.readFileSync(htmlPath, 'utf8');
  // Stamp every module tag whether or not it already carries a ?b=… query.
  const re = /(src="js\/[^"?]+\.js)(?:\?b=[^"]*)?"/g;
  const stamped = html.replace(re, `$1?b=${hash}"`);

  if (stamped !== html) {
    fs.writeFileSync(htmlPath, stamped);
    console.log(`[cache-bust] stamped ?b=${hash} on module <script> tags`);
  } else {
    console.log(`[cache-bust] already at ?b=${hash} — no change`);
  }
} catch (e) {
  // Never block a commit over cache-busting — worst case is the old behaviour.
  console.error('[cache-bust] skipped:', e.message);
  process.exit(0);
}
