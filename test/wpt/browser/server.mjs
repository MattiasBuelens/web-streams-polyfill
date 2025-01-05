import http from 'node:http';
import { AnyHtmlHandler, WindowHandler } from 'wpt-runner/lib/internal/serve.js';
import st from 'st';
import { URL, fileURLToPath } from 'url';
import fs from 'fs';

const testharnessPath = fileURLToPath(import.meta.resolve('wpt-runner/testharness/testharness.js'));
const idlharnessPath = fileURLToPath(import.meta.resolve('wpt-runner/testharness/idlharness.js'));
const webidl2jsPath = fileURLToPath(import.meta.resolve('wpt-runner/testharness/webidl2.js'));
const testdriverDummyPath = fileURLToPath(import.meta.resolve('wpt-runner/lib/testdriver-dummy.js'));

export function setupServer(testsPath, {
  rootURL = '/'
}) {
  if (!rootURL.startsWith('/')) {
    rootURL = '/' + rootURL;
  }
  if (!rootURL.endsWith('/')) {
    rootURL += '/';
  }

  const staticFileServer = st({ path: testsPath, url: rootURL, passthrough: true });

  const routes = [
    ['.window.html', new WindowHandler(testsPath, rootURL)],
    ['.any.html', new AnyHtmlHandler(testsPath, rootURL)]
  ];

  return http.createServer((req, res) => {
    const { pathname } = new URL(req.url, `http://${req.headers.host}`);

    for (const [pathNameSuffix, handler] of routes) {
      if (pathname.endsWith(pathNameSuffix)) {
        handler.handleRequest(req, res);
        return;
      }
    }

    switch (pathname) {
      case '/resources/testharness.js': {
        fs.createReadStream(testharnessPath).pipe(res);
        break;
      }

      case '/resources/idlharness.js': {
        fs.createReadStream(idlharnessPath).pipe(res);
        break;
      }

      case '/resources/WebIDLParser.js': {
        fs.createReadStream(webidl2jsPath).pipe(res);
        break;
      }

      case '/resources/testharnessreport.js': {
        res.end('');
        break;
      }

      case '/streams/resources/test-initializer.js': {
        res.end('window.worker_test = () => {};');
        break;
      }

      case '/resources/testharness.css': {
        res.end('');
        break;
      }

      case '/resources/testdriver.js': {
        fs.createReadStream(testdriverDummyPath).pipe(res);
        break;
      }

      case '/resources/testdriver-vendor.js': {
        res.end('');
        break;
      }

      case '/favicon.ico': {
        res.end('');
        break;
      }

      default: {
        staticFileServer(req, res, () => {
          throw new Error(`Unexpected URL: ${req.url}`);
        });
      }
    }
  }).listen();
}
