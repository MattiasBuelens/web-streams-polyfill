import assert from '../stub/better-assert';
import { IsFiniteNonNegativeNumber } from './helpers';

export function DequeueValue(container) {
  assert('_queue' in container && '_queueTotalSize' in container);
  assert(container._queue.length > 0);

  const pair = container._queue.shift();
  container._queueTotalSize -= pair.size;
  if (container._queueTotalSize < 0) {
    container._queueTotalSize = 0;
  }

  return pair.value;
}

export function EnqueueValueWithSize(container, value, size) {
  assert('_queue' in container && '_queueTotalSize' in container);

  size = Number(size);
  if (!IsFiniteNonNegativeNumber(size)) {
    throw new RangeError('Size must be a finite, non-NaN, non-negative number.');
  }

  container._queue.push({ value, size });
  container._queueTotalSize += size;
}

export function PeekQueueValue(container) {
  assert('_queue' in container && '_queueTotalSize' in container);
  assert(container._queue.length > 0);

  const pair = container._queue[0];
  return pair.value;
}

export function ResetQueue(container) {
  assert('_queue' in container && '_queueTotalSize' in container);

  container._queue = [];
  container._queueTotalSize = 0;
}
