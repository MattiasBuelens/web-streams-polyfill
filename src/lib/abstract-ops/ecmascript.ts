export function CreateArrayFromList<T extends any[]>(elements: T): T {
  // We use arrays to represent lists, so this is basically a no-op.
  // Do a slice though just in case we happen to depend on the unique-ness.
  return elements.slice() as T;
}

export function CopyDataBlockBytes(dest: ArrayBuffer,
                                   destOffset: number,
                                   src: ArrayBuffer,
                                   srcOffset: number,
                                   n: number) {
  new Uint8Array(dest).set(new Uint8Array(src, srcOffset, n), destOffset);
}

// Not implemented correctly
export function TransferArrayBuffer<T extends ArrayBufferLike>(O: T): T {
  return O;
}

// Not implemented correctly
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function CanTransferArrayBuffer(O: ArrayBufferLike): boolean {
  return true;
}

// Not implemented correctly
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function IsDetachedBuffer(O: ArrayBufferLike): boolean {
  return false;
}

export function ArrayBufferSlice(buffer: ArrayBufferLike, begin: number, end: number): ArrayBufferLike {
  // ArrayBuffer.prototype.slice is not available on IE10
  // https://www.caniuse.com/mdn-javascript_builtins_arraybuffer_slice
  if (buffer.slice) {
    return buffer.slice(begin, end);
  }
  const length = end - begin;
  const slice = new ArrayBuffer(length);
  CopyDataBlockBytes(slice, 0, buffer, begin, length);
  return slice;
}
