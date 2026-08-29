/**
 * 当前构建是否为兼容版 (老浏览器单包构建)。
 * 由 Vite 编译时烘焙的 base 判断: 兼容版构建的 base 为 `/.../compat/`,
 * 非兼容版为 `/.../`。这是构建产物的固有属性, 与部署方式无关。
 */
export const IS_COMPAT = import.meta.env.BASE_URL.replace(/\/+$/, '').endsWith('/compat');

/** 兼容版页面的根相对 URL (如 `/ne-rewritten/compat/`)。仅在非兼容版构建中有意义。 */
export const COMPAT_URL = import.meta.env.BASE_URL + 'compat/';
