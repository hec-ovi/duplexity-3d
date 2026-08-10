// The GLB container: a 12 byte header, then chunks. The JSON chunk is the whole glTF document; the
// binary chunk is the geometry it points at. Nothing here reads geometry, so the binary chunk is
// located and handed on, never parsed.

import { GlbInvalidError } from "./errors.js";

const MAGIC = 0x46546c67; // "glTF"
const CHUNK_JSON = 0x4e4f534a;
const CHUNK_BIN = 0x004e4942;
const HEADER = 12;
const CHUNK_HEADER = 8;

/**
 * Split GLB bytes into the glTF document and the binary chunk.
 *
 * @param {Uint8Array|ArrayBuffer} bytes
 * @returns {{ json: object, bin: Uint8Array|null, bytes: number }}
 */
export function readContainer(bytes) {
  const buf = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (buf.byteLength < HEADER) throw new GlbInvalidError("shorter than a GLB header");

  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  if (view.getUint32(0, true) !== MAGIC) throw new GlbInvalidError("not a GLB: the file does not start with glTF");
  const version = view.getUint32(4, true);
  if (version !== 2) throw new GlbInvalidError(`GLB version ${version} is not glTF 2.0`);
  const declared = view.getUint32(8, true);
  if (declared > buf.byteLength) throw new GlbInvalidError("the file is shorter than its own header says");

  let json = null;
  let bin = null;
  let at = HEADER;
  while (at + CHUNK_HEADER <= declared) {
    const length = view.getUint32(at, true);
    const type = view.getUint32(at + 4, true);
    const start = at + CHUNK_HEADER;
    if (start + length > declared) throw new GlbInvalidError("a chunk runs past the end of the file");
    if (type === CHUNK_JSON && json === null) {
      json = JSON.parse(new TextDecoder().decode(buf.subarray(start, start + length)));
    } else if (type === CHUNK_BIN && bin === null) {
      bin = buf.subarray(start, start + length);
    }
    at = start + length + ((4 - (length % 4)) % 4); // chunks are padded to four bytes
  }

  if (json === null) throw new GlbInvalidError("no JSON chunk: there is no glTF document in this file");
  return { json, bin, bytes: buf.byteLength };
}
