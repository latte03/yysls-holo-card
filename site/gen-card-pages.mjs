// 由 card.template.html 扇出每张卡的壳页：site/<id>/index.html。
// 这些是构建产物（已 gitignore），唯一源是模板 + cards.manifest.js。
// Vite 需要每个页面的 HTML 作为构建输入才能改写带 hash 的资源引用，
// 所以生成落在 site/<id>/ 而不是直接写 dist/。
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
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

// 首页那份卡列表也在这里生成，而不是运行时由 landing.js 拼 DOM。
// JS 拼的话首帧只有一个空 <ul>：先看到居中的 logo，脚本跑完才冒出列表，既跳版式也把
// 跨页过渡的旧快照拍成半空的一页。列表的内容全在 cards.manifest.js 里，生成是幂等的，
// 所以加一张卡仍然只改 manifest 一处。
//
// 缩略图不写进 manifest：看 site/public/assets/landing/<id>.webp 在不在。少了这一步显式
// 声明，补一张新卡的立绘就只剩「丢 grok-male.png → 跑 make_landing_thumbs.py」两下，
// 不会有「图有了但首页还是占位」这种要回来改代码的中间态。
const esc = (s) =>
  String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const START = '<!-- card-list:start -->';
const END = '<!-- card-list:end -->';
const THUMB = { w: 441, h: 616 }; // make_landing_thumbs.py 的画布，写进 width/height 防跳版
const thumbDir = join(here, 'public', 'assets', 'landing');
const withThumb = new Set(
  cards.filter((c) => existsSync(join(thumbDir, `${c.id}.webp`))).map((c) => c.id),
);
// 膜层分三段，顺序即层序，按"什么是印在卡上、什么是表面那层膜"来分：
//   .foil  描金云纹底纹 —— 在立绘**之下**（它是印在卡基上的图案，盖到人身上就糊脸了）
//   .fig   立绘
//   .band  彩虹带 —— 在立绘**之上**（表面的膜，整张卡都反光）
//   .glare 跟指针的径向高光 —— 最上，只在 hover / 聚焦时亮
// 描金内框是 .card::after，画在这几层之上。占位卡把立绘换成 .q，其余完全一样。
const BANDS =
  `              <span class="band" aria-hidden="true"></span>\n` +
  `              <span class="glare" aria-hidden="true"></span>\n`;
const items = cards
  .map((card) => {
    const face = withThumb.has(card.id)
      ? `              <span class="foil" aria-hidden="true"></span>\n` +
        `              <img\n` +
        `                class="fig"\n` +
        `                src="/assets/landing/${card.id}.webp"\n` +
        `                alt=""\n` +
        `                width="${THUMB.w}"\n` +
        `                height="${THUMB.h}"\n` +
        `                decoding="async"\n` +
        `              />\n` +
        BANDS
      : `              <span class="foil" aria-hidden="true"></span>\n` +
        `              <span class="q">?</span>\n` +
        BANDS;
    return (
      `        <li>\n` +
      `          <a href="${card.route}" aria-label="${esc(`${card.act} · ${card.title}`)}">\n` +
      `            <span class="card${withThumb.has(card.id) ? '' : ' is-empty'}"${
        withThumb.has(card.id) ? '' : ' aria-hidden="true"'
      }>\n` +
      `${face}` +
      `            </span>\n` +
      `            <span class="name">${esc(card.title)}</span>\n` +
      `          </a>\n` +
      `        </li>`
    );
  })
  .join('\n');

const landingPath = join(here, 'index.html');
const landing = await readFile(landingPath, 'utf8');
const from = landing.indexOf(START);
const to = landing.indexOf(END, from);
if (from < 0 || to < 0) {
  console.error(`landing: 找不到 ${START} / ${END} 标记，列表没生成`);
  process.exitCode = 1;
} else {
  const next = `${landing.slice(0, from)}${START}\n${items}\n        ${landing.slice(to)}`;
  if (next !== landing) {
    await writeFile(landingPath, next);
    console.log(
      `landing: card list rewritten (${cards.length} entries, ${withThumb.size} 有立绘 / ${cards.length - withThumb.size} 占位)`,
    );
  }
}
