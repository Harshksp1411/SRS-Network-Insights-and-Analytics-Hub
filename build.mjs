import { build } from 'esbuild';
import { execSync } from 'child_process';
import fs from 'fs';

// Two self-contained pages from the same source, laid out as the published site:
//   dist/site/index.html        the operations console
//   dist/site/demos/index.html  the live demos
const NAME = 'SRS Networks Insights and Analytics Hub';
fs.mkdirSync('dist', { recursive: true });
execSync('npx tailwindcss -i src/index.css -o dist/main.css --minify', { stdio: 'pipe' });
const css = fs.readFileSync('dist/main.css', 'utf8');
const icon = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 44 36"><path d="M3 17 L22 4 L41 17" fill="none" stroke="#762123" stroke-width="5"/><path d="M9 19 V33 H35 V19" fill="none" stroke="#111" stroke-width="3"/></svg>')}`;

const PAGES = [
  { out: 'dist/site/index.html', demosOnly: false, title: NAME, desc: 'SRS Distribution managed network operations console – operated by Movate. Sample data; items marked illustrative are not SRS facts.' },
  { out: 'dist/site/demos/index.html', demosOnly: true, title: `${NAME} – Live demos`, desc: 'Scripted SRS branch situations, each played on one screen with every system involved – operated by Movate. Sample data.' },
];

for (const p of PAGES) {
  const r = await build({ entryPoints: ['src/main.jsx'], bundle: true, minify: true, format: 'iife', jsx: 'automatic', loader: { '.js': 'jsx', '.json': 'json' }, define: { 'process.env.NODE_ENV': '"production"', __DEMOS_ONLY__: String(p.demosOnly) }, outdir: 'dist', write: false, logLevel: 'warning' });
  const js = r.outputFiles.find(f => f.path.endsWith('.js')).text.replace(/<\/script/gi, '<\\/script');
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${p.title}</title>
<meta name="description" content="${p.desc}" />
<link rel="icon" href="${icon}" />
<style>${css}</style>
</head>
<body>
<div id="root"></div>
<script>${js}</script>
</body>
</html>`;
  fs.mkdirSync(p.out.replace(/\/[^/]+$/, ''), { recursive: true });
  fs.writeFileSync(p.out, html);
  console.log(p.out, 'bytes', html.length);
}
