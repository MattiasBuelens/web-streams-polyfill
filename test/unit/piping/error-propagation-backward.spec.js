const { recordingReadableStream, recordingWritableStream } = require('../util/recording-streams');

describe('Piping: backwards error propagation', () => {
  let error1;
  beforeEach(() => {
    error1 = new Error('error1!');
    error1.name = 'error1';
  });

  // This test replaces the skipped WPT test with the same name.
  // Original: https://github.com/web-platform-tests/wpt/blob/e1e713c842e54ea0a9410ddc988b63d0e1d31973/streams/piping/error-propagation-backward.any.js#L403-L419
  it('Errors must be propagated backward: becomes errored after piping; preventCancel = true', async () => {
    const rs = recordingReadableStream();
    const ws = recordingWritableStream();
    const pipePromise = rs.pipeTo(ws, { preventCancel: true });
    pipePromise.catch(() => undefined);

    await new Promise(r => setTimeout(r, 10));
    ws.controller.error(error1);

    // Non-standard: enqueue a chunk, so reader.read() resolves and pipeTo() can release its lock.
    await new Promise(r => setTimeout(r, 10));
    rs.controller.enqueue('a');

    await expectAsync(pipePromise).withContext('pipeTo must reject with the same error').toBeRejectedWith(error1);
    expect(rs.eventsWithoutPulls).toEqual([]);
    expect(ws.events).toEqual([]);
  });
});
