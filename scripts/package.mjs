// Produces dist/echoaware.zip — the Chrome Web Store submission bundle.
//
// Includes only what the runtime needs at install time:
//   - manifest.json
//   - dist/*.js                   (bundled service worker, content, offscreen, popup)
//   - assets/                     (icons, fonts, models, wasm)
//   - src/popup/popup.html, popup.css
//   - src/offscreen/offscreen.html
//
// Excludes: src/**/*.js (unbundled sources), tests/, .env, node_modules, .git,
// scripts/, build.js, worker/, .claude/, README/PRIVACY (linked from listing).

// Shells out to PowerShell's Compress-Archive on Windows or `zip -r` on POSIX
// to avoid adding a dependency. Both produce CWS-valid zips.

import { existsSync, statSync, readdirSync, mkdirSync } from 'fs';
import { dirname, join, relative, sep } from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const OUT_DIR = join(root, 'dist');
const OUT_ZIP = join(OUT_DIR, 'echoaware.zip');

const INCLUDE = [
  'manifest.json',
  'dist/background.js',
  'dist/content.js',
  'dist/offscreen.js',
  'dist/popup.js',
  'src/popup/popup.html',
  'src/popup/popup.css',
  'src/offscreen/offscreen.html',
  'assets',
];

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

function collect() {
  const files = [];
  for (const item of INCLUDE) {
    const abs = join(root, item);
    if (!existsSync(abs)) {
      throw new Error(`Missing required file: ${item} (run \`npm run build\` first?)`);
    }
    if (statSync(abs).isDirectory()) {
      files.push(...walk(abs));
    } else {
      files.push(abs);
    }
  }
  return files;
}

if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });

const files = collect().map((f) => relative(root, f).split(sep).join('/'));

if (process.platform === 'win32') {
  // PowerShell's Compress-Archive does not have a "list of files" mode that
  // preserves directory structure cleanly. Stage into a temp dir, then zip.
  const stagingDir = join(OUT_DIR, '.package-staging');
  spawnSync('powershell', ['-NoProfile', '-Command', `
    if (Test-Path '${stagingDir}') { Remove-Item -Recurse -Force '${stagingDir}' }
    New-Item -ItemType Directory -Path '${stagingDir}' | Out-Null
  `], { stdio: 'inherit' });

  for (const rel of files) {
    const src = join(root, rel);
    const dst = join(stagingDir, rel);
    spawnSync('powershell', ['-NoProfile', '-Command', `
      New-Item -ItemType Directory -Path '${dirname(dst)}' -Force | Out-Null
      Copy-Item -LiteralPath '${src}' -Destination '${dst}'
    `]);
  }

  if (existsSync(OUT_ZIP)) {
    spawnSync('powershell', ['-NoProfile', '-Command', `Remove-Item -Force '${OUT_ZIP}'`]);
  }
  const result = spawnSync('powershell', ['-NoProfile', '-Command', `
    Compress-Archive -Path '${stagingDir}\\*' -DestinationPath '${OUT_ZIP}' -CompressionLevel Optimal
  `], { stdio: 'inherit' });
  spawnSync('powershell', ['-NoProfile', '-Command', `Remove-Item -Recurse -Force '${stagingDir}'`]);

  if (result.status !== 0) throw new Error('Compress-Archive failed');
} else {
  // POSIX path: use `zip -r` (BSD/GNU zip)
  const result = spawnSync('zip', ['-rq', OUT_ZIP, ...files], { cwd: root, stdio: 'inherit' });
  if (result.status !== 0) throw new Error('zip command failed (install `zip`?)');
}

const sizeKb = (statSync(OUT_ZIP).size / 1024).toFixed(1);
console.log(`package: wrote dist/echoaware.zip (${sizeKb} KiB, ${files.length} files)`);
