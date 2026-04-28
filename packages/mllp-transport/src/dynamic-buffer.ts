/**
 * A growable byte buffer with geometric capacity doubling.
 *
 * Designed for protocol decoders that accumulate bytes from arbitrarily
 * chunked TCP streams. Amortizes copy cost to O(n) total — the same
 * strategy used by pg-protocol, NATS.js, and Java's ArrayList.
 *
 * The buffer maintains a read offset so consumed bytes can be skipped
 * without shifting data. When the wasted prefix exceeds half the
 * capacity, the buffer auto-compacts by shifting remaining bytes to
 * the front.
 *
 * @internal
 */
export class DynamicBuffer {
  private _buffer: Uint8Array;
  private _length = 0;
  private _offset = 0;

  constructor(initialCapacity = 4096) {
    this._buffer = new Uint8Array(initialCapacity);
  }

  get capacity(): number {
    return this._buffer.length;
  }

  get available(): number {
    return this._length - this._offset;
  }

  append(chunk: Uint8Array): void {
    const needed = this._length + chunk.length;
    if (needed > this._buffer.length) {
      const newCapacity = Math.max(this._buffer.length * 2, needed);
      const newBuffer = new Uint8Array(newCapacity);
      newBuffer.set(this._buffer.subarray(0, this._length));
      this._buffer = newBuffer;
    }
    this._buffer.set(chunk, this._length);
    this._length += chunk.length;
  }

  view(): Uint8Array {
    return this._buffer.subarray(this._offset, this._length);
  }

  consume(n: number): void {
    this._offset += n;
    if (this._offset >= this._length) {
      this._offset = 0;
      this._length = 0;
      return;
    }
    if (this._offset > this._buffer.length / 2) {
      this._compact();
    }
  }

  reset(): void {
    this._offset = 0;
    this._length = 0;
  }

  private _compact(): void {
    const remaining = this._length - this._offset;
    this._buffer.copyWithin(0, this._offset, this._length);
    this._offset = 0;
    this._length = remaining;
  }
}
