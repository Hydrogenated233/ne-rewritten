import { defineConfig, mergeConfig } from 'vite';
import base from './vite.config.js';

/**
 * 兼容老浏览器的构建配置: 把动态 import 全部内联为单包 (不使用运行时 import()),
 * 并把语法目标降到 es2017 (老到不支持 import() 的浏览器通常也缺现代语法)。
 * 用法: npm run build:compat
 * 代价: 失去代码分割与懒加载, katex/codemirror/excel/marked 全部进入首屏包。
 *
 * outDir 独立为 dist-compat, 避免覆盖默认构建的 dist/ (部署时并入 dist/compat/)。
 */
export default defineConfig(
    mergeConfig(base, {
        build: {
            target: 'es2017',
            outDir: 'dist-compat',
            rollupOptions: {
                output: {
                    inlineDynamicImports: true,
                },
            },
        },
    }),
);
