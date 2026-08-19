// TGA decoder covering everything shipped in Content/main: uncompressed (type 2/3)
// and RLE (type 10/11), 8/16/24/32 bpp. Returns RGBA8 in top-left origin order.

function decodePixel(out, o, src, s, bpp) {
  switch (bpp) {
    case 8: {
      const v = src[s];
      out[o] = v;
      out[o + 1] = v;
      out[o + 2] = v;
      out[o + 3] = 255;
      break;
    }
    case 16: {
      // A1R5G5B5
      const v = src[s] | (src[s + 1] << 8);
      out[o] = ((v >> 10) & 31) * 255 / 31;
      out[o + 1] = ((v >> 5) & 31) * 255 / 31;
      out[o + 2] = (v & 31) * 255 / 31;
      out[o + 3] = v & 0x8000 ? 255 : 0;
      break;
    }
    case 24:
      out[o] = src[s + 2];
      out[o + 1] = src[s + 1];
      out[o + 2] = src[s];
      out[o + 3] = 255;
      break;
    default:
      out[o] = src[s + 2];
      out[o + 1] = src[s + 1];
      out[o + 2] = src[s];
      out[o + 3] = src[s + 3];
      break;
  }
}

/**
 * @param {ArrayBuffer} buffer
 * @returns {{width:number,height:number,pixels:Uint8Array}} RGBA, row 0 = top
 */
export function decodeTGA(buffer) {
  const b = new Uint8Array(buffer);
  const idLength = b[0];
  const colorMapType = b[1];
  const imageType = b[2];
  const width = b[12] | (b[13] << 8);
  const height = b[14] | (b[15] << 8);
  const bpp = b[16];
  const descriptor = b[17];

  if (colorMapType !== 0) throw new Error('TGA: color-mapped images not supported');
  if (imageType !== 2 && imageType !== 3 && imageType !== 10 && imageType !== 11) {
    throw new Error(`TGA: unsupported image type ${imageType}`);
  }

  const bytesPerPixel = bpp >> 3;
  let p = 18 + idLength;
  const pixelCount = width * height;
  const linear = new Uint8Array(pixelCount * 4);

  if (imageType === 10 || imageType === 11) {
    let i = 0;
    while (i < pixelCount) {
      const packet = b[p++];
      const count = (packet & 0x7f) + 1;
      if (packet & 0x80) {
        for (let n = 0; n < count; n++) decodePixel(linear, (i + n) * 4, b, p, bpp);
        p += bytesPerPixel;
      } else {
        for (let n = 0; n < count; n++) decodePixel(linear, (i + n) * 4, b, p + n * bytesPerPixel, bpp);
        p += count * bytesPerPixel;
      }
      i += count;
    }
  } else {
    for (let i = 0; i < pixelCount; i++) decodePixel(linear, i * 4, b, p + i * bytesPerPixel, bpp);
  }

  // Bit 5 of the descriptor set means the first row is already the top one.
  const topDown = (descriptor & 0x20) !== 0;
  if (topDown) return { width, height, pixels: linear };

  const flipped = new Uint8Array(linear.length);
  const stride = width * 4;
  for (let y = 0; y < height; y++) {
    flipped.set(linear.subarray((height - 1 - y) * stride, (height - y) * stride), y * stride);
  }
  return { width, height, pixels: flipped };
}
