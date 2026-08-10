// The closed error set. A file either measures or says why it cannot.

export class GlbInvalidError extends Error {
  constructor(detail) {
    super(`not a readable GLB: ${detail}`);
    this.code = "GLB_INVALID";
  }
}

export class GlbUnmeasurableError extends Error {
  constructor(detail) {
    super(`cannot measure this GLB: ${detail}`);
    this.code = "GLB_UNMEASURABLE";
  }
}
