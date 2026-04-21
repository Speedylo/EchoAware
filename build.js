import * as esbuild from 'esbuild';
import { readFileSync } from 'fs';

const watch = process.argv.includes('--watch');

function loadEnv(path = '.env') {
  try {
    return Object.fromEntries(
      readFileSync(path, 'utf8')
        .split('\n')
        .filter(line => line && !line.startsWith('#') && line.includes('='))
        .map(line => { const i = line.indexOf('='); return [line.slice(0, i).trim(), line.slice(i + 1).trim()]; })
    );
  } catch {
    return {};
  }
}

const env = loadEnv();

const define = Object.fromEntries(
  Object.entries(env).map(([k, v]) => [`process.env.${k}`, JSON.stringify(v)])
);

const sharedConfig = {
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: ['chrome120'],
  outdir: '.',
  sourcemap: watch ? 'inline' : false,
  minify: !watch,
  define,
};

const entryPoints = [
  { in: 'src/background/serviceWorker.js', out: 'dist/background' },
  { in: 'src/content/contentScript.js',    out: 'dist/content'    },
  { in: 'src/offscreen/offscreen.js',      out: 'dist/offscreen'  },
  { in: 'src/popup/popup.js',              out: 'dist/popup'      },
];

if (watch) {
  const ctx = await esbuild.context({ ...sharedConfig, entryPoints });
  await ctx.watch();
  console.log('esbuild: watching...');
} else {
  await esbuild.build({ ...sharedConfig, entryPoints });
  console.log('esbuild: build complete');
}
