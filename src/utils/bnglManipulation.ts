
// @ts-nocheck
export interface Parameter {
    name: string;
    value: number;
    lineIndex: number;
}

export function parseParameters(code: string): Parameter[] {
    const lines = code.split(/\r?\n/);
    const parameters: Parameter[] = [];
    let inParamBlock = false;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line.startsWith('begin parameters')) {
            inParamBlock = true;
            continue;
        }
        if (line.startsWith('end parameters')) {
            inParamBlock = false;
            continue;
        }

        if (inParamBlock && line && !line.startsWith('#')) {
            const parts = line.split(/\s+/);
            if (parts.length >= 2) {
                const name = parts[0];
                const valStr = parts[1];
                const val = parseFloat(valStr);
                if (!isNaN(val)) {
                    parameters.push({ name, value: val, lineIndex: i });
                }
            }
        }
    }
    return parameters;
}

export function updateParameterInCode(code: string, param: Parameter, newValue: number): string {
    const lines = code.split(/\r?\n/);
    if (param.lineIndex >= lines.length) return code;

    const line = lines[param.lineIndex];
    // Regex to match "Name Value Comment/End"
    // Group 1: Name and whitespace
    // Group 2: The value (scientific notation supported)
    // Group 3: The rest (comments)
    const nameRegex = new RegExp(`(${param.name}\\s+)([\\d\\.eE\\-\\+]+)(.*)`);
    const match = line.match(nameRegex);

    if (match) {
        // Determine precision based on input? Or just use default string
        // Using simple string conversion for now
        const newCodeLine = line.replace(nameRegex, `$1${newValue}$3`);
        lines[param.lineIndex] = newCodeLine;
        return lines.join('\n');
    }
    return code;
}

export function perturbParameters(code: string, variationPercent: number): string {
    const params = parseParameters(code);

    // To avoid line index shifting if we modified lines directly (we aren't adding/removing lines, so indices stay valid)
    // But updating 'newCode' repeatedly is inefficient if we re-split every time.
    // Better to split once, update array, join once.

    const lines = code.split(/\r?\n/);

    params.forEach(p => {
        const line = lines[p.lineIndex];
        const nameRegex = new RegExp(`(${p.name}\\s+)([\\d\\.eE\\-\\+]+)(.*)`);
        const match = line.match(nameRegex);

        if (match) {
            // Perturb value: val * (1 + rand(-v, v))
            // e.g. 10% variation => rand(-0.1, 0.1)
            const randomFactor = (Math.random() * 2 - 1) * (variationPercent / 100);
            const perturbedValue = p.value * (1 + randomFactor);

            // Format to reasonable precision to avoid 1.00000000000002
            const formattedValue = Number(perturbedValue.toPrecision(6)); // 6 sig figs

            lines[p.lineIndex] = line.replace(nameRegex, `$1${formattedValue}$3`);
        }
    });
    return lines.join('\n');
}

export function perturbParameterOverrides(params: Record<string, number>, variationPercent: number): Record<string, number> {
    const overrides: Record<string, number> = {};


    Object.entries(params).forEach(([name, val]) => {
        // Avoid perturbing 0 or 1 integers if they look like flags? No, perturb everything.
        // If value is 0, it stays 0 unless we add additive noise. 
        // Multiplicative noise on 0 is 0.
        // Assuming mostly Rate Constants > 0.

        const randomFactor = (Math.random() * 2 - 1) * (variationPercent / 100);
        overrides[name] = val * (1 + randomFactor);
    });

    return overrides;
}
