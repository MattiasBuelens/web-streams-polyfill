const { recordingReadableStream, recordingWritableStream } = require('../util/recording-streams');

describe('Piping: multiple propagation', () => {
  let error1;
  let error2;
  beforeEach(() => {
    error1 = new Error('error1!');
    error1.name = 'error1';
    error2 = new Error('error2!');
    error2.name = 'error2';
  });

  // This test replaces the skipped WPT test with the same name.
  // Original: https://github.com/web-platform-tests/wpt/blob/e1e713c842e54ea0a9410ddc988b63d0e1d31973/streams/piping/multiple-propagation.any.js#L30-L53
  it('Piping from an errored readable stream to an erroring writable stream', async () => {
    const rs = recordingReadableStream({
      start(c) {
        c.error(error1);
      }
    });
    const ws = recordingWritableStream({
      start(c) {
        c.error(error2);
      }
    });

    // Non-standard: this should reject with the writable's error,
    // but the polyfill rejects with the readable's error instead.
    await expectAsync(rs.pipeTo(ws))
      .withContext('pipeTo must reject with the readable stream\'s error')
      .toBeRejectedWith(error1);
    expect(rs.events).toEqual([]);
    expect(ws.events).toEqual([]);

    await Promise.all([
      expectAsync(rs.getReader().closed)
        .withContext('the readable stream must be errored with error1')
        .toBeRejectedWith(error1),
      expectAsync(ws.getWriter().closed)
        .withContext('the writable stream must be errored with error2')
        .toBeRejectedWith(error2)
    ]);
  });

  // Original: https://github.com/web-platform-tests/wpt/blob/e1e713c842e54ea0a9410ddc988b63d0e1d31973/streams/piping/multiple-propagation.any.js#L114-L138
  it('Piping from an errored readable stream to a closing writable stream', async () => {
    const rs = recordingReadableStream({
      start(c) {
        c.error(error1);
      }
    });
    const ws = recordingWritableStream();
    const writer = ws.getWriter();
    const closePromise = writer.close();
    closePromise.catch(() => undefined);
    writer.releaseLock();

    await expectAsync(rs.pipeTo(ws))
      .withContext('pipeTo must reject with the readable stream\'s error')
      .toBeRejectedWith(error1);
    expect(rs.events).toEqual([]);
    // Non-standard: the writable stream should be errored, but instead it closes successfully.
    expect(ws.events).toEqual(['close']);

    await Promise.all([
      expectAsync(rs.getReader().closed)
        .withContext('the readable stream must be errored with error1')
        .toBeRejectedWith(error1),
      // Non-standard: writer.closed should reject, but instead it resolves.
      expectAsync(ws.getWriter().closed)
        .withContext('closed must resolve')
        .toBeResolvedTo(undefined),
      // Non-standard: writer.close() should reject, but instead it resolves.
      expectAsync(closePromise)
        .withContext('close() must resolve')
        .toBeResolvedTo(undefined)
    ]);
  });
});
