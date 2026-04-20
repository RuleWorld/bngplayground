import { describe, it, expect } from 'vitest';
import {
  hashStringTo24Bit,
  toHexColor,
  colorFromName,
  brightenRgb,
  luminance,
  foregroundForBackground,
} from '../../services/visualization/colorUtils';

describe('colorUtils', () => {
  describe('hashStringTo24Bit', () => {
    it('returns 0 for an empty string', () => {
      expect(hashStringTo24Bit('')).toBe(0);
    });

    it('returns a deterministic number for a given string', () => {
      const hash1 = hashStringTo24Bit('moleculeA');
      const hash2 = hashStringTo24Bit('moleculeA');
      expect(hash1).toBe(hash2);
      expect(typeof hash1).toBe('number');
    });

    it('produces different hashes for different strings', () => {
      const hash1 = hashStringTo24Bit('moleculeA');
      const hash2 = hashStringTo24Bit('moleculeB');
      expect(hash1).not.toBe(hash2);
    });

    it('keeps the hash within 24-bit bounds (0 to 0xffffff)', () => {
      const hash = hashStringTo24Bit('a very long string that might produce a large hash value if not bounded properly');
      expect(hash).toBeGreaterThanOrEqual(0);
      expect(hash).toBeLessThanOrEqual(0xffffff);
    });
  });

  describe('toHexColor', () => {
    it('converts 0 to #000000', () => {
      expect(toHexColor(0)).toBe('#000000');
    });

    it('converts 0xffffff to #ffffff', () => {
      expect(toHexColor(0xffffff)).toBe('#ffffff');
    });

    it('pads values with leading zeros if necessary', () => {
      expect(toHexColor(0x12)).toBe('#000012');
      expect(toHexColor(0xabc)).toBe('#000abc');
    });

    it('masks values larger than 24 bits', () => {
      expect(toHexColor(0x1234567)).toBe('#234567'); // Keeps only the lower 24 bits
    });
  });

  describe('brightenRgb', () => {
    it('brightens a dark color', () => {
      const darkColor = 0x102030; // R: 16, G: 32, B: 48
      const brightened = brightenRgb(darkColor, 0.5);

      const r = (brightened >> 16) & 0xff;
      const g = (brightened >> 8) & 0xff;
      const b = brightened & 0xff;

      // 16 + (255 - 16) * 0.5 = 16 + 119.5 = 135
      // 32 + (255 - 32) * 0.5 = 32 + 111.5 = 143
      // 48 + (255 - 48) * 0.5 = 48 + 103.5 = 151
      expect(r).toBe(135);
      expect(g).toBe(143);
      expect(b).toBe(151);
    });

    it('caps brightness at 255', () => {
      const white = 0xffffff;
      const brightened = brightenRgb(white, 1.0);
      expect(brightened).toBe(0xffffff);
    });

    it('does not change color if factor is 0', () => {
      const color = 0xabcdef;
      expect(brightenRgb(color, 0)).toBe(color);
    });

    it('uses default factor of 0.15', () => {
      const color = 0x000000; // Black
      const brightened = brightenRgb(color);
      // 255 * 0.15 = 38.25 -> 38
      const expectedRgb = (38 << 16) | (38 << 8) | 38;
      expect(brightened).toBe(expectedRgb);
    });
  });

  describe('colorFromName', () => {
    it('returns a valid hex color string', () => {
      const color = colorFromName('testName');
      expect(color).toMatch(/^#[0-9a-f]{6}$/);
    });

    it('is deterministic for the same name', () => {
      expect(colorFromName('testName')).toBe(colorFromName('testName'));
    });

    it('applies brightening', () => {
      const name = 'someDarkName'; // we just test it doesn't return the exact raw hash
      const rawHash = hashStringTo24Bit(name);
      const brightenedHash = brightenRgb(rawHash, 0.12);
      expect(colorFromName(name)).toBe(toHexColor(brightenedHash));
    });
  });

  describe('luminance', () => {
    it('returns 0 for black', () => {
      expect(luminance('#000000')).toBeCloseTo(0, 5);
    });

    it('returns 1 for white', () => {
      expect(luminance('#ffffff')).toBeCloseTo(1, 5);
    });

    it('calculates correct luminance for primary colors', () => {
      // Red: 0.2126
      expect(luminance('#ff0000')).toBeCloseTo(0.2126, 4);
      // Green: 0.7152
      expect(luminance('#00ff00')).toBeCloseTo(0.7152, 4);
      // Blue: 0.0722
      expect(luminance('#0000ff')).toBeCloseTo(0.0722, 4);
    });

    it('handles hex strings without leading #', () => {
      expect(luminance('ff0000')).toBeCloseTo(0.2126, 4);
    });
  });

  describe('foregroundForBackground', () => {
    it('returns dark text (#0f172a) for bright backgrounds', () => {
      expect(foregroundForBackground('#ffffff')).toBe('#0f172a');
      expect(foregroundForBackground('#ffff00')).toBe('#0f172a'); // Yellow
      expect(foregroundForBackground('#00ff00')).toBe('#0f172a'); // Green (luminance ~0.71)
    });

    it('returns light text (#ffffff) for dark backgrounds', () => {
      expect(foregroundForBackground('#000000')).toBe('#ffffff');
      expect(foregroundForBackground('#0000ff')).toBe('#ffffff'); // Blue (luminance ~0.07)
      expect(foregroundForBackground('#800000')).toBe('#ffffff'); // Maroon
    });

    it('respects the 0.35 threshold', () => {
      // Find a color near the threshold
      // RGB(150, 150, 150) -> hex #969696
      // sRGB for 150/255 = 0.588
      // (0.588 + 0.055) / 1.055 ^ 2.4 = 0.304 -> Below 0.35 threshold -> white text
      expect(foregroundForBackground('#969696')).toBe('#ffffff');

      // RGB(165, 165, 165) -> hex #a5a5a5
      // sRGB for 165/255 = 0.647
      // (0.647 + 0.055) / 1.055 ^ 2.4 = 0.379 -> Above 0.35 threshold -> dark text
      expect(foregroundForBackground('#a5a5a5')).toBe('#0f172a');
    });
  });
});
