import { NotationDefinition } from '@/notation-definition.ts';

const INFINITY: string = Infinity as any;

function is_infinity(str: string): boolean {
    return '' + str === '' + INFINITY;
}

class WSM {
    parent: number[][];

    constructor(parentMatrix: number[][]) {
        this.parent = parentMatrix.map((col) => [...col]);
    }

    static fromString(inputStr: string): WSM {
        const { matrix } = WSM.parse(inputStr);
        return WSM.fromValue(matrix);
    }

    static fromValue(valueMatrix: number[][]): WSM {
        const rows = valueMatrix.length > 0 ? valueMatrix[0].length : 0;
        const cols = valueMatrix.length;
        if (rows === 0 || cols === 0) return new WSM([]);

        const parent = Array.from({ length: cols }, () => Array(rows).fill(-1));
        const virtualParent = Array(cols).fill(-1);
        for (let c = 1; c < cols; c++) virtualParent[c] = c - 1;

        const getAncestors = (col: number, row: number, parentMat: number[][]): number[] => {
            const ancestors: number[] = [];
            let p = parentMat[col][row];
            while (p !== -1) {
                ancestors.push(p);
                p = parentMat[p][row];
            }
            return ancestors;
        };

        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                let belowAncestors: number[] = [];
                if (r === 0) {
                    let p = virtualParent[c];
                    while (p !== -1) {
                        belowAncestors.push(p);
                        p = virtualParent[p];
                    }
                } else {
                    belowAncestors = getAncestors(c, r - 1, parent);
                }
                const curVal = valueMatrix[c][r];
                let best = -1;
                for (const anc of belowAncestors) {
                    if (valueMatrix[anc][r] < curVal) {
                        best = anc;
                        break;
                    }
                }
                parent[c][r] = best;
            }
        }
        return new WSM(parent);
    }

    static fromWorm(worm: number[]): WSM {
        const n = worm.length;
        if (n === 0) return new WSM([]);
        const aux = [worm.slice()];
        const parentRows: number[][] = [];

        const row0: number[] = [];
        for (let c = 0; c < n; c++) {
            let best = -1;
            for (let p = c - 1; p >= 0; p--) {
                if (aux[0][p] < aux[0][c]) {
                    best = p;
                    break;
                }
            }
            row0.push(best);
        }
        parentRows.push(row0);

        let i = 0;
        while (true) {
            const auxNext: number[] = [];
            const row = parentRows[i];
            for (let c = 0; c < n; c++) {
                if (row[c] !== -1) {
                    auxNext.push(aux[i][c] - aux[i][row[c]]);
                } else {
                    auxNext.push(1);
                }
            }
            aux.push(auxNext);
            if (auxNext.every((v) => v === 1)) break;

            const nextRow: number[] = [];
            for (let c = 0; c < n; c++) {
                let ancestors: number[] = [];
                let p = parentRows[i][c];
                while (p !== -1) {
                    ancestors.push(p);
                    p = parentRows[i][p];
                }
                let maxCol = -1;
                for (const anc of ancestors) {
                    if (aux[i + 1][anc] < aux[i + 1][c]) {
                        if (anc > maxCol) maxCol = anc;
                    }
                }
                nextRow.push(maxCol);
            }
            parentRows.push(nextRow);
            i++;
        }

        const parentCols = Array.from({ length: n }, (_, c) => parentRows.map((row) => row[c]));
        return new WSM(parentCols);
    }

    static parse(inputStr: string): { matrix: number[][]; rows: number; cols: number } {
        const colRegex = /\(([^)]*)\)/g;
        let match: RegExpExecArray | null;
        const columns: number[][] = [];
        while ((match = colRegex.exec(inputStr)) !== null) {
            const content = match[1];
            if (content.trim() === '') {
                columns.push([0]);
            } else {
                const nums = content.split(',').map((n) => parseInt(n.trim(), 10));
                if (nums.some(isNaN)) {
                    columns.push([0]);
                } else {
                    columns.push(nums);
                }
            }
        }
        let maxRows = 0;
        for (const col of columns) {
            if (col.length > maxRows) maxRows = col.length;
        }
        for (const col of columns) {
            while (col.length < maxRows) col.push(0);
        }
        return { matrix: columns, rows: maxRows, cols: columns.length };
    }

    static format(matrix: number[][]): string {
        if (!matrix || matrix.length === 0) return '';
        return matrix
            .map((col) => {
                let trimmed = [...col];
                while (trimmed.length > 1 && trimmed[trimmed.length - 1] === 0) {
                    trimmed.pop();
                }
                return '(' + trimmed.join(',') + ')';
            })
            .join('');
    }

    static clone(matrix: number[][]): number[][] {
        return matrix.map((col) => [...col]);
    }

    static getGenerationColumn(colIdx: number, lnzRow: number, parentMat: number[][], lastColIdx: number): number[] {
        const result = [...parentMat[lastColIdx]];
        const p = parentMat[lastColIdx][lnzRow];
        if (p !== -1) {
            result[lnzRow] = parentMat[p][lnzRow];
        }
        for (let r = lnzRow + 1; r < result.length; r++) {
            result[r] = parentMat[colIdx][r];
        }
        return result;
    }

    getAncestorsAt(col: number, row: number): number[] {
        const ancestors: number[] = [];
        let p = this.parent[col][row];
        while (p !== -1) {
            ancestors.push(p);
            p = this.parent[p][row];
        }
        return ancestors;
    }

    // 试展开：增加了 lastColAllowableRows 参数
    trialExpand(
        refCol: number,
        lnzRowVal: number,
        lastColIdx: number,
        genColToUse: number[],
        lastColAllowableRows: Set<number>[],
    ): number[][] {
        const parent = this.parent;
        const rows = parent[0].length;

        const newMat = WSM.clone(parent);
        newMat.pop();
        const genCol = genColToUse;
        const copyWidth = lastColIdx - refCol;

        if (refCol <= lastColIdx) {
            for (let c = refCol; c <= lastColIdx; c++) {
                const sourceCol = parent[c];
                const newCol: number[] = [];
                for (let r = 0; r < sourceCol.length; r++) {
                    const p = sourceCol[r];
                    let useGenCol = false;
                    if (r <= lnzRowVal) {
                        useGenCol = p === parent[refCol][r] && lastColAllowableRows[r].has(c);
                    } else {
                        useGenCol = c === refCol;
                    }
                    if (useGenCol) {
                        if (genCol[r] >= refCol) {
                            newCol.push(genCol[r]);
                        } else {
                            newCol.push(genCol[r]);
                        }
                    } else {
                        if (p >= refCol) {
                            newCol.push(p + copyWidth);
                        } else {
                            newCol.push(p);
                        }
                    }
                }
                newMat.push(newCol);
            }
        }
        return newMat;
    }

    static compareParentMatrices(matA: number[][], matB: number[][]): number {
        const maxCols = Math.max(matA.length, matB.length);
        const maxRows = Math.max(matA.length > 0 ? matA[0].length : 0, matB.length > 0 ? matB[0].length : 0);
        for (let c = 0; c < maxCols; c++) {
            const colA = c < matA.length ? matA[c] : [];
            const colB = c < matB.length ? matB[c] : [];
            const maxR = Math.max(colA.length, colB.length);
            for (let r = 0; r < maxR; r++) {
                const pA = r < colA.length ? colA[r] : -1;
                const pB = r < colB.length ? colB[r] : -1;
                if (pA !== pB) {
                    if (pA === -1) return -1;
                    if (pB === -1) return 1;
                    return pA - pB;
                }
            }
        }
        return matA.length - matB.length;
    }

    expand(times: number): {
        wsm: WSM;
        badRoot: number;
        candidateRoots: number[];
        trialResults: { [key: string]: number[][] };
        originalRoot: number;
        lnzRow: number;
        lastCol: number;
        genCol: number[];
        smallerRoots: number[];
        pendingRoots: number[];
        usedTrialLogic: boolean;
    } {
        const parent = this.parent;
        const cols = parent.length;
        if (cols === 0) {
            return {
                wsm: new WSM([]),
                badRoot: -1,
                candidateRoots: [],
                trialResults: {},
                originalRoot: -1,
                lnzRow: -1,
                lastCol: -1,
                genCol: [],
                smallerRoots: [],
                pendingRoots: [],
                usedTrialLogic: false,
            };
        }

        const rows = parent[0].length;
        const lastCol = cols - 1;

        // 1. 找 LNZ 行
        let lnzRow = -1;
        for (let r = rows - 1; r >= 0; r--) {
            if (parent[lastCol][r] !== -1) {
                lnzRow = r;
                break;
            }
        }
        if (lnzRow === -1) {
            const newParent = parent.slice(0, -1);
            return {
                wsm: new WSM(newParent),
                badRoot: -1,
                candidateRoots: [],
                trialResults: {},
                originalRoot: -1,
                lnzRow: -1,
                lastCol: lastCol,
                genCol: [],
                smallerRoots: [],
                pendingRoots: [],
                usedTrialLogic: false,
            };
        }

        const originalRoot = parent[lastCol][lnzRow];
        if (originalRoot === -1) {
            return {
                wsm: new WSM(parent),
                badRoot: -1,
                candidateRoots: [],
                trialResults: {},
                originalRoot: -1,
                lnzRow: lnzRow,
                lastCol: lastCol,
                genCol: [],
                smallerRoots: [],
                pendingRoots: [],
                usedTrialLogic: false,
            };
        }

        // 2. 确定原始元素行
        let origElemRow = -1;
        for (let r = rows - 1; r >= 0; r--) {
            if (parent[originalRoot][r] !== -1) {
                origElemRow = r;
                break;
            }
        }
        if (origElemRow === -1 || origElemRow < lnzRow) {
            origElemRow = lnzRow;
        }

        let badRoot = originalRoot;
        let candidateRoots: number[] = [];
        let trialResults: { [key: string]: number[][] } = {};
        let smallerRoots: number[] = [];
        let pendingRoots: number[] = [];

        // ---- 计算每项的容许列矩阵 (allowableMatrix) ----
        const computeS = (c: number, r: number): Set<number> => {
            const ancestors: number[] = [];
            let p = parent[c][r];
            while (p !== -1) {
                ancestors.push(p);
                p = parent[p][r];
            }
            if (ancestors.length === 0 && parent[c][r] === -1) {
                return new Set();
            }
            const S = new Set<number>();
            for (const a of ancestors) {
                S.add(a);
            }
            const directParent = ancestors.length > 0 ? ancestors[0] : -1;
            for (const a of ancestors) {
                if (a === directParent) continue;
                for (let col = 0; col < cols; col++) {
                    if (parent[col][r] === a) {
                        S.add(col);
                    }
                }
            }
            for (let col = 0; col < cols; col++) {
                if (parent[col][r] === -1) {
                    S.add(col);
                }
            }
            return S;
        };

        // 对于 r >= 1，候选列必须是 c 在 r-1 行的祖先
        const allowableMatrix: Set<number>[][] = Array.from({ length: cols }, () => Array(rows));
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                if (parent[c][r] === -1) {
                    allowableMatrix[c][r] = new Set();
                } else {
                    const S = computeS(c, r);
                    if (r === 0) {
                        allowableMatrix[c][r] = S;
                    } else {
                        const ancestors = this.getAncestorsAt(c, r - 1);
                        const intersect = new Set<number>();
                        for (const item of S) {
                            if (ancestors.includes(item)) {
                                intersect.add(item);
                            }
                        }
                        allowableMatrix[c][r] = intersect;
                    }
                }
            }
        }

        // 提取每行末列的容许列
        const lastColAllowableRows: Set<number>[] = [];
        for (let r = 0; r < rows; r++) {
            lastColAllowableRows[r] = new Set(allowableMatrix[lastCol][r]);
        }

        // ---- 提前计算 genCol（用于条件3） ----
        const genCol = WSM.getGenerationColumn(originalRoot, lnzRow, parent, lastCol);

        // ---- 试展开 ----
        const origRootTrial = this.trialExpand(originalRoot, lnzRow, lastCol, genCol, lastColAllowableRows);

        // ---- 条件1：末列在 lnzRow-1 行的祖先列 ----
        const cond1Set = new Set<number>();
        if (lnzRow > 0) {
            const ancestors = this.getAncestorsAt(lastCol, lnzRow - 1);
            for (const a of ancestors) cond1Set.add(a);
        } else {
            // lnzRow === 0：所有小于 lastCol 的列（虚拟父链上的祖先）
            for (let c = 0; c < lastCol; c++) cond1Set.add(c);
        }

        // ---- 条件2：原始元素的祖先及其子项所在列 ----
        const ancestorsSet = new Set<number>();
        let q = parent[originalRoot][origElemRow];
        while (q !== -1) {
            ancestorsSet.add(q);
            q = parent[q][origElemRow];
        }
        const cond2Set = new Set<number>();
        for (const anc of ancestorsSet) {
            cond2Set.add(anc);
            for (let c = 0; c < cols; c++) {
                if (parent[c][origElemRow] === anc) {
                    cond2Set.add(c);
                }
            }
        }

        // ---- 条件3：列本身的包含关系 ----
        const cond3Cols: number[] = [];
        for (let c = 0; c < cols; c++) {
            if (c === lastCol) continue;
            let contains = true;
            for (let r = 0; r < rows; r++) {
                const pC = parent[c][r];
                const pRoot = parent[originalRoot][r];
                if (pC === -1) continue;
                let isAncestor = false;
                let pp = pRoot;
                while (pp !== -1) {
                    if (pp === pC) {
                        isAncestor = true;
                        break;
                    }
                    pp = parent[pp][r];
                }
                if (!isAncestor) {
                    contains = false;
                    break;
                }
            }
            if (contains) cond3Cols.push(c);
        }
        const cond3Set = new Set(cond3Cols);

        // 候选根 = cond1Set ∩ cond2Set ∩ cond3Set，强制加入 originalRoot
        const candidateSet = new Set<number>();
        for (const c of cond1Set) {
            if (cond2Set.has(c) && cond3Set.has(c)) {
                candidateSet.add(c);
            }
        }
        candidateSet.add(originalRoot);
        candidateRoots = Array.from(candidateSet).sort((a, b) => a - b);

        // ---- 待定根：原始元素的所有祖先所在列（且必须是候选根） ----
        const pendingSet = new Set<number>();
        let p = originalRoot;
        while (p !== -1) {
            pendingSet.add(p);
            p = parent[p][origElemRow];
        }
        const candidateSetForPending = new Set(candidateRoots);
        const finalPending = new Set<number>();
        for (const c of pendingSet) {
            if (candidateSetForPending.has(c)) {
                finalPending.add(c);
            }
        }
        pendingRoots = Array.from(finalPending).sort((a, b) => a - b);

        // ---- 计算小根和坏根 ----
        trialResults[originalRoot] = origRootTrial;
        for (const cr of candidateRoots) {
            if (cr === originalRoot) continue;
            trialResults[cr] = this.trialExpand(cr, lnzRow, lastCol, genCol, lastColAllowableRows);
            const cmp = WSM.compareParentMatrices(trialResults[cr], origRootTrial);
            if (cmp < 0) {
                smallerRoots.push(cr);
            }
        }

        const sortedCandidates = [...candidateRoots].sort((a, b) => a - b);
        let smallRoot = -1;
        for (let i = sortedCandidates.length - 1; i >= 0; i--) {
            const cr = sortedCandidates[i];
            if (cr === originalRoot) continue;
            const cmp = WSM.compareParentMatrices(trialResults[cr], origRootTrial);
            if (cmp < 0) {
                smallRoot = cr;
                break;
            }
        }

        if (smallRoot !== -1) {
            let minRight = Infinity;
            for (const pr of pendingRoots) {
                if (pr > smallRoot && pr < minRight) {
                    minRight = pr;
                }
            }
            if (minRight !== Infinity) {
                badRoot = minRight;
            } else {
                badRoot = pendingRoots.length > 0 ? Math.min(...pendingRoots) : -1;
            }
        } else {
            badRoot = pendingRoots.length > 0 ? Math.min(...pendingRoots) : -1;
        }
        if (badRoot === -1) {
            badRoot = originalRoot;
        }

        const finalGenCol = genCol;

        // 正式展开
        let newParent = WSM.clone(parent);
        newParent.pop();
        const copyWidth = lastCol - badRoot;

        if (badRoot <= lastCol - 1) {
            for (let t = 1; t <= times; t++) {
                for (let c = badRoot; c <= lastCol - 1; c++) {
                    const sourceCol = parent[c];
                    const newCol: number[] = [];
                    for (let r = 0; r < sourceCol.length; r++) {
                        const p = sourceCol[r];
                        let useGenCol = false;
                        if (r <= lnzRow) {
                            useGenCol = p === parent[badRoot][r] && lastColAllowableRows[r].has(c);
                        } else {
                            useGenCol = c === badRoot;
                        }
                        if (useGenCol) {
                            if (finalGenCol[r] >= badRoot) {
                                newCol.push(finalGenCol[r] + (t - 1) * copyWidth);
                            } else {
                                newCol.push(finalGenCol[r]);
                            }
                        } else {
                            if (p >= badRoot) {
                                newCol.push(p + t * copyWidth);
                            } else {
                                newCol.push(p);
                            }
                        }
                    }
                    newParent.push(newCol);
                }
            }
        }

        return {
            wsm: new WSM(newParent),
            badRoot: badRoot,
            candidateRoots: candidateRoots,
            trialResults: trialResults,
            originalRoot: originalRoot,
            lnzRow: lnzRow,
            lastCol: lastCol,
            genCol: finalGenCol,
            smallerRoots: smallerRoots,
            pendingRoots: pendingRoots,
            usedTrialLogic: true,
        };
    }

    format(): string {
        const value = this.toValue();
        return WSM.format(value);
    }

    toValue(): number[][] {
        const parentMat = this.parent;
        const valueMat = WSM.clone(parentMat);
        for (let c = 0; c < parentMat.length; c++) {
            for (let r = 0; r < parentMat[c].length; r++) {
                const p = parentMat[c][r];
                if (p === -1) {
                    valueMat[c][r] = 0;
                } else {
                    valueMat[c][r] = valueMat[p][r] + 1;
                }
            }
        }
        return valueMat;
    }

    toWorm(): number[] {
        const parent = this.parent;
        const cols = parent.length;
        if (cols === 0) return [];
        const rows = parent[0].length;
        const val = Array.from({ length: cols }, () => Array(rows).fill(0));
        const rTop = rows - 1;
        for (let c = 0; c < cols; c++) {
            const p = parent[c][rTop];
            if (p === -1) {
                val[c][rTop] = 1;
            } else {
                val[c][rTop] = val[p][rTop] + 1;
            }
        }
        for (let r = rows - 2; r >= 0; r--) {
            for (let c = 0; c < cols; c++) {
                const p = parent[c][r];
                if (p === -1) {
                    val[c][r] = 1;
                } else {
                    val[c][r] = val[p][r] + val[c][r + 1];
                }
            }
        }
        const worm: number[] = [];
        for (let c = 0; c < cols; c++) {
            worm.push(val[c][0]);
        }
        return worm;
    }
}

export const WSMv1_5: NotationDefinition<string> = {
    id: 'WSMv1.5',
    name: 'WSM v1.5',
    simple_name: 'WSM',

    category_id: 'category-bm-like',

    display: {
        plain: (a) => (is_infinity(a) ? 'Limit' : a),
        html: (a) => (is_infinity(a) ? 'Limit' : a),
        latex: (a) => (is_infinity(a) ? '\\text{Limit}' : a),
        from_display: (str) => (str === 'Limit' ? INFINITY : str),
    },

    display_equiv: {
        worm: {
            plain: (a) => {
                if (is_infinity(a)) return 'Limit';
                const wsm = WSM.fromString(a);
                return wsm.toWorm().join(',');
            },
            html: (a) => {
                if (is_infinity(a)) return 'Limit';
                const wsm = WSM.fromString(a);
                return wsm.toWorm().join(',');
            },
        },
    },

    is_limit: (a) => {
        if (is_infinity(a)) return true;
        if (typeof a === 'string') {
            try {
                const wsm = WSM.fromString(a);
                const parent = wsm.parent;
                if (parent.length === 0) return false;
                const lastCol = parent.length - 1;
                for (let r = 0; r < parent[lastCol].length; r++) {
                    if (parent[lastCol][r] !== -1) return true;
                }
                return false;
            } catch {
                return false;
            }
        }
        return false;
    },

    compare: (a, b) => {
        if (is_infinity(a) && is_infinity(b)) return 0;
        if (is_infinity(a)) return 1;
        if (is_infinity(b)) return -1;
        try {
            const wsmA = WSM.fromString(a);
            const wsmB = WSM.fromString(b);
            return WSM.compareParentMatrices(wsmA.parent, wsmB.parent);
        } catch {
            return 0;
        }
    },

    FS: (a, i) => {
        if (is_infinity(a)) {
            const parent: number[][] = [];
            const col0 = Array(i + 1).fill(-1);
            const col1 = Array(i + 1).fill(0);
            parent.push(col0);
            parent.push(col1);
            const wsm = new WSM(parent);
            return wsm.format();
        }
        try {
            const wsm = WSM.fromString(a);
            if (i === 0) {
                const newParent = wsm.parent.slice(0, -1);
                const newWsm = new WSM(newParent);
                return newWsm.format();
            }
            const result = wsm.expand(i);
            return result.wsm.format();
        } catch {
            return '';
        }
    },

    init: () => [INFINITY, ''],

    credit_text_id: 'credit.dsm',
};
