import * as esbuild from 'esbuild';
import { prepareAssets } from './scripts/prepare-assets.mjs';

const watch = process.argv.includes('--watch');

await prepareAssets();

// Build-time constant for the inference Worker. Defaults to staging if not set,
// so dev builds and `npm run build` both work without a .env file. Set
// WORKER_URL=https://echoaware-api.<subdomain>.workers.dev/v1/escape-queries
// for the production build (Phase 5).
const WORKER_URL =
  process.env.WORKER_URL ||
  'https://echoaware-api.younes-rahati.workers.dev/v1/escape-queries';

const define = {
  'process.env.WORKER_URL': JSON.stringify(WORKER_URL),
};

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
