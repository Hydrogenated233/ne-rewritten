/**
 * 当前构建是否为兼容版 (老浏览器单包构建)。
 * 由 Vite 编译时烘焙的 base 判断: 兼容版构建的 base 为 `/.../compat/`,
 * 非兼容版为 `/.../`。这是构建产物的固有属性, 与部署方式无关。
 */
export const IS_COMPAT = import.meta.env.BASE_URL.replace(/\/+$/, '').endsWith('/compat');

/** Runtime flag used by exported standalone HTML files. */
export const IS_STANDALONE =
    import.meta.env.VITE_STANDALONE === 'true' ||
    (typeof window !== 'undefined' && (window as typeof window & { __NE_STANDALONE__?: boolean }).__NE_STANDALONE__ === true);

/**
 * `?no-local-files` is a per-page safe mode. It skips execution without
 * changing local file contents, trust, or enabled state.
 */
export function local_notation_execution_disabled(
    search = typeof window === 'undefined' ? '' : window.location.search,
): boolean {
    return new URLSearchParams(search).has('no-local-files');
}

export const LOCAL_NOTATION_EXECUTION_DISABLED = local_notation_execution_disabled();

/** 兼容版页面的根相对 URL (如 `/ne-rewritten/compat/`)。仅在非兼容版构建中有意义。 */
export const COMPAT_URL = import.meta.env.BASE_URL + 'compat/';
