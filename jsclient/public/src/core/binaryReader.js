// Little-endian binary cursor mirroring src/Zeven/FileIO.cpp.
//
// GOTCHA: FileIO::getInt() reads a *signed 16-bit short*, not an int32, and
// getUInt() reads a uint16. Only getLong()/getULong() are 32-bit. The getter
// names here match the C++ so ports can be read side by side - do not "fix" them.

export class BinaryReader {
  constructor(arrayBuffer, offset = 0) {
    this.view = new DataView(arrayBuffer);
    this.bytes = new Uint8Array(arrayBuffer);
    this.offset = offset;
  }

  get remaining() {
    return this.view.byteLength - this.offset;
  }

  getByte() {
    return this.view.getInt8(this.offset++);
  }

  getUByte() {
    return this.view.getUint8(this.offset++);
  }

  getShort() {
    const v = this.view.getInt16(this.offset, true);
    this.offset += 2;
    return v;
  }

  getUShort() {
    const v = this.view.getUint16(this.offset, true);
    this.offset += 2;
    return v;
  }

  /** 16-bit, per FileIO::getInt. */
  getInt() {
    return this.getShort();
  }

  /** 16-bit, per FileIO::getUInt. */
  getUInt() {
    return this.getUShort();
  }

  getLong() {
    const v = this.view.getInt32(this.offset, true);
    this.offset += 4;
    return v;
  }

  getULong() {
    const v = this.view.getUint32(this.offset, true);
    this.offset += 4;
    return v;
  }

  getFloat() {
    const v = this.view.getFloat32(this.offset, true);
    this.offset += 4;
    return v;
  }

  getVector3f() {
    return [this.getFloat(), this.getFloat(), this.getFloat()];
  }

  getByteArray(n) {
    const v = this.bytes.subarray(this.offset, this.offset + n);
    this.offset += n;
    return v;
  }

  /** Fixed-width NUL-terminated string, as written by CString into a char[n]. */
  getFixedString(n) {
    const raw = this.getByteArray(n);
    let end = raw.indexOf(0);
    if (end < 0) end = raw.length;
    return new TextDecoder('latin1').decode(raw.subarray(0, end));
  }
}
