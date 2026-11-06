import path from 'node:path';
import fs from 'node:fs/promises';
import { ExactName } from './filtering-reporter.mjs';

const expectationsDir = path.resolve(import.meta.dirname, '../expectations');

/**
 * Returns the path of the expectations file with the given name, e.g. `native-chromium`.
 */
export function expectationsPath(name) {
  return path.join(expectationsDir, `${name}.json`);
}

/**
 * Reads the expected failures from an expectations file, in the same format as `ignoredFailures`:
 * an object mapping each test file to the list of test names that are expected to fail.
 * Unlike other ignored failures, these must match the reported test name exactly.
 * A missing file means no failures are expected.
 */
export async function readExpectations(file) {
  let json;
  try {
    json = await fs.readFile(file, 'utf8');
  } catch (e) {
    if (e.code === 'ENOENT') {
      return {};
    }
    throw e;
  }
  const { failures } = JSON.parse(json);
  const result = {};
  for (const suite of Object.keys(failures)) {
    result[suite] = failures[suite].map(name => new ExactName(name));
  }
  return result;
}

/**
 * Writes the given failures (as returned by `FilteringReporter.getResults().failures`) to an expectations file.
 */
export async function writeExpectations(file, failures, metadata = {}) {
  const sorted = {};
  for (const suite of Object.keys(failures).sort()) {
    sorted[suite] = [...new Set(failures[suite])].sort();
  }
  const json = JSON.stringify({ ...metadata, failures: sorted }, null, 2) + '\n';
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, json);
}
