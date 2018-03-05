export class AssertionError extends Error {
}

export default function assert(test) {
  if (!test) {
    throw new AssertionError();
  }
}
