function trim_trailing_zeros(values: number[]): number[] {
    let end = values.length;
    while (end > 0 && values[end - 1] === 0) end--;
    return values.slice(0, end);
}

function array_less_than(left: number[], right: number[]): boolean {
    for (let index = 0; index < Math.min(left.length, right.length); index++) {
        if (left[index] < right[index]) return true;
        if (left[index] > right[index]) return false;
    }
    return left.length < right.length;
}

function standardize(values: number[]): number[] {
    if (values.length < 2) return values;
    let index = 0;
    const parts: number[][] = [];
    while (index < values.length) {
        const start = index;
        index++;
        while (index < values.length && values[index] > values[0]) index++;
        const part = standardize(values.slice(start + 1, index));
        while (parts.length > 0 && parts[parts.length - 1].join(',') < part.join(',')) parts.pop();
        parts.push(part);
    }
    const result: number[] = [];
    for (const part of parts) result.push(values[0], ...part);
    return result;
}

function cantor_form(values: number[]): string {
    if (values.length < 1) return String(values.length);
    let index = 0;
    const parts: string[] = [];
    while (index < values.length) {
        const start = index++;
        while (index < values.length && values[index] > values[start]) index++;
        const part = cantor_form(values.slice(start + 1, index));
        if (part === '0') parts.push('1');
        else if (part === '1') parts.push('ω');
        else parts.push(`ω^{${part}}`);
    }
    const result: string[] = [];
    index = 0;
    while (index < parts.length) {
        const start = index;
        while (index < parts.length && parts[index] === parts[start]) index++;
        const count = index - start;
        result.push(count > 1 ? `${parts[start] === '1' ? '' : `${parts[start]}*`}${count}` : parts[start]);
        if (index < parts.length) result.push('+');
    }
    return result.join('');
}

function ppsm(values: number[], j: number, b: number): number[] {
    if (b === 0) {
        if (j > 1) {
            return values.concat(
                Array.from({ length: j + 2 }, (_, index) => index),
                Array.from({ length: j - 1 }, (_, index) => j - index),
            );
        }
        return values.concat([0, 1, 2, 1, 2]);
    }
    const trimmed = trim_trailing_zeros(values);
    return trimmed.concat(
        Array.from({ length: j + 2 }, (_, index) => b - 1 + index),
        Array.from({ length: j - 1 }, (_, index) => j + b - 1 - index),
    );
}

function pps(values: number[]): number[] {
    if (values.length < 2 || values[1] === 0) return Array(values.length).fill(0);
    let result: number[] = [];
    let index = 2;
    let run = 0;
    let base = 0;
    if (array_less_than(values, [0, 1, 0, 1])) {
        result = [0, 1];
        for (let position = 2; position < values.length; position++) {
            if (values[position] === 0) result.push(0);
            else if (values[position] === position) result.push(0, 1, 2);
            else result.push(1);
        }
        return standardize(result);
    }

    const metadata: number[] = [];
    for (index = 0; index < values.length; index++) {
        const value = values[index];
        if (value === 0) {
            result.push(0);
            metadata.push(0);
        } else if (values[value - 1] === 0) {
            if (run !== 0) {
                result = ppsm(result, run, base);
                run = 0;
            }
            if (value === index) {
                if (index === 1 || index + 2 >= values.length || values[index + 2] < value) {
                    result.push(0, 1, 2);
                    metadata.push(0);
                } else {
                    const tail = values.slice(index - 1);
                    const shifted = tail.map((entry) => (entry === 0 ? 0 : entry - value + 1));
                    result = result.concat(pps(shifted));
                    break;
                }
            } else if (values[value] !== 0) {
                result = trim_trailing_zeros(result);
                result.push((metadata[value] ?? 0) + 1);
                metadata.push((metadata[value] ?? 0) + 1);
            } else {
                result.push(1);
                metadata.push(1);
            }
        } else {
            base = value === 2 ? 0 : (metadata[value - 1] ?? 0) + 1;
            metadata.push(base);
            run++;
        }
    }
    if (run !== 0) {
        result = ppsm(result, run, base);
        let trailing = 0;
        for (let position = values.length - 1; position >= 0 && values[position] === 0; position--) trailing++;
        for (let count = 0; count < trailing; count++) result.push(0);
    }
    return standardize(result);
}

export function translate_pps(input: string): string {
    const raw = String(input ?? '').trim();
    if (!raw) throw new Error('Please enter a PPS sequence.');
    const parts = raw.split(/\s*,\s*/).filter((part) => part !== '');
    const values = parts.map((part) => {
        const value = Number(part);
        if (!Number.isInteger(value) || value < 0) throw new Error(`Invalid number: "${part}"`);
        return value;
    });
    if (values.length === 0) throw new Error('Please enter a PPS sequence.');

    const lines = [`PPS Input: [${values.join(', ')}]`, ''];
    const epsilon_zero = values.join(',') === '0,1,0,2,0,3';
    if (epsilon_zero) {
        lines.push('Special case: 0,1,0,2,0,3 → ε₀', '', 'Cantor Normal Form: ε₀');
    } else {
        const prss = pps(values);
        lines.push(`PrSS Standard: [${prss.join(', ')}]`, '', `Cantor Normal Form: ${cantor_form(prss)}`);
    }
    return lines.join('\n');
}
