// Prints the size of each bundle, compared with the latest release when it is installed
// (as `web-streams-polyfill-baseline` in the benchmark-test workspace).
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const root = path.resolve(import.meta.dirname, '..');
const distDir = path.join(root, 'dist');
const baselineDir = path.join(root, 'node_modules/web-streams-polyfill-baseline/dist');
const hasBaseline = fs.existsSync(baselineDir);

function sizes(file) {
  if (!fs.existsSync(file)) {
    return undefined;
  }
  const contents = fs.readFileSync(file);
  return {
    raw: contents.length,
    gzip: zlib.gzipSync(contents, { level: 9 }).length,
    brotli: zlib.brotliCompressSync(contents).length
  };
}

const kB = bytes => `${(bytes / 1000).toFixed(2)} kB`;
const delta = (now, before) => {
  if (before === undefined) {
    return '';
  }
  const percent = (now - before) / before * 100;
  return ` (${percent >= 0 ? '+' : ''}${percent.toFixed(1)}%)`;
};

// Bundles that were renamed since the baseline release.
const baselineNames = {
  'replace.js': 'polyfill.js',
  'replace.es5.js': 'polyfill.es5.js'
};

const rows = [['File', 'Size', 'Gzip', 'Brotli']];
const names = fs.readdirSync(distDir, { recursive: true })
  .filter(name => fs.statSync(path.join(distDir, name)).isFile())
  .map(name => name.split(path.sep).join('/'))
  .sort();
for (const name of names) {
  const now = sizes(path.join(distDir, name));
  const before = hasBaseline ? sizes(path.join(baselineDir, baselineNames[name] ?? name)) : undefined;
  rows.push([
    name,
    kB(now.raw) + delta(now.raw, before?.raw),
    kB(now.gzip) + delta(now.gzip, before?.gzip),
    kB(now.brotli) + delta(now.brotli, before?.brotli)
  ]);
}

if (hasBaseline) {
  const { version } = JSON.parse(fs.readFileSync(path.join(baselineDir, '../package.json'), 'utf8'));
  console.log(`Compared with web-streams-polyfill v${version}.\n`);
}
console.log(`| ${rows[0].join(' | ')} |`);
console.log(`|${rows[0].map((_, i) => (i === 0 ? ' --- ' : ' ---: ')).join('|')}|`);
for (const row of rows.slice(1)) {
  console.log(`| ${row.join(' | ')} |`);
}
