// A greyscale "depth" picture of a flat ground plane, for the ControlNet depth mode (near = bright).
// Inverse depth of a plane is linear in the image row below the horizon, so the ramp is a plain
// vertical gradient: black down to `horizon`, then 0..255 by row `bottom`. Dependency-free PNG.
import zlib from 'node:zlib';

// 8-bit PNG from raw scanlines (each row starts with a filter byte 0); colour type 0 = greyscale, 2 = RGB.
export function encodePng(w, h, colorType, raw) {
  const chunk = (type, data) => {
    const body = Buffer.concat([Buffer.from(type), data]);
    const len = Buffer.alloc(4), crc = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    crc.writeUInt32BE(zlib.crc32(body));
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = colorType;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

export function groundRamp(w, h, horizon, bottom) {
  const row = w + 1; // one filter byte (0) + w pixels per row
  const raw = Buffer.alloc(row * h);
  for (let y = 0; y < h; y++) {
    const v = y <= horizon ? 0 : Math.round(255 * Math.min(1, (y - horizon) / (bottom - horizon)));
    raw.fill(v, y * row + 1, (y + 1) * row);
  }
  return encodePng(w, h, 0, raw);
}
