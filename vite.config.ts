import { defineConfig } from 'vite'
import path from 'node:path'
import electron from 'vite-plugin-electron/simple'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
    plugins: [
        react(),
        electron({
            main: {
                entry: {
                    index: 'src/main/index.ts',
                    dicomWorker: 'src/main/database/dicomWorker.ts'
                },
                vite: {
                    build: {
                        rollupOptions: {
                            external: ['better-sqlite3'],
                            output: {
                                entryFileNames: '[name].js',
                                chunkFileNames: '[name].js',
                                assetFileNames: '[name].[ext]',
                            }
                        },
                    },
                },
            },
            preload: {
                // Shortcut of `build.rollupOptions.input`.
                // Preload scripts may contain Web assets, so use the `build.rollupOptions.input` instead `build.lib.entry`.
                input: 'src/main/preload.ts',
                vite: {
                    build: {
                        rollupOptions: {
                            external: ['better-sqlite3'],
                        },
                    },
                },
            },
            // Ployfill the Electron and Node.js built-in modules for Renderer process.
            // See 👉 https://github.com/electron-vite/vite-plugin-electron-renderer
            // renderer: {},
        }),
    ],
    resolve: {
        alias: {
            '@renderer': path.resolve(__dirname, 'src/renderer/src'),
            '@main': path.resolve(__dirname, 'src/main'),
        },
    },
    build: {
        target: 'esnext',
    },
    optimizeDeps: {
        exclude: ['@icr/polyseg-wasm'],
    }
})
