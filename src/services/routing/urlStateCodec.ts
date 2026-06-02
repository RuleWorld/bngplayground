/**
 * urlStateCodec.ts — bidirectional (de)serialization between SessionSchema
 * and a URL-safe string.
 */

import { deflate, inflate } from 'pako';
import { z } from 'zod';
import { sessionSchema, type Session } from './sessionSchema';
import { TAB_IDS, normalizeTabId, type TabId } from './tabIds';

export interface EncodeOptions {
	compactThreshold?: number;
	forceCompact?: boolean;
}

export interface DecodeResult {
	session: Session;
	warnings: string[];
	format: 'readable' | 'compact' | 'default';
}

export function encodeSessionUrl(session: Session, opts: EncodeOptions = {}): string {
	const readable = encodeReadable(session);
	const hasEmbeddedSource = Boolean(session.embeddedSource);
	const threshold = opts.compactThreshold ?? 200;

	if (!opts.forceCompact && !hasEmbeddedSource && readable.length <= threshold) {
		return `#/session?${readable}`;
	}

	const json = JSON.stringify(session);
	const compact = encodeCompact(json);
	if (!opts.forceCompact && !hasEmbeddedSource && readable.length < compact.length + 2) {
		return `#/session?${readable}`;
	}
	return `#/session?p=${compact}`;
}

export function decodeSessionUrl(raw: string): DecodeResult {
	const warnings: string[] = [];
	const stripped = raw.replace(/^#\/?/, '').replace(/^session\?/, '');
	if (!stripped) return { session: defaultSession(), warnings: ['empty URL'], format: 'default' };

	const params = new URLSearchParams(stripped);
	const compact = params.get('p');
	if (compact) {
		try {
			const json = decodeCompact(compact);
			const parsed = sessionSchema.safeParse(JSON.parse(json));
			if (parsed.success) {
				return { session: parsed.data, warnings, format: 'compact' };
			}
			warnings.push(`compact payload schema invalid: ${zodIssuesSummary(parsed.error)}`);
			return { session: defaultSession(), warnings, format: 'default' };
		} catch (error) {
			warnings.push(`compact payload decode failed: ${String(error).slice(0, 120)}`);
			return { session: defaultSession(), warnings, format: 'default' };
		}
	}

	const session = decodeReadable(params, warnings);
	return { session, warnings, format: 'readable' };
}

function encodeReadable(session: Session): string {
	const parts: string[] = [];
	if (session.tab && session.tab !== 'time-courses') parts.push(`tab=${session.tab}`);
	if (session.modelId) parts.push(`model=${encodeURIComponent(session.modelId)}`);

	if (session.params && Object.keys(session.params).length > 0) {
		const enc = Object.entries(session.params)
			.sort(([a], [b]) => a.localeCompare(b))
			.map(([key, value]) => `${encodeURIComponent(key)}:${formatNumber(value)}`)
			.join(',');
		parts.push(`params=${enc}`);
	}

	if (session.simulation) {
		const sim = session.simulation;
		const kv: string[] = [];
		if (sim.method && sim.method !== 'ode') kv.push(`method:${sim.method}`);
		if (typeof sim.tEnd === 'number') kv.push(`tEnd:${formatNumber(sim.tEnd)}`);
		if (typeof sim.nSteps === 'number') kv.push(`nSteps:${sim.nSteps}`);
		if (typeof sim.seed === 'number') kv.push(`seed:${sim.seed}`);
		if (kv.length > 0) parts.push(`sim=${kv.join(',')}`);
	}

	if (session.observable) parts.push(`obs=${encodeURIComponent(session.observable)}`);
	if (session.tabState) parts.push(`state=${encodeURIComponent(JSON.stringify(session.tabState))}`);
	if (session.embeddedSource) parts.push(`src=${encodeURIComponent(session.embeddedSource)}`);

	return parts.join('&');
}

function decodeReadable(params: URLSearchParams, warnings: string[]): Session {
	const session = defaultSession();

	const rawTab = params.get('tab');
	if (rawTab) {
		const maybe = normalizeTabId(rawTab) as TabId | 'time-courses';
		if ((TAB_IDS as readonly string[]).includes(maybe)) {
			session.tab = maybe as TabId;
		} else {
			warnings.push(`unknown tab id: '${rawTab}'`);
		}
	}

	const model = params.get('model');
	if (model) session.modelId = decodeURIComponent(model);

	const rawParams = params.get('params');
	if (rawParams) {
		const paramsObj: Record<string, number> = {};
		for (let start = 0, len = rawParams.length; start < len; ) {
			const commaIdx = rawParams.indexOf(',', start);
			const endIdx = commaIdx === -1 ? len : commaIdx;
			const colonIdx = rawParams.indexOf(':', start);

			if (colonIdx === -1 || colonIdx >= endIdx) {
				warnings.push(`malformed params entry: '${rawParams.slice(start, endIdx)}'`);
			} else {
				const rawKey = rawParams.slice(start, colonIdx);
				const rawValue = rawParams.slice(colonIdx + 1, endIdx);
				if (!rawKey) {
					warnings.push(`malformed params entry: '${rawParams.slice(start, endIdx)}'`);
				} else {
					const value = +rawValue;
					if (!Number.isFinite(value)) {
						warnings.push(`non-numeric param value for '${rawKey}': '${rawValue}'`);
					} else {
						const key = rawKey.indexOf('%') !== -1 ? decodeURIComponent(rawKey) : rawKey;
						paramsObj[key] = value;
					}
				}
			}
			start = endIdx + 1;
		}
		if (Object.keys(paramsObj).length > 0) session.params = paramsObj;
	}

	const rawSim = params.get('sim');
	if (rawSim) {
		const sim: Session['simulation'] = {};
		for (let start = 0, len = rawSim.length; start < len; ) {
			const commaIdx = rawSim.indexOf(',', start);
			const endIdx = commaIdx === -1 ? len : commaIdx;
			const colonIdx = rawSim.indexOf(':', start);

			if (colonIdx !== -1 && colonIdx < endIdx) {
				const key = rawSim.slice(start, colonIdx);
				const value = rawSim.slice(colonIdx + 1, endIdx);
				if (key) {
					if (key === 'method' && (value === 'ode' || value === 'ssa' || value === 'nfsim' || value === 'pla' || value === 'psa')) {
						sim.method = value;
					} else if (key === 'tEnd') {
						const n = Number(value);
						if (Number.isFinite(n)) sim.tEnd = n;
					} else if (key === 'nSteps' || key === 'seed') {
						const n = Number(value);
						if (Number.isInteger(n)) sim[key] = n;
					}
				}
			}
			start = endIdx + 1;
		}
		if (Object.keys(sim).length > 0) session.simulation = sim;
	}

	const obs = params.get('obs');
	if (obs) session.observable = decodeURIComponent(obs);

	const tabState = params.get('state');
	if (tabState) {
		try {
			session.tabState = JSON.parse(decodeURIComponent(tabState));
		} catch (error) {
			warnings.push(`tab state decode failed: ${String(error).slice(0, 80)}`);
		}
	}

	const embeddedSource = params.get('src');
	if (embeddedSource) session.embeddedSource = decodeURIComponent(embeddedSource);

	const parsed = sessionSchema.safeParse(session);
	if (parsed.success) return parsed.data;
	warnings.push(`session schema coerced: ${zodIssuesSummary(parsed.error)}`);
	return defaultSession();
}

function encodeCompact(json: string): string {
	const utf8 = new TextEncoder().encode(json);
	let bytes: Uint8Array;

	try {
		bytes = deflate(utf8, { level: 9 });
	} catch {
		bytes = utf8;
	}

	if (bytes.length > utf8.length) {
		return 'u:' + base64UrlEncode(utf8);
	}
	return 'd:' + base64UrlEncode(bytes);
}

function decodeCompact(payload: string): string {
	if (payload.length < 3 || payload[1] !== ':') {
		const bytes = base64UrlDecode(payload);
		return new TextDecoder().decode(inflate(bytes));
	}

	const kind = payload[0];
	const data = base64UrlDecode(payload.slice(2));

	if (kind === 'd') {
		return new TextDecoder().decode(inflate(data));
	}
	if (kind === 'u') {
		return new TextDecoder().decode(data);
	}
	throw new Error(`unknown compact payload prefix: '${kind}:'`);
}

function base64UrlEncode(buf: Uint8Array): string {
	const b64 = typeof Buffer !== 'undefined'
		? Buffer.from(buf).toString('base64')
		: btoa(String.fromCharCode(...buf));
	return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecode(value: string): Uint8Array {
	const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((value.length + 3) % 4);
	if (typeof Buffer !== 'undefined') {
		return new Uint8Array(Buffer.from(padded, 'base64'));
	}
	const bin = atob(padded);
	const out = new Uint8Array(bin.length);
	for (let index = 0; index < bin.length; index++) out[index] = bin.charCodeAt(index);
	return out;
}

function formatNumber(value: number): string {
	if (!Number.isFinite(value)) return String(value);
	if (Number.isInteger(value) && Math.abs(value) < 1e12) return String(value);
	return value.toPrecision(8).replace(/0+$/, '').replace(/\.$/, '');
}

function defaultSession(): Session {
	return { tab: 'time-courses' };
}

function zodIssuesSummary(error: z.ZodError): string {
	return error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).slice(0, 5).join('; ');
}
