const { TransformStream } = require('../../../');

describe('ReadableStream regressions', () => {
  // https://github.com/MattiasBuelens/web-streams-polyfill/issues/66
  it('#66', async () => {
    const { readable, writable } = new TransformStream();

    const producer = (async () => {
      const writer = writable.getWriter();
      await writer.write('hello');
      // The async iterator releases its reader lock in the "close steps" of its pending read, which rejects the
      // reader's closed promise. However, ReadableStreamClose then tries to resolve that same closed promise.
      // This *should* be ignored (since the promise is already rejected), but instead would cause a TypeError.
      await writer.close();
    })();

    const consumer = (async () => {
      const results = [];
      for await (const chunk of readable) {
        results.push(chunk);
      }
      expect(results).toEqual(['hello']);
    })();

    await Promise.all([producer, consumer]);
  });
});
