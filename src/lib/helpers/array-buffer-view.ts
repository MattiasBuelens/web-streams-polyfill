export type TypedArray =
  | Int8Array
  | Uint8Array
  | Uint8ClampedArray
  | Int16Array
  | Uint16Array
  | Int32Array
  | Uint32Array
  | Float32Array
  | Float64Array;

export type NonShared<T extends ArrayBufferView> = T & {
  buffer: ArrayBuffer;
};

export interface ArrayBufferViewConstructor<T extends ArrayBufferView = ArrayBufferView> {
  new(buffer: ArrayBuffer, byteOffset: number, length?: number): T;

  readonly prototype: T;
}

export interface TypedArrayConstructor<T extends TypedArray = TypedArray> extends ArrayBufferViewConstructor<T> {
  readonly BYTES_PER_ELEMENT: number;
}

export type DataViewConstructor = ArrayBufferViewConstructor<DataView>;

function isDataViewConstructor(ctor: ArrayBufferView['constructor']): ctor is DataViewConstructor {
  return ctor === DataView;
}

export function isDataView(view: ArrayBufferView): view is DataView {
  return isDataViewConstructor(view.constructor);
}

export function arrayBufferViewElementSize<T extends ArrayBufferView>(ctor: ArrayBufferViewConstructor<T>): number {
  if (isDataViewConstructor(ctor)) {
    return 1;
  }
  return (ctor as unknown as TypedArrayConstructor).BYTES_PER_ELEMENT;
}
