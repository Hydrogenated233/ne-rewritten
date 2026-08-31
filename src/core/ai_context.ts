import API_DOC from '@/assets/api.md?raw';
import MAKING_GUIDE from '@/assets/making-a-notation.md?raw';
import PRSS_TEMPLATE from '@/assets/template.js?raw';

/**
 * Context shipped with the application. Keeping this in the bundle avoids a
 * second documentation request and does not depend on a Codex skill runtime.
 */
export const AI_BUILTIN_CONTEXT = [
    '# Authoring constraints',
    'Write a self-contained JavaScript file using the native ne-rewritten format.',
    'Use register_notation(...) and register_category(...) only; never rely on globals from another local file.',
    'The file must register at least one notation or category and must not execute a notation automatically.',
    'A notation needs id, name, display, init, is_limit, compare, and FS.',
    'FS(expression, index) returns the index-th fundamental-sequence term. Handle Infinity explicitly when it is a limit.',
    'display.plain is used for parsing and tool output. Put parsers inside display.from_display when parsing is supported.',
    'Keep generated files wrapped in an IIFE or otherwise avoid leaking variables into the page.',
    '',
    '# docs/making-a-notation.md',
    MAKING_GUIDE,
    '',
    '# Embedded PrSS and generated-family template',
    PRSS_TEMPLATE,
    '',
    '# Registry and FS API reference',
    API_DOC,
].join('\n');
