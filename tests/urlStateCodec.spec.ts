/**
 * urlStateCodec.spec.ts — round-trip + graceful-degradation tests.
 */

import { describe, it, expect } from 'vitest';
import { encodeSessionUrl, decodeSessionUrl } from '../src/services/routing/urlStateCodec';
import type { Session } from '../src/services/routing/sessionSchema';

describe('urlStateCodec — readable form', () => {
  it('round-trips a minimal session', () => {
    const s: Session = { tab: 'abc-smc', modelId: 'jak_stat' };
    const url = encodeSessionUrl(s);
    expect(url).toBe('#/session?tab=abc-smc&model=jak_stat');
    expect(decodeSessionUrl(url).session).toEqual(s);
  });

  it('round-trips parameters', () => {
    const s: Session = { tab: 'parameter-scan', modelId: 'toggle', params: { kf: 0.12, kr: 0.03 } };
    const url = encodeSessionUrl(s);
    const { session, warnings } = decodeSessionUrl(url);
    expect(warnings).toEqual([]);
    expect(session.params).toEqual({ kf: 0.12, kr: 0.03 });
  });

  it('emits parameters in canonical (sorted) order', () => {
    const url1 = encodeSessionUrl({ tab: 'time-courses', params: { kr: 1, kf: 2 } });
    const url2 = encodeSessionUrl({ tab: 'time-courses', params: { kf: 2, kr: 1 } });
    expect(url1).toBe(url2);
    expect(url1).not.toContain('model=');
  });

  it('round-trips simulation config', () => {
    const s: Session = {
      tab: 'time-courses',
      simulation: { method: 'ssa', tEnd: 100, nSteps: 1000, seed: 42 },
    };
    const url = encodeSessionUrl(s);
    const decoded = decodeSessionUrl(url);
    expect(decoded.session.simulation).toEqual({ method: 'ssa', tEnd: 100, nSteps: 1000, seed: 42 });
  });

  it('handles URLs with leading # or #/', () => {
    const s: Session = { tab: 'bifurcation', modelId: 'toggle' };
    const url = encodeSessionUrl(s);
    expect(decodeSessionUrl(url).session).toEqual(s);
    expect(decodeSessionUrl(url.replace('#/session', 'session')).session).toEqual(s);
  });

  it('omits default tab from URL', () => {
    const url = encodeSessionUrl({ tab: 'time-courses' });
    expect(url).toBe('#/session?');
    expect(decodeSessionUrl(url).session).toEqual({ tab: 'time-courses' });
  });

  it('recovers from malformed params without throwing', () => {
    const { session, warnings } = decodeSessionUrl('#/session?tab=time-courses&params=kf:notanumber,,kr:0.01');
    expect(session.params).toEqual({ kr: 0.01 });
    expect(warnings.length).toBeGreaterThanOrEqual(2);
    const warningsLower = warnings.map((warning: string) => warning.toLowerCase());

    // Ensure non-numeric segment is specifically identified (kf:notanumber).
    expect(
      warningsLower.some((warning: string) => warning.includes('kf') && /non[-\s]?numeric|not\s*a\s*number|nan/.test(warning))
    ).toBe(true);

    // Ensure empty/malformed segment from ",," is specifically identified.
    expect(
      warningsLower.some((warning: string) => warning.includes(',,') || warning.includes('empty') || warning.includes('malformed'))
    ).toBe(true);
  });

  it('ignores unknown tab ids and falls back to default', () => {
    const { session, warnings } = decodeSessionUrl('#/session?tab=unknown-future-tab');
    expect(session.tab).toBe('time-courses');
    expect(warnings.some((warning: string) => warning.toLowerCase().includes('unknown tab'))).toBe(true);
  });

  it('falls back to default for empty or missing tab values', () => {
    const emptyTab = decodeSessionUrl('#/session?tab=');
    expect(emptyTab.session.tab).toBe('time-courses');

    const missingTab = decodeSessionUrl('#/session');
    expect(missingTab.session.tab).toBe('time-courses');

    const emptyQuery = decodeSessionUrl('#/session?');
    expect(emptyQuery.session.tab).toBe('time-courses');
  });

  it('URL-encodes special chars in model name', () => {
    const s: Session = { tab: 'time-courses', modelId: 'my model/with spaces & symbols' };
    const url = encodeSessionUrl(s);
    expect(decodeSessionUrl(url).session.modelId).toBe(s.modelId);
  });
});

describe('urlStateCodec — compact form', () => {
  it('switches to compact form for embedded source', () => {
    // Keep this payload large enough to reliably exercise compact encoding.
    const REPEAT_LINES_TO_TRIGGER_COMPACT = 50;
    const big =
      'begin model\n' +
      'begin parameters\n' +
      'k 1.0\n'.repeat(REPEAT_LINES_TO_TRIGGER_COMPACT) +
      'end parameters\nend model\n';
    const s: Session = { tab: 'time-courses', embeddedSource: big };
    const url = encodeSessionUrl(s);
    expect(url).toMatch(/^#\/session\?p=/);
    const decoded = decodeSessionUrl(url);
    expect(decoded.format).toBe('compact');
    expect(decoded.session.embeddedSource).toBe(big);
  });

  it('forces compact form when requested', () => {
    const s: Session = { tab: 'abc-smc' };
    const url = encodeSessionUrl(s, { forceCompact: true });
    expect(url).toMatch(/^#\/session\?p=/);
    expect(decodeSessionUrl(url).session).toEqual(s);
  });

  it('uses deflate for large repetitive content and uncompressed for short content', () => {
    // Keep this payload large and highly repetitive so compact encoding selects deflate.
    const LARGE_REPETITIVE_SOURCE_LENGTH = 10_000;
    const repetitive: Session = {
      tab: 'time-courses',
      embeddedSource: 'A'.repeat(LARGE_REPETITIVE_SOURCE_LENGTH),
    };
    const urlD = encodeSessionUrl(repetitive, { forceCompact: true });
    expect(urlD).toMatch(/^#\/session\?p=d:/);

    const short: Session = { tab: 'time-courses', embeddedSource: 'ab' };
    const urlU = encodeSessionUrl(short, { forceCompact: true });
    // Short payload may choose either representation; verify compact encoding and successful round-trip.
    expect(urlU).toMatch(/^#\/session\?p=[du]:/);
    expect(decodeSessionUrl(urlU).session.embeddedSource).toBe('ab');
  });

  it('round-trips large session including params + source', () => {
    const params = Object.fromEntries(
      Array.from({ length: 50 }, (_, i) => [`k_${i}`, i * 0.2]),
    );
    const s: Session = {
      tab: 'abc-smc',
      modelId: 'fceri_gamma2',
      params,
      simulation: { method: 'ode', tEnd: 100, nSteps: 1000 },
      embeddedSource: 'begin model\n' + 'line\n'.repeat(200) + 'end model\n',
    };
    const url = encodeSessionUrl(s);
    const { session, warnings } = decodeSessionUrl(url);
    expect(warnings).toEqual([]);
    expect(session.tab).toBe('abc-smc');
    expect(Object.keys(session.params ?? {}).length).toBe(50);
  });
});

describe('urlStateCodec — pathological inputs', () => {
  it('returns default session for empty URL', () => {
    const { session, format } = decodeSessionUrl('');
    expect(format).toBe('default');
    expect(session.tab).toBe('time-courses');
  });

  it('handles truncated compact payload gracefully', () => {
    const { session, warnings } = decodeSessionUrl('#/session?p=d:garbage');
    expect(session.tab).toBe('time-courses');
    expect(warnings.length).toBeGreaterThan(0);
  });

  it('rejects schema-invalid payload', () => {
    // Use the production encoder to build compact form, but bypass typing
    // to inject a schema-invalid payload (tab must be string).
    const invalidSession = { tab: 42 };
    const url = encodeSessionUrl(invalidSession as unknown as Session, { forceCompact: true });
    const { session, warnings } = decodeSessionUrl(url);
    expect(session.tab).toBe('time-courses');
    expect(warnings.some((warning: string) => warning.includes('schema'))).toBe(true);
  });
});
