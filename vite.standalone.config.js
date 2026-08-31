import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import path from 'path';

const root = __dirname;

/**
 * Runtime used by Settings -> Export standalone app.
 *
 * NE source is emitted as one classic script so it can be embedded in a local
 * HTML file. Large third-party libraries are supplied as pinned CDN globals by
 * the generated loader and replaced with these tiny build-time shims.
 */
export default defineConfig({
    base: './',
    define: {
        'import.meta.env.VITE_STANDALONE': JSON.stringify('true'),
    },
    plugins: [vue()],
    resolve: {
        alias: [
            { find: '@', replacement: path.resolve(root, 'src') },
            { find: /^katex$/, replacement: path.resolve(root, 'src/standalone-cdn/katex.ts') },
            {
                find: /^katex\/dist\/katex.min.css$/,
                replacement: path.resolve(root, 'src/standalone-cdn/empty.css'),
            },
            { find: /^marked$/, replacement: path.resolve(root, 'src/standalone-cdn/marked.ts') },
            {
                find: /^read-excel-file\/browser$/,
                replacement: path.resolve(root, 'src/standalone-cdn/read-excel-file.ts'),
            },
            {
                find: /^write-excel-file\/browser$/,
                replacement: path.resolve(root, 'src/standalone-cdn/write-excel-file.ts'),
            },
        ],
    },
    build: {
        target: 'es2017',
        outDir: 'dist-standalone',
        rollupOptions: {
            external: ['vue'],
            output: {
                format: 'iife',
                name: 'NEStandalone',
                globals: { vue: 'Vue' },
            },
        },
    },
});
