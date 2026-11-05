// Runs a single .any.js test file inside a worker thread, in Node's own realm.
// Used for the --native and --patched runs, where the tests must see Node's own stream classes.
// jsdom always runs scripts in a separate realm, which breaks prototype and IDL checks on Node's streams.

/* global add_result_callback, add_completion_callback, done */
import { parentPort, workerData } from 'node:worker_threads';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { forceOwnTransformStream, hideNativeFeatures } from '../shared/force-features.mjs';
import { installSubclassGlobals } from '../shared/subclass-globals.mjs';

const { wptPath, testFile, featureInstaller, force, subclassModule } = workerData;

// The same rewrites as the WPT server (see tools/serve/serve.py)
const scriptRewrites = {
  '/resources/WebIDLParser.js': '/resources/webidl2/lib/webidl2.js'
};

function loadScript(filePath) {
  vm.runInThisContext(fs.readFileSync(filePath, 'utf8'), { filename: filePath });
}

function resolveScript(src) {
  src = scriptRewrites[src] ?? src;
  return src.startsWith('/') ? path.join(wptPath, src) : path.resolve(path.dirname(testFile), src);
}

globalThis.self = globalThis;
// Tell testharness.js that this is a worker-like environment without DOM
globalThis.GLOBAL = {
  isWindow: () => false,
  isWorker: () => false,
  isShadowRealm: () => false
};
globalThis.fetch = async function fetch(url) {
  const filePath = path.join(wptPath, String(url));
  if (!filePath.startsWith(wptPath)) {
    throw new TypeError('Invalid URL');
  }
  return {
    ok: true,
    async text() {
      return await fs.promises.readFile(filePath, 'utf8');
    }
  };
};

const unhandledRejections = [];
process.on('unhandledRejection', (reason) => {
  unhandledRejections.push(String(reason?.stack ?? reason));
});

if (featureInstaller) {
  // Node implements every feature already, so hide the native ones first.
  hideNativeFeatures(globalThis);
  const { installAll } = await import(featureInstaller);
  const report = installAll(globalThis);
  if (!report.success || report.installed.length !== 4) {
    throw new Error(`Failed to install the feature modules: ${report.installed.join(', ')}`);
  }
  if (force) {
    forceOwnTransformStream(globalThis);
  }
}

if (subclassModule) {
  // Node implements every feature already, so hide the native ones first.
  hideNativeFeatures(globalThis);
  // Replace the global classes with their subclasses, and check that the features were installed on them.
  installSubclassGlobals(globalThis, await import(subclassModule));
  if (typeof ReadableStream.from !== 'function' || typeof ReadableStream.prototype.values !== 'function') {
    throw new Error('Failed to install the feature modules on the subclasses');
  }
}

loadScript(path.join(wptPath, 'resources/testharness.js'));

// idlharness.js checks exposure based on the kind of global object.
// A worker thread is closest to a dedicated worker.
// (Define this only after loading testharness.js, which would otherwise expect a real worker.)
Object.defineProperty(globalThis, 'DedicatedWorkerGlobalScope', {
  value: Object.defineProperty(function DedicatedWorkerGlobalScope() {}, Symbol.hasInstance, {
    value: object => object === globalThis
  }),
  writable: true,
  configurable: true
});

const results = [];
add_result_callback(({ name, status, message, stack }) => {
  results.push({ name, status, message, stack });
});
add_completion_callback((tests, { status, message, stack }) => {
  parentPort.postMessage({ results, harnessStatus: { status, message, stack }, unhandledRejections });
});

const source = fs.readFileSync(testFile, 'utf8');
for (const [, src] of source.matchAll(/^\/\/\s*META:\s*script=(.+)$/gmu)) {
  loadScript(resolveScript(src.trim()));
}
loadScript(testFile);
done();
