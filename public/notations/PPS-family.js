/*
 * Standalone PPS-family notation bundle for ne-rewritten.
 *
 * This file intentionally has no imports. It only expects the local notation
 * runtime to provide lexical register_category and register_notation functions.
 * The notation ids match the built-in PPS family, so load this file only in a
 * registry where those built-ins are not already registered.
 */
;(function () {
    'use strict'

    var category_id = 'category-pps'

    function is_limit_sentinel(expr) {
        return expr === Infinity || (Array.isArray(expr) && expr.length === 1 && expr[0] === Infinity)
    }

    function sequence_compare(left, right) {
        var length = Math.min(left.length, right.length)
        for (var index = 0; index < length; index++) {
            if (left[index] < right[index]) return -1
            if (left[index] > right[index]) return 1
        }
        if (left.length < right.length) return -1
        if (left.length > right.length) return 1
        return 0
    }

    function escape_html(value) {
        return String(value).replace(/[&<>"']/g, function (character) {
            return {
                '&': '&amp;',
                '<': '&lt;',
                '>': '&gt;',
                '"': '&quot;',
                "'": '&#39;',
            }[character]
        })
    }

    function display_plain(expr) {
        if (is_limit_sentinel(expr)) return 'Limit'
        return Array.isArray(expr) ? expr.join(',') : String(expr)
    }

    function display_html(expr) {
        if (is_limit_sentinel(expr)) return 'Limit'
        if (!Array.isArray(expr)) return escape_html(expr)
        return expr
            .map(function (value, index) {
                return escape_html(value) + '<sub class="pps-column-index">' + (index + 1) + '</sub>'
            })
            .join('')
    }

    function display_latex(expr) {
        if (is_limit_sentinel(expr)) return 'Limit'
        if (!Array.isArray(expr)) return String(expr)
        return expr
            .map(function (value, index) {
                return String(value) + '_{\\color{gray}' + (index + 1) + '}'
            })
            .join('')
    }

    function parse_pps(source) {
        var text = String(source).trim()
        if (text === 'Limit' || text === 'Infinity' || text === '\u221e') return [Infinity]
        return text.split(',').map(function (part) {
            return parseInt(part.trim(), 10)
        })
    }

    function parse_pps4(source, name) {
        var text = String(source).trim()
        if (text === 'Limit') return [Infinity]
        var result = text.split(',').map(function (part) {
            return parseInt(part.trim(), 10)
        })
        if (result.some(Number.isNaN)) throw new Error('Illegal ' + name + ' sequence')
        return result
    }

    function limit(index) {
        var result = []
        for (var current = 0; current <= index; current++) result.push(current)
        return result
    }

    function is_pps_limit(expr) {
        return (
            is_limit_sentinel(expr) ||
            (Array.isArray(expr) && expr.length > 0 && expr[expr.length - 1] > 0)
        )
    }

    function expand_pps(sequence, fs_term) {
        var length = sequence.length
        var last = length > 0 ? sequence[length - 1] : null
        var parent_column = last
        var bad_root = null
        var bad_part = []
        var copy_width = 0
        var weak_expand = false

        if (parent_column >= 1 && parent_column <= length) {
            bad_root = parent_column
            var root_value = sequence[bad_root - 1]
            bad_part = sequence.slice(bad_root, length - 1)
            copy_width = length - bad_root
            weak_expand = bad_part.some(function (value) {
                return value === root_value
            })
        } else {
            copy_width = length - parent_column
        }

        var result = sequence.slice(0, -1)
        for (var copy = 1; copy <= fs_term; copy++) {
            result.push(weak_expand ? root_value : last - 1)
            result = result.concat(
                bad_part.map(function (value) {
                    return value < last ? value : value + copy_width * copy
                }),
            )
        }
        return result
    }

    function pps_fs(sequence, fs_term) {
        if (is_limit_sentinel(sequence)) return limit(fs_term)
        if (!Array.isArray(sequence) || sequence.length === 0) return []
        return expand_pps(sequence, fs_term)
    }

    function expand_pps4(sequence, fs_term, variant) {
        if (sequence.length === 0) return []

        var y = sequence.length
        var x = sequence[y - 1]

        if (x === 0 || x > y) return sequence.slice(0, -1)

        var b = sequence[x - 1]
        var width = y - x
        var weak_expand = false

        for (var column = x + 1; column < y; column++) {
            if (sequence[column - 1] === b) {
                weak_expand = true
                break
            }
        }

        var value
        var strong_expand = false
        if (weak_expand) {
            value = b
        } else {
            var found_column = -1
            for (var candidate = x - 2; candidate >= b; candidate--) {
                var candidate_value = sequence[candidate]
                if (variant === 'pps4') {
                    if (candidate_value <= b) {
                        found_column = candidate + 1
                        break
                    }
                } else if (variant === 'ewpps4') {
                    if (candidate_value === b) {
                        found_column = candidate + 1
                        break
                    }
                    if (candidate_value < b) break
                } else if (candidate_value === b) {
                    found_column = candidate + 1
                    break
                }
            }
            if (found_column !== -1) {
                value = found_column
                strong_expand = variant === 'tpps4'
            } else {
                value = b
            }
        }

        var total_length = y + fs_term * width
        var result

        if (strong_expand) {
            result = sequence.slice(0, y - 1)
            result.push(value)

            for (var position = y + 1; position <= total_length; position++) {
                var is_last_copy = position > y && (position - y) % width === 0
                if (is_last_copy) {
                    var copy_number = (position - y) / width
                    result.push(value + copy_number * width)
                } else {
                    var source_position = position - width
                    var source_value = result[source_position - 1]
                    result.push(source_value >= x ? source_value + width : source_value)
                }
            }
            return result
        }

        result = sequence.slice(0, y - 1)
        result.push(value)

        var start_column = y - width + 1
        for (var index = start_column; result.length < total_length; index++) {
            var source_index = index - 1
            if (source_index >= result.length) break
            var source = result[source_index]
            result.push(source >= x ? source + width : source)
        }
        return result
    }

    function create_pps4_notation(id, name) {
        var cache = {}

        function fs(sequence, fs_term) {
            if (is_limit_sentinel(sequence)) return limit(fs_term)
            if (!Array.isArray(sequence) || sequence.length === 0) return []

            var key = String(sequence)
            if (!cache[key]) cache[key] = []
            else if (cache[key][fs_term] !== undefined) return cache[key][fs_term]

            var result = expand_pps4(sequence, fs_term, id)
            cache[key][fs_term] = result
            return result
        }

        return {
            id: id,
            name: name,
            category_id: category_id,
            display: {
                plain: display_plain,
                html: display_html,
                latex: display_latex,
                from_display: function (source) {
                    return parse_pps4(source, name)
                },
            },
            is_limit: is_pps_limit,
            compare: sequence_compare,
            FS: fs,
            FS_alter: fs,
            init: function () {
                return [[Infinity], []]
            },
        }
    }

    function ensure_second_pps4_array(expr) {
        if (expr === Infinity) return [Infinity]
        if (Array.isArray(expr)) return expr
        if (!expr || typeof expr !== 'object') return null

        var result = []
        for (var key in expr) {
            if (Object.prototype.hasOwnProperty.call(expr, key) && !Number.isNaN(parseInt(key, 10))) {
                result.push(expr[key])
            }
        }
        return result
    }

    function is_second_pps4_infinity(expr) {
        var sequence = ensure_second_pps4_array(expr)
        return !!sequence && sequence.length === 1 && sequence[0] === Infinity
    }

    function parse_second_pps4(source) {
        var text = source === undefined || source === null ? '' : String(source).trim()
        if (!text || text === '(empty)') return []
        if (/^(?:limit|infinity|\u221e)$/i.test(text)) return [Infinity]

        var parts = text.split(',')
        var sequence = []
        for (var index = 0; index < parts.length; index++) {
            var token = parts[index].trim()
            if (/^w$/i.test(token)) {
                sequence.push(Infinity)
                continue
            }
            var value = parseInt(token, 10)
            if (Number.isNaN(value)) throw new Error('Illegal Second PPS4 sequence')
            sequence.push(value)
        }
        return sequence
    }

    function display_second_pps4_plain(expr) {
        if (is_second_pps4_infinity(expr)) return 'Limit'
        if (typeof expr === 'number') return String(expr)
        var sequence = ensure_second_pps4_array(expr)
        if (sequence === null) return String(expr)
        if (sequence.length === 0) return '(empty)'
        return sequence.join(',')
    }

    function display_second_pps4_html(expr) {
        if (is_second_pps4_infinity(expr)) return 'Limit'
        if (typeof expr === 'number') return display_html([expr])
        var sequence = ensure_second_pps4_array(expr)
        if (sequence === null) return String(expr)
        if (sequence.length === 0) return '(empty)'
        return display_html(sequence)
    }

    function display_second_pps4_latex(expr) {
        if (is_second_pps4_infinity(expr)) return 'Limit'
        if (typeof expr === 'number') return display_latex([expr])
        var sequence = ensure_second_pps4_array(expr)
        if (sequence === null) return String(expr)
        if (sequence.length === 0) return '\\emptyset'
        return display_latex(sequence)
    }

    function is_second_pps4_limit(expr) {
        if (is_second_pps4_infinity(expr)) return true
        if (typeof expr === 'number') return expr > 0
        var sequence = ensure_second_pps4_array(expr)
        return !!sequence && sequence.length > 0 && sequence[sequence.length - 1] > 0
    }

    function compare_second_pps4(left, right) {
        if (typeof left === 'number') left = [left]
        if (typeof right === 'number') right = [right]

        var left_sequence = ensure_second_pps4_array(left)
        var right_sequence = ensure_second_pps4_array(right)
        if (!left_sequence || !right_sequence) {
            if (!left_sequence && !right_sequence) return 0
            return left_sequence ? 1 : -1
        }
        return sequence_compare(left_sequence, right_sequence)
    }

    function expand_second_pps4(sequence, count) {
        if (!Array.isArray(sequence) || sequence.length === 0) return []

        var y = sequence.length
        var x = sequence[y - 1]
        if (x === 0) return sequence.slice(0, -1)
        if (x > y) throw new Error('Last value ' + x + ' is outside sequence length ' + y)

        var b = sequence[x - 1]
        var width = y - x
        var value
        var strong_expand = false
        var found_less_or_equal = false

        for (var column = y - 1; column >= x + 1; column--) {
            if (sequence[column - 1] <= b) {
                found_less_or_equal = true
                break
            }
        }

        if (found_less_or_equal) {
            value = b
        } else {
            var found_column = null
            var strong_start = b + 1
            var strong_end = x - 1
            if (strong_start <= strong_end) {
                for (var candidate = strong_end; candidate >= strong_start; candidate--) {
                    if (sequence[candidate - 1] === b) {
                        found_column = candidate
                        break
                    }
                }
            }
            if (found_column !== null) {
                value = found_column
                strong_expand = true
            } else {
                value = b
            }
        }

        var total_length = y + count * width - 1
        var result = new Array(total_length)
        var index

        for (index = 0; index < x; index++) result[index] = sequence[index]
        for (index = x; index < y - 1; index++) result[index] = sequence[index]
        result[y - 1] = value

        for (index = x; index < y; index++) {
            var base_value = index === y - 1 ? value : sequence[index]
            var shifts = index === y - 1 ? count - 1 : count
            for (var copy = 1; copy <= shifts; copy++) {
                var position = index + copy * width
                if (position >= total_length) continue
                if ((index === y - 1 && strong_expand) || base_value >= x) {
                    result[position] = base_value + copy * width
                } else {
                    result[position] = base_value
                }
            }
        }
        return result
    }

    function second_pps4_fs(expr, index) {
        var fs_index = Number(index)
        if (!Number.isSafeInteger(fs_index) || fs_index < 0) {
            throw new Error('FS index must be a non-negative safe integer')
        }
        if (is_second_pps4_infinity(expr)) return limit(fs_index)
        if (typeof expr === 'number') expr = [expr]

        var sequence = ensure_second_pps4_array(expr)
        if (!sequence || sequence.length === 0) return []
        if (fs_index === 0) return sequence.slice(0, -1)
        return expand_second_pps4(sequence, fs_index)
    }

    register_category({
        id: category_id,
        name: 'Parented Predecessor Sequence (PPS)',
        simple_name: 'PPS',
    })

    register_notation({
        id: 'pps',
        name: 'Parented predecessor sequence',
        category_id: category_id,
        display: {
            plain: display_plain,
            html: display_html,
            latex: display_latex,
            from_display: parse_pps,
        },
        is_limit: is_pps_limit,
        compare: sequence_compare,
        FS: pps_fs,
        init: function () {
            return [[Infinity], []]
        },
    })

    register_notation(create_pps4_notation('pps4', 'PPS4'))
    register_notation(create_pps4_notation('wpps4', 'Weak PPS4'))
    register_notation(create_pps4_notation('tpps4', 'Third PPS4'))
    register_notation(create_pps4_notation('ewpps4', 'Extremely Weak PPS4'))

    register_notation({
        id: 'spps4',
        name: 'Second PPS4',
        category_id: category_id,
        display: {
            plain: display_second_pps4_plain,
            html: display_second_pps4_html,
            latex: display_second_pps4_latex,
            from_display: parse_second_pps4,
        },
        is_limit: is_second_pps4_limit,
        compare: compare_second_pps4,
        FS: second_pps4_fs,
        FS_alter: second_pps4_fs,
        FS_short: second_pps4_fs,
        init: function () {
            return [[Infinity], []]
        },
    })
})()
