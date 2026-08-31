// Standard ne-rewritten local notation template.
// It registers one ordinary PrSS notation and one generated PrSS demo family.
;(() => {
    'use strict';

    const ROOT_CATEGORY_ID = 'template-prss-examples';
    const GENERATED_CATEGORY_ID = 'template-prss-family';

    function assert_sequence(sequence) {
        if (!Array.isArray(sequence)) throw new TypeError('PrSS expression must be an array or Infinity.');
        for (const term of sequence) {
            if (!Number.isSafeInteger(term) || term < 0) {
                throw new TypeError('PrSS terms must be non-negative safe integers.');
            }
        }
    }

    function assert_index(index) {
        if (!Number.isSafeInteger(index) || index < 0) {
            throw new RangeError('The fundamental-sequence index must be a non-negative safe integer.');
        }
    }

    function display_prss(expression) {
        if (expression === Infinity) return 'Limit';
        assert_sequence(expression);
        return '[' + expression.join(',') + ']';
    }

    function display_prss_latex(expression) {
        if (expression === Infinity) return '\\mathrm{Limit}';
        assert_sequence(expression);
        return '\\langle ' + expression.join(', ') + ' \\rangle';
    }

    function display_prss_compact(expression) {
        if (expression === Infinity) return '∞';
        assert_sequence(expression);
        return expression.length === 0 ? '∅' : expression.join(',');
    }

    function parse_prss(value) {
        let source = String(value).trim();
        if (/^(?:Limit|Infinity|∞)$/i.test(source)) return Infinity;
        if (source === '' || source === '[]' || source === '()' || source === '∅') return [];
        if (
            (source.startsWith('[') && source.endsWith(']')) ||
            (source.startsWith('(') && source.endsWith(')'))
        ) {
            source = source.slice(1, -1).trim();
        }
        if (source === '') return [];

        const sequence = source.split(',').map((part) => {
            const token = part.trim();
            if (!/^(?:0|[1-9]\d*)$/.test(token)) throw new SyntaxError('Invalid PrSS sequence.');
            const term = Number(token);
            if (!Number.isSafeInteger(term)) throw new RangeError('PrSS term is outside the safe integer range.');
            return term;
        });
        assert_sequence(sequence);
        return sequence;
    }

    function compare_prss(left, right) {
        if (left === Infinity) return right === Infinity ? 0 : 1;
        if (right === Infinity) return -1;
        assert_sequence(left);
        assert_sequence(right);

        const length = Math.min(left.length, right.length);
        for (let index = 0; index < length; index++) {
            if (left[index] !== right[index]) return left[index] < right[index] ? -1 : 1;
        }
        return left.length === right.length ? 0 : left.length < right.length ? -1 : 1;
    }

    function is_prss_limit(expression) {
        if (expression === Infinity) return true;
        assert_sequence(expression);
        return expression.length > 0 && expression[expression.length - 1] > 1;
    }

    function find_bad_root(sequence, last) {
        for (let index = sequence.length - 2; index >= 0; index--) {
            if (sequence[index] < last) return index;
        }
        return -1;
    }

    function expand_prss(sequence, index) {
        if (sequence.length === 0) return [];

        const last = sequence[sequence.length - 1];
        if (last <= 1) return sequence.slice(0, -1);

        const bad_root = find_bad_root(sequence, last);
        if (bad_root < 0) return sequence.slice(0, -1);

        const good_part = sequence.slice(0, bad_root);
        const bad_part = sequence.slice(bad_root, -1);
        const result = good_part.slice();
        for (let repeat = 0; repeat < index; repeat++) result.push(...bad_part);
        return result;
    }

    function limit_term(index) {
        return Array.from({ length: index }, (_, term) => term + 1);
    }

    function create_prss_definition(options) {
        const stride = options.stride ?? 1;
        if (!Number.isSafeInteger(stride) || stride < 1) throw new RangeError('PrSS stride must be positive.');
        const cache = new Map();

        function fundamental_sequence(expression, index) {
            assert_index(index);
            const scaled_index = index * stride;
            if (!Number.isSafeInteger(scaled_index)) throw new RangeError('Scaled index exceeds the safe integer range.');
            if (expression === Infinity) return limit_term(scaled_index);
            assert_sequence(expression);

            const key = JSON.stringify(expression) + '@' + scaled_index;
            const cached = cache.get(key);
            if (cached) return cached.slice();
            const result = expand_prss(expression, scaled_index);
            cache.set(key, result.slice());
            return result;
        }

        return {
            id: options.id,
            name: options.name,
            simple_name: options.simple_name,
            description: options.description,
            category_id: options.category_id,
            display: {
                plain: display_prss,
                latex: display_prss_latex,
                from_display: parse_prss,
            },
            display_equiv: {
                compact: {
                    name: 'Compact sequence',
                    plain: display_prss_compact,
                    from_display: parse_prss,
                },
            },
            is_limit: is_prss_limit,
            compare: compare_prss,
            FS: fundamental_sequence,
            init: () => [Infinity, []],
        };
    }

    register_category({
        id: ROOT_CATEGORY_ID,
        name: 'Local PrSS examples',
        simple_name: 'PrSS examples',
    });

    register_notation(
        create_prss_definition({
            id: 'template-prss',
            name: 'Primitive Sequence System template',
            simple_name: 'PrSS template',
            category_id: ROOT_CATEGORY_ID,
            description: 'Standard PrSS example written with the native ne-rewritten registration API.',
        }),
    );

    register_category({
        id: GENERATED_CATEGORY_ID,
        name: 'Generated PrSS stride demos',
        simple_name: 'n-step PrSS',
        parent_id: ROOT_CATEGORY_ID,
        generator: {
            start: 1,
            initial: 2,
            create(index) {
                return create_prss_definition({
                    id: 'template-prss-step-' + index,
                    name: index + '-step PrSS demo',
                    simple_name: index + '-PrSS',
                    category_id: GENERATED_CATEGORY_ID,
                    description:
                        'Generator API demonstration. It samples the PrSS fundamental sequence with stride ' + index + '.',
                    stride: index,
                });
            },
        },
    });
})();
