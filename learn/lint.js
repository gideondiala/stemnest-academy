/**
 * Style check for Learning Hub writing: no em/en dashes, and none of the
 * stock phrases that make writing sound machine-made.
 *   node lint.js            check content/ and build.js
 */
const fs = require('fs'), path = require('path');
const BANNED = [
  /[—–]/, /\bdelve\b/i, /\bdive (in|into)\b/i, /let's dive/i, /in today's (fast-paced|digital)/i, /\bgame[- ]changer\b/i,
  /\bunlock (the|your)\b/i, /\btapestry\b/i, /\bembark\b/i, /\bin conclusion\b/i, /\bnavigat(e|ing) the (world|landscape)\b/i,
  /\bever-evolving\b/i, /\brealm of\b/i, /\bseamless(ly)?\b/i, /\bharness the power\b/i, /\bit's important to note\b/i,
  /\bin summary\b/i, /\bwhether you're a\b/i, /\bbuckle up\b/i, /\belevate\b/i, /\bunleash\b/i, /\btestament to\b/i,
];
const files = [];
(function walk(d) { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); if (fs.statSync(p).isDirectory()) walk(p); else if (f.endsWith('.md')) files.push(p); } })(path.join(__dirname, 'content'));
files.push(path.join(__dirname, 'build.js'));
let bad = 0;
for (const f of files) {
  const lines = fs.readFileSync(f, 'utf8').split('\n');
  let inCode = false;
  lines.forEach((l, i) => {
    if (/^```/.test(l)) inCode = !inCode;
    if (inCode && f.endsWith('.md')) return;
    for (const re of BANNED) if (re.test(l)) { bad++; console.log(`${path.relative(__dirname, f)}:${i + 1}  [${re.source}]  ${l.trim().slice(0, 110)}`); break; }
  });
}
console.log(bad ? `\n${bad} line(s) to fix` : 'Style check passed');
process.exitCode = bad ? 1 : 0;
