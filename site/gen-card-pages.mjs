// 由 card.template.html 扇出每张卡的壳页：site/<id>/index.html。
// 这些是构建产物（已 gitignore），唯一源是模板 + cards.manifest.js。
// Vite 需要每个页面的 HTML 作为构建输入才能改写带 hash 的资源引用，
// 所以生成落在 site/<id>/ 而不是直接写 dist/。
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { cards } from './cards.manifest.js';

const here = dirname(fileURLToPath(import.meta.url));

const template = await readFile(join(here, 'card.template.html'), 'utf8');

let written = 0;
for (const card of cards) {
  const target = join(here, card.id, 'index.html');
  await mkdir(dirname(target), { recursive: true });
  // 只在内容变化时写盘，避免每次 dev/build 都刷新 mtime 触发无谓重建。
  const current = await readFile(target, 'utf8').catch(() => null);
  if (current !== template) {
    await writeFile(target, template);
    written += 1;
  }
}

console.log(`card pages: ${cards.length} declared, ${written} written`);
