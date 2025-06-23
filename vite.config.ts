import { defineConfig, loadEnv } from 'vite'
import vercel from 'vite-plugin-vercel';
import devServer from "@hono/vite-dev-server";
import { visualizer } from 'rollup-plugin-visualizer';

process.env = { ...process.env, ...loadEnv("production", process.cwd(), "") };

export default defineConfig({
    plugins: [
        vercel(),
        devServer({
            entry: "./api/[[...route]].ts",
            exclude: [
                /.*\.ts$/,
                /.*\.tsx$/,
                /.*\.js$/,
                /.*\.jsx$/,
                /.*\.html$/,
                /.*\.css$/,
                /^\/@.+$/,
                /^\/favicon\.ico$/,
                /^\/src\/.*/,
                /^\/public\/.*/,
                /^\/node_modules\/.*/,
                /^\/vite\.svg$/,
                /^\/$/, // Exclude root route to let Vite serve index.html
            ],
        }),
        !("VERCEL" in process.env) && visualizer()
    ],
    server: {
        host: "localhost",
        port: 5173,
        cors: {
            origin: "*",
        },
        hmr: {
            host: "localhost",
            protocol: "ws",
        },
    },
    build: {
        minify: true,
        manifest: true,
        outDir: "dist",
        assetsDir: "assets",
        rollupOptions: {
            input: {
                main: "./src/main.ts",
            },
            output: {
                format: "es",
                entryFileNames: "main.js",
                chunkFileNames: "assets/[name].[hash].js",
                assetFileNames: "assets/[name].[hash][extname]",
                compact: true,
                globals: {
                    jquery: "$",
                },
            },
            external: ["jquery"],
        },
        modulePreload: {
            polyfill: true,
        },
    },
})