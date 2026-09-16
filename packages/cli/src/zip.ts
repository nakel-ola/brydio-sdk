import { crc32, deflateRawSync } from 'node:zlib';

/**
 * A zip of a built bundle, for `brydio publish` to upload.
 *
 * Brydio reads an upload with the same archive reader an app import goes
 * through (`extensions/skills/skill-archive.ts`), which refuses a symlink, a
 * path that climbs out, a hidden file and a size that lies. A bundle has
 * none of those, so this writes only what that reader looks at: a local
 * header and deflated bytes per file, the central directory, and the end
 * record. No zip64 (a bundle is at most 1 MB), no data descriptors, and no
 * timestamps, so the same files always make the same bytes.
 */

const LOCAL = 0x04034b50;
const CENTRAL = 0x02014b50;
const END = 0x06054b50;
/** An ordinary file, readable by everyone, in a unix zip's external attributes. */
const FILE_MODE = 0o100644;

export function zipFiles(files: ReadonlyMap<string, Uint8Array>): Uint8Array {
  const parts: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;

  for (const path of [...files.keys()].sort()) {
    const bytes = files.get(path)!;
    const name = new TextEncoder().encode(path);
    const deflated = deflateRawSync(bytes);
    const sum = crc32(bytes);
    const local = Buffer.alloc(30);

    local.writeUInt32LE(LOCAL, 0);
    local.writeUInt16LE(20, 4);
    // Bit 11: the name is UTF-8. A bundle path is ASCII, but saying so costs nothing.
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(8, 8);
    local.writeUInt16LE(0x0021, 12);
    local.writeUInt32LE(sum, 14);
    local.writeUInt32LE(deflated.byteLength, 18);
    local.writeUInt32LE(bytes.byteLength, 22);
    local.writeUInt16LE(name.byteLength, 26);

    const central = Buffer.alloc(46);

    central.writeUInt32LE(CENTRAL, 0);
    central.writeUInt16LE(0x031e, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt16LE(0x0021, 14);
    central.writeUInt32LE(sum, 16);
    central.writeUInt32LE(deflated.byteLength, 20);
    central.writeUInt32LE(bytes.byteLength, 24);
    central.writeUInt16LE(name.byteLength, 28);
    // `>>> 0`: a shift is signed in JavaScript, and the mode's top bit is set.
    central.writeUInt32LE((FILE_MODE << 16) >>> 0, 38);
    central.writeUInt32LE(offset, 42);

    parts.push(local, name, deflated);
    centrals.push(central, name);
    offset += local.byteLength + name.byteLength + deflated.byteLength;
  }

  const directory = Buffer.concat(centrals);
  const end = Buffer.alloc(22);

  end.writeUInt32LE(END, 0);
  end.writeUInt16LE(files.size, 8);
  end.writeUInt16LE(files.size, 10);
  end.writeUInt32LE(directory.byteLength, 12);
  end.writeUInt32LE(offset, 16);

  return new Uint8Array(Buffer.concat([...parts, directory, end]));
}
