import { normalizeWhitespace, escapeRegExp } from '@bngplayground/engine';
function uniquePush(target: string[], value: string): void {
    if (!target.includes(value)) {
        target.push(value);
    }
}

export function ensureBlock(code: string, blockName: string): string {
    const begin = `begin ${blockName}`;
    const end = `end ${blockName}`;
    if (code.includes(begin) && code.includes(end)) {
        return code;
    }

    const trimmed = code.trimEnd();
    if (trimmed.length === 0) {
        return `${begin}\n${end}\n`;
    }

    return `${trimmed}\n${begin}\n${end}\n`;
}

export function insertIntoBlock(code: string, blockName: string, line: string): string {
    const ensured = ensureBlock(code, blockName);
    const endRegex = new RegExp(`end\\s+${blockName}\\s*$`, 'm');
    const match = ensured.match(endRegex);
    if (!match || match.index === undefined) {
        return `${ensured.trimEnd()}\n${line}\n`;
    }

    const insertionPoint = match.index;
    const head = ensured.slice(0, insertionPoint).trimEnd();
    const tail = ensured.slice(insertionPoint);
    return `${head}\n  ${line}\n${tail}`;
}

export function replaceLineInBlock(
    code: string,
    blockName: string,
    matcher: (trimmedLine: string) => boolean,
    replacementLine: string
): string {
    const ensured = ensureBlock(code, blockName);
    const beginRegex = new RegExp(`begin\\s+${blockName}\\s*$`, 'm');
    const endRegex = new RegExp(`end\\s+${blockName}\\s*$`, 'm');

    const beginMatch = ensured.match(beginRegex);
    const endMatch = ensured.match(endRegex);
    if (!beginMatch || !endMatch || beginMatch.index === undefined || endMatch.index === undefined) {
        return ensured;
    }

    const blockStart = beginMatch.index + beginMatch[0].length;
    const blockEnd = endMatch.index;
    const prefix = ensured.slice(0, blockStart);
    const blockBody = ensured.slice(blockStart, blockEnd);
    const suffix = ensured.slice(blockEnd);

    const lines = blockBody.split('\n');
    let replaced = false;
    const updated = lines.map((rawLine) => {
        const trimmed = rawLine.trim();
        if (!replaced && trimmed.length > 0 && matcher(trimmed)) {
            replaced = true;
            return `  ${replacementLine}`;
        }
        return rawLine;
    });

    return `${prefix}${updated.join('\n')}${suffix}`;
}

export function removeLineInBlock(
    code: string,
    blockName: string,
    matcher: (trimmedLine: string) => boolean
): string {
    const ensured = ensureBlock(code, blockName);
    const beginRegex = new RegExp(`begin\\s+${blockName}\\s*$`, 'm');
    const endRegex = new RegExp(`end\\s+${blockName}\\s*$`, 'm');

    const beginMatch = ensured.match(beginRegex);
    const endMatch = ensured.match(endRegex);
    if (!beginMatch || !endMatch || beginMatch.index === undefined || endMatch.index === undefined) {
        return ensured;
    }

    const blockStart = beginMatch.index + beginMatch[0].length;
    const blockEnd = endMatch.index;
    const prefix = ensured.slice(0, blockStart);
    const blockBody = ensured.slice(blockStart, blockEnd);
    const suffix = ensured.slice(blockEnd);

    const lines = blockBody.split('\n');
    const updated = lines.filter((rawLine) => {
        const trimmed = rawLine.trim();
        if (trimmed.length === 0) {
            return true;
        }
        return !matcher(trimmed);
    });

    return `${prefix}${updated.join('\n')}${suffix}`;
}

export function ensureModelEnvelope(code: string): string {
    return code.trim();
}

export function insertRuleLine(code: string, ruleLine: string): string {
    return insertIntoBlock(code, 'reaction rules', ruleLine);
}

export function updateParameterLine(code: string, name: string, value: number): string {
    const assignment = `${name} ${value}`;
    const hasParameter = new RegExp(`^\\s*${name}\\s+`, 'm').test(code);

    if (hasParameter) {
        return replaceLineInBlock(code, 'parameters', (line) => line.startsWith(`${name} `), assignment);
    }

    return insertIntoBlock(code, 'parameters', assignment);
}

export function setSeedSpeciesLine(code: string, species: string, count: number): string {
    const normalizedSpecies = normalizeWhitespace(species);
    const matcher = (line: string) => line.startsWith(`${normalizedSpecies} `);
    const replacement = `${normalizedSpecies} ${count}`;

    if (new RegExp(`^\\s*${escapeRegExp(normalizedSpecies)}\\s+`, 'm').test(code)) {
        return replaceLineInBlock(code, 'seed species', matcher, replacement);
    }

    return insertIntoBlock(code, 'seed species', replacement);
}

export function setObservableLine(code: string, name: string, type: 'Molecules' | 'Species', pattern: string): string {
    const normalizedName = normalizeWhitespace(name);
    const normalizedPattern = normalizeWhitespace(pattern);
    const line = `${type} ${normalizedName} ${normalizedPattern}`;

    if (new RegExp(`^\\s*(Molecules|Species)\\s+${escapeRegExp(normalizedName)}\\b`, 'm').test(code)) {
        return replaceLineInBlock(
            code,
            'observables',
            (raw) => /^(Molecules|Species)\s+/.test(raw) && raw.split(/\s+/)[1] === normalizedName,
            line,
        );
    }

    return insertIntoBlock(code, 'observables', line);
}

export { normalizeWhitespace };