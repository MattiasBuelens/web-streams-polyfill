/*
 * This test verifies that the polyfill's type definitions correctly augment TypeScript's built-in DOM types.
 */
import '../../dist/types/polyfill';

const readable = new ReadableStream<Uint8Array>({
  // TODO Figure out a way to augment the type of "declare var ReadableStream"?
  // type: 'bytes'
});

const defaultReader = readable.getReader();
defaultReader.closed.catch(() => undefined);
defaultReader.read().then(result => {
  const done: boolean = result.done;
  if (result.done) {
    const value: undefined = result.value;
  } else {
    const value: Uint8Array = result.value;
  }
});
defaultReader.releaseLock();

const byobReader = readable.getReader({ mode: 'byob' });
byobReader.closed.catch(() => undefined);
byobReader.read(new Uint32Array(3)).then(result => {
  const done: boolean = result.done;
  if (result.done) {
    const value: Uint32Array | undefined = result.value;
  } else {
    const value: Uint32Array = result.value;
  }
});
byobReader.releaseLock();

readable.pipeTo(new WritableStream(), {
  preventAbort: true,
  preventCancel: true,
  preventClose: true,
  signal: new AbortController().signal
}).catch(() => undefined);

readable.pipeThrough(new TransformStream());

const [branch1, branch2] = readable.tee();

const iterator1 = readable[Symbol.asyncIterator]();
const iterator2 = readable.values({ preventCancel: true });
