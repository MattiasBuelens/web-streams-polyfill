class FakeAbortSignal {
  constructor(aborted) {
    this.aborted = aborted;
  }

  addEventListener(type, listener) {
    return;
  }

  removeEventListener(type, listener) {
    return;
  }
}

module.exports = {
  FakeAbortSignal
};
