import { existsSync, mkdirSync, copyFileSync, createWriteStream } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { Readable } from 'stream';
import { pipeline as streamPipeline } from 'stream/promises';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const MODEL_REPO = 'Xenova/all-MiniLM-L6-v2';
const MODEL_REVISION = 'main';
const MODEL_DIR = join(root, 'assets', 'models', 'Xenova', 'all-MiniLM-L6-v2');
const WASM_DIR = join(root, 'assets', 'wasm');
const ORT_DIST = join(root, 'node_modules', 'onnxruntime-web', 'dist');

const MODEL_FILES = [
  'config.json',
  'tokenizer.json',
  'tokenizer_config.json',
  'special_tokens_map.json',
  'onnx/model_quantized.onnx',
];

// Non-threaded variants only; numThreads=1 in embedder.js means the threaded
// builds are never requested, and they'd require SharedArrayBuffer anyway.
const WASM_FILES = ['ort-wasm.wasm', 'ort-wasm-simd.wasm'];

function ensureDir(path) {
  mkdirSync(path, { recursive: true });
}

async function downloadFile(url, dest) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Download failed (${response.status}) for ${url}`);
  }
  ensureDir(dirname(dest));
  await streamPipeline(Readable.fromWeb(response.body), createWriteStream(dest));
}

async function fetchModel() {
  for (const file of MODEL_FILES) {
    const dest = join(MODEL_DIR, file);
    if (existsSync(dest)) continue;
    const url = `https://huggingface.co/${MODEL_REPO}/resolve/${MODEL_REVISION}/${file}`;
    process.stdout.write(`  fetch ${file}... `);
    await downloadFile(url, dest);
    console.log('ok');
  }
}

function copyWasm() {
  ensureDir(WASM_DIR);
  for (const file of WASM_FILES) {
    const dest = join(WASM_DIR, file);
    if (existsSync(dest)) continue;
    const src = join(ORT_DIST, file);
    if (!existsSync(src)) {
      throw new Error(`Missing ${src} — run "npm install" first.`);
    }
    process.stdout.write(`  copy ${file}... `);
    copyFileSync(src, dest);
    console.log('ok');
  }
}

export async function prepareAssets() {
  console.log('prepare-assets: model files');
  await fetchModel();
  console.log('prepare-assets: wasm files');
  copyWasm();
}

if (import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}`) {
  prepareAssets().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
