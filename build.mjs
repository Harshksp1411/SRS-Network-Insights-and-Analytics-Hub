import { build } from 'esbuild';
import { execSync } from 'child_process';
import fs from 'fs';
const r = await build({ entryPoints: ['src/main.jsx'], bundle: true, minify: true, format: 'iife', jsx: 'automatic', loader: { '.js': 'jsx', '.json': 'json' }, define: { 'process.env.NODE_ENV': '"production"' }, outdir: 'dist', write: true, logLevel: 'warning', metafile: true });
execSync('npx tailwindcss -i src/index.css -o dist/main.css --minify', { stdio: 'pipe' });
const js = fs.readFileSync('dist/main.js', 'utf8').replace(/<\/script/gi, '<\\/script');
const css = fs.readFileSync('dist/main.css', 'utf8');
const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>SRS Network Intelligence Hub</title>
<meta name="description" content="SRS Distribution managed network operations console – operated by Movate. Sample data; items marked illustrative are not SRS facts." />
<link rel="icon" href="data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 44 36"><path d="M3 17 L22 4 L41 17" fill="none" stroke="#762123" stroke-width="5"/><path d="M9 19 V33 H35 V19" fill="none" stroke="#111" stroke-width="3"/></svg>')}" />
<style>${css}</style>
</head>
<body>
<div id="root"></div>
<script>${js}</script>
</body>
</html>`;
fs.writeFileSync('dist/SRS-Network-Intelligence-Hub.html', html);
console.log('html bytes', html.length, 'js', js.length, 'css', css.length);
