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

  // It is not sufficient for our brand checks to check if a (supposedly internal) field exists,
  // since a stream from a different version of the polyfill would also have such a field.
  // We must also check if the given stream was constructed with a class from *this* version of the polyfill.
  // https://github.com/MattiasBuelens/web-streams-polyfill/issues/75
  // TODO Consider using private symbols or #private fields for brand checks instead? (see #70)
  describe('issue #75', () => {
    it('ReadableStream', () => {
      const fakeReadable = {
        _readableStreamController: {}
      };
      const getReader = ReadableStream.prototype.getReader;
      expect(() => getReader.call(fakeReadable)).toThrow(jasmine.any(TypeError));
    });
    it('WritableStream', () => {
      const fakeWritable = {
        _writableStreamController: {}
      };
      const getWriter = WritableStream.prototype.getWriter;
      expect(() => getWriter.call(fakeWritable)).toThrow(jasmine.any(TypeError));
    });
    it('TransformStream', () => {
      const fakeTransformStream = {
        _transformStreamController: {}
      };
      const readableGetter = Object.getOwnPropertyDescriptor(TransformStream.prototype, 'readable');
      expect(() => readableGetter.call(fakeTransformStream)).toThrow(jasmine.any(TypeError));
    });
  });
});
