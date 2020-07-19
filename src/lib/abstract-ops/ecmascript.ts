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
export function IsDetachedBuffer(O: ArrayBufferLike): boolean { // eslint-disable-line @typescript-eslint/no-unused-vars
  return false;
}
