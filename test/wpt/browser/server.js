const http = require('http');
const path = require('path');
const fs = require('fs');
const { URL } = require('url');
const st = require('st');
const { AnyHtmlHandler, WindowHandler } = require('wpt-runner/lib/internal/serve.js');

const testharnessPath = path.resolve(__dirname, '../../web-platform-tests/resources/testharness.js');
const idlharnessPath = path.resolve(__dirname, '../../web-platform-tests/resources/idlharness.js');
const webidl2jsPath = path.resolve(__dirname, '../../web-platform-tests/resources/webidl2/lib/webidl2.js');
const testdriverDummyPath = require.resolve('wpt-runner/lib/testdriver-dummy.js');

function setupServer(testsPath, {
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
    staticFileServer(req, res, () => {
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

        case '/service-workers/service-worker/resources/test-helpers.sub.js': {
          res.end('window.service_worker_test = () => {};');
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
          throw new Error(`Unexpected URL: ${req.url}`);
        }
      }
    });
  }).listen();
}

exports.setupServer = setupServer;
