import * as esbuild from 'esbuild';

const watch = process.argv.includes('--watch');

const sharedConfig = {
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: ['chrome120'],
  outdir: '.',
  sourcemap: watch ? 'inline' : false,
  minify: !watch,
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
