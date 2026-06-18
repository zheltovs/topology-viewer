/**
 * GDSII stores floating-point values in REAL_8 records using the legacy
 * base-16 (IBM System/360 "hexadecimal") floating-point format — NOT IEEE 754.
 * This is the format the Calma spec defines and what mainstream writers
 * (KLayout, Cadence, Magic, gdspy, ...) emit for UNITS / MAG / ANGLE.
 *
 * Layout of the 8 bytes:
 *   byte 0, bit 7      : sign
 *   byte 0, bits 6..0  : 7-bit base-16 exponent, biased by 64
 *   bytes 1..7         : 56-bit mantissa; binary point sits just left of bit 8,
 *                        so the mantissa is a fraction in [1/16, 1) when normalized
 *
 *   value = (-1)^sign * (mantissa / 2^56) * 16^(exponent - 64)
 */
export function readGdsReal8(view: DataView, offset: number): number {
  const b0 = view.getUint8(offset);
  const sign = b0 & 0x80 ? -1 : 1;
  const exponent = b0 & 0x7f; // base-16, biased by 64

  // Assemble the 56-bit unsigned mantissa (big-endian) from bytes 1..7.
  let mantissa = 0;
  for (let i = 1; i < 8; i++) {
    mantissa = mantissa * 256 + view.getUint8(offset + i);
  }
  if (mantissa === 0) return 0;

  const fraction = mantissa / Math.pow(2, 56);
  return sign * fraction * Math.pow(16, exponent - 64);
}

/**
 * Reads an ASCII string of the given byte length. GDSII strings are not
 * NUL-terminated; trailing space padding (0x20) is stripped.
 */
export function readGdsString(view: DataView, offset: number, length: number): string {
  let end = length;
  // Trim a single trailing NUL if a writer emitted one.
  if (end > 0 && view.getUint8(offset + end - 1) === 0) end--;
  let s = '';
  for (let i = 0; i < end; i++) s += String.fromCharCode(view.getUint8(offset + i));
  return s.replace(/\s+$/, '');
}
