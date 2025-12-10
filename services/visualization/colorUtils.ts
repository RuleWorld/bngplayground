/**
 * Convert a string into a deterministic hex color.
 * Port of the bnglViz `String.prototype.rgb` hashing used to derive molecule/site colors.
 */
export function hashStringTo24Bit(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i += 1) {
    h = (h << 5) - h + s.charCodeAt(i);
    h |= 0; // keep 32-bit
  }
  // map to 24-bit
  return h >>> 0 & 0xffffff;
}

export function toHexColor(n: number): string {
  const hex = (n & 0xffffff).toString(16).padStart(6, '0');
  return `#${hex}`;
}

export function colorFromName(name: string): string {
  const base = hashStringTo24Bit(name);
  // Slightly brighten to avoid very dark colors
  const bright = brightenRgb(base, 0.12);
  return toHexColor(bright);
}

export function brightenRgb(hex24: number, factor = 0.15): number {
  const r = (hex24 >> 16) & 0xff;
  const g = (hex24 >> 8) & 0xff;
  const b = hex24 & 0xff;
  const nr = Math.min(255, Math.floor(r + (255 - r) * factor));
  const ng = Math.min(255, Math.floor(g + (255 - g) * factor));
  const nb = Math.min(255, Math.floor(b + (255 - b) * factor));
  return (nr << 16) | (ng << 8) | nb;
}

export function luminance(hex: string): number {
  const c = hex.replace('#', '');
  const r = parseInt(c.substring(0, 2), 16) / 255;
  const g = parseInt(c.substring(2, 4), 16) / 255;
  const b = parseInt(c.substring(4, 6), 16) / 255;
  // sRGB luminance
  const srgb = [r, g, b].map((u) => (u <= 0.03928 ? u / 12.92 : Math.pow((u + 0.055) / 1.055, 2.4)));
  return 0.2126 * srgb[0] + 0.7152 * srgb[1] + 0.0722 * srgb[2];
}

export function foregroundForBackground(hex: string): string {
  // If luminance is bright, return dark text; otherwise return white
  // Lowered threshold (0.35 instead of 0.4) for better contrast on darker colors
  return luminance(hex) > 0.35 ? '#0f172a' : '#ffffff';
}
