import assert from '../stub/assert';
import { IsFiniteNonNegativeNumber } from './helpers';
import { SimpleQueue } from './simple-queue';

export interface QueueContainer<T> {
  _queue: SimpleQueue<T>;
  _queueTotalSize: number;
}

export interface QueuePair<T> {
  value: T;
  size: number;
}

export function DequeueValue<T>(container: QueueContainer<QueuePair<T>>): T {
  assert('_queue' in container && '_queueTotalSize' in container);
  assert(container._queue.length > 0);

  const pair = container._queue.shift()!;
  container._queueTotalSize -= pair.size;
  if (container._queueTotalSize < 0) {
    container._queueTotalSize = 0;
  }

  return pair.value;
}

export function EnqueueValueWithSize<T>(container: QueueContainer<QueuePair<T>>, value: T, size: number) {
  assert('_queue' in container && '_queueTotalSize' in container);

  size = Number(size);
  if (!IsFiniteNonNegativeNumber(size)) {
    throw new RangeError('Size must be a finite, non-NaN, non-negative number.');
  }

  container._queue.push({ value, size });
  container._queueTotalSize += size;
}

export function PeekQueueValue<T>(container: QueueContainer<QueuePair<T>>): T {
  assert('_queue' in container && '_queueTotalSize' in container);
  assert(container._queue.length > 0);

  const pair = container._queue.peek();
  return pair.value;
}

export function ResetQueue<T>(container: QueueContainer<T>) {
  assert('_queue' in container && '_queueTotalSize' in container);

  container._queue = new SimpleQueue<T>();
  container._queueTotalSize = 0;
}
