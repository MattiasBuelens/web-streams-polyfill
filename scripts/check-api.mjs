// Checks that the public API (the bundled type definitions) matches the committed API snapshot.
// Run `npm run accept:api` after an intentional API change to update the snapshot.
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const actualPath = path.join(root, 'types/ponyfill.d.ts');
const snapshotPath = path.join(root, 'etc/ponyfill.api.d.ts');
const accept = process.argv.includes('--accept');

const read = file => fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');

if (!fs.existsSync(actualPath)) {
  console.error(`${path.relative(root, actualPath)} not found. Run \`npm run build\` first.`);
  process.exit(1);
}
const actual = read(actualPath);

if (accept) {
  fs.mkdirSync(path.dirname(snapshotPath), { recursive: true });
  fs.writeFileSync(snapshotPath, actual);
  console.log(`Updated ${path.relative(root, snapshotPath)}.`);
  process.exit(0);
}

const expected = fs.existsSync(snapshotPath) ? read(snapshotPath) : '';
if (actual === expected) {
  console.log('Public API matches the snapshot.');
  process.exit(0);
}

const actualLines = actual.split('\n');
const expectedLines = expected.split('\n');
let line = 0;
while (line < actualLines.length && actualLines[line] === expectedLines[line]) {
  line++;
}
console.error(`The public API changed, starting at line ${line + 1} of ${path.relative(root, actualPath)}:`);
console.error(`  snapshot: ${expectedLines[line] ?? '<end of file>'}`);
console.error(`  build:    ${actualLines[line] ?? '<end of file>'}`);
console.error('If this change is intentional, run `npm run accept:api` and commit etc/ponyfill.api.d.ts.');
process.exit(1);
