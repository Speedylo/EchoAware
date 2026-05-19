import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

// Per proxy-plan.md §3 "No-log policy": titles and tokens must never be
// console-logged. The cheapest enforceable rule is: no console.* calls in
// the Worker source at all. Structured counters live in KV, not logs.

const SRC_DIR = join(__dirname, '..', 'src');

function walkTs(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walkTs(full));
    else if (entry.endsWith('.ts')) out.push(full);
  }
  return out;
}

describe('no-log audit', () => {
  it('Worker source contains no console.* calls', () => {
    const offenders: string[] = [];
    for (const file of walkTs(SRC_DIR)) {
      const text = readFileSync(file, 'utf8');
      const lines = text.split(/\r?\n/);
      lines.forEach((line, i) => {
        if (/\bconsole\.\w+\s*\(/.test(line)) {
          offenders.push(`${file}:${i + 1} ${line.trim()}`);
        }
      });
    }
    expect(offenders, `console.* found:\n${offenders.join('\n')}`).toEqual([]);
  });
});
