import zlib from "node:zlib";

function makeCrcTable(): Uint32Array {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c;
  }
  return table;
}

const crcTable = makeCrcTable();

function crc32(buf: Buffer): number {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = crcTable[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/**
 * Creates a valid, rasterized PNG buffer of the given dimensions and solid color.
 * Generates true PNG format with magic signature \x89PNG\r\n\x1a\n and valid IHDR/IDAT/IEND chunks.
 */
export function createSolidPngBuffer(
  width: number,
  height: number,
  r = 255,
  g = 255,
  b = 255
): Buffer {
  const clampedWidth = Math.max(1, Math.min(4096, Math.round(width)));
  const clampedHeight = Math.max(1, Math.min(4096, Math.round(height)));

  const header = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR chunk
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(clampedWidth, 0);
  ihdrData.writeUInt32BE(clampedHeight, 4);
  ihdrData[8] = 8; // bit depth
  ihdrData[9] = 2; // RGB color type
  ihdrData[10] = 0; // compression method
  ihdrData[11] = 0; // filter method
  ihdrData[12] = 0; // interlace method

  const ihdrChunk = Buffer.concat([Buffer.from("IHDR"), ihdrData]);
  const ihdrCrc = Buffer.alloc(4);
  ihdrCrc.writeUInt32BE(crc32(ihdrChunk), 0);
  const ihdr = Buffer.concat([Buffer.alloc(4), ihdrChunk, ihdrCrc]);
  ihdr.writeUInt32BE(13, 0);

  // Scanlines with filter byte 0 (None)
  const rowSize = 1 + clampedWidth * 3;
  const rawData = Buffer.alloc(rowSize * clampedHeight);
  for (let y = 0; y < clampedHeight; y++) {
    const rowOffset = y * rowSize;
    rawData[rowOffset] = 0;
    for (let x = 0; x < clampedWidth; x++) {
      const pxOffset = rowOffset + 1 + x * 3;
      rawData[pxOffset] = r;
      rawData[pxOffset + 1] = g;
      rawData[pxOffset + 2] = b;
    }
  }

  // IDAT chunk
  const compressed = zlib.deflateSync(rawData);
  const idatChunk = Buffer.concat([Buffer.from("IDAT"), compressed]);
  const idatCrc = Buffer.alloc(4);
  idatCrc.writeUInt32BE(crc32(idatChunk), 0);
  const idat = Buffer.concat([Buffer.alloc(4), idatChunk, idatCrc]);
  idat.writeUInt32BE(compressed.length, 0);

  // IEND chunk
  const iendChunk = Buffer.from([0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130]);

  return Buffer.concat([header, ihdr, idat, iendChunk]);
}
