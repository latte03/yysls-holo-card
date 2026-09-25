// 由 card.template.html 扇出每张卡的壳页：site/<id>/index.html。
// 这些是构建产物（已 gitignore），唯一源是模板 + cards.manifest.js。
// Vite 需要每个页面的 HTML 作为构建输入才能改写带 hash 的资源引用，
// 所以生成落在 site/<id>/ 而不是直接写 dist/。
// 壳页不是模板的逐字节副本：og:card 标记之间那一段按 manifest 逐卡替换成分享元信息。
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { cards } from './cards.manifest.js';

const here = dirname(fileURLToPath(import.meta.url));
const esc = (s) =>
  String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

const template = await readFile(join(here, 'card.template.html'), 'utf8');

// 缩略图不写进 manifest：看 site/public/assets/landing/<id>.webp 在不在。少了这一步显式
// 声明，补一张新卡的立绘就只剩「丢 grok-male.png → 跑 make_landing_thumbs.py」两下，
// 不会有「图有了但首页还是占位」这种要回来改代码的中间态。
const thumbDir = join(here, 'public', 'assets', 'landing');
const withThumb = new Set(
  cards.filter((c) => existsSync(join(thumbDir, `${c.id}.webp`))).map((c) => c.id),
);

// ---- og:card：分享单卡链接时抓取器看到的标题/描述/缩略图 ----
// og:image 必须写绝对地址（抓取器不解析相对路径），所以线上域名写死在这里——
// 和 README / AGENT.md 里记录发布地址是同一个值，改域名三处一起改。
const SITE = 'https://yanyun-cards-p4207ri6kdw.qoder.zone';
const OG_START = '<!-- og:card:start -->';
const OG_END = '<!-- og:card:end -->';
const ogFrom = template.indexOf(OG_START);
const ogTo = template.indexOf(OG_END, ogFrom);
if (ogFrom < 0 || ogTo < 0) {
  console.error(`card pages: 找不到 ${OG_START} / ${OG_END}，og meta 没生成`);
  process.exitCode = 1;
}
const ogBlock = (card) => {
  const desc = `《燕云十六声》典藏闪卡${card.act}：${card.title}（${card.edition}）。多层镭射收藏卡的实时网页呈现，可旋转、翻面、调节景深与卡面材质。`;
  const lines = [
    `    <meta name="description" content="${esc(desc)}" />`,
    `    <meta property="og:title" content="${esc(`${card.title} · 燕云十六声 · 典藏闪卡${card.act}`)}" />`,
    `    <meta property="og:description" content="${esc(desc)}" />`,
  ];
  // 还没有立绘的卡（wip）不写 og:image：给一张错的代表图比不给更糟。
  if (withThumb.has(card.id)) {
    lines.push(`    <meta property="og:image" content="${SITE}/assets/landing/${card.id}.webp" />`);
  }
  lines.push(`    <meta property="og:type" content="website" />`);
  return lines.join('\n');
};

let written = 0;
for (const card of cards) {
  const target = join(here, card.id, 'index.html');
  await mkdir(dirname(target), { recursive: true });
  const page =
    ogFrom < 0
      ? template
      : `${template.slice(0, ogFrom)}${ogBlock(card)}${template.slice(ogTo + OG_END.length)}`;
  // 只在内容变化时写盘，避免每次 dev/build 都刷新 mtime 触发无谓重建。
  const current = await readFile(target, 'utf8').catch(() => null);
  if (current !== page) {
    await writeFile(target, page);
    written += 1;
  }
}

console.log(`card pages: ${cards.length} declared, ${written} written`);

// 首页那份卡列表也在这里生成，而不是运行时由 landing.js 拼 DOM。
// JS 拼的话首帧只有一个空 <ul>：先看到居中的 logo，脚本跑完才冒出列表，既跳版式也把
// 跨页过渡的旧快照拍成半空的一页。列表的内容全在 cards.manifest.js 里，生成是幂等的，
// 所以加一张卡仍然只改 manifest 一处。
//
// 膜层分三段，顺序即层序，按"什么是印在卡上、什么是表面那层膜"来分：
//   .foil  描金云纹底纹 —— 在立绘**之下**（它是印在卡基上的图案，盖到人身上就糊脸了）
//   .fig   立绘
//   .band  彩虹带 —— 在立绘**之上**（表面的膜，整张卡都反光）
//   .glare 跟指针的径向高光 —— 最上，只在 hover / 聚焦时亮
// 描金内框是 .card::after，画在这几层之上。占位卡把立绘换成 .q，其余完全一样。
const START = '<!-- card-list:start -->';
const END = '<!-- card-list:end -->';
const THUMB = { w: 441, h: 616 }; // make_landing_thumbs.py 的画布，写进 width/height 防跳版
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
    const inner =
      `            <span class="card${withThumb.has(card.id) ? '' : ' is-empty'}"${
        withThumb.has(card.id) ? '' : ' aria-hidden="true"'
      }>\n` +
      `${face}` +
      `            </span>\n` +
      `            <span class="name">${esc(card.title)}</span>\n`;
    // 还在做的卡不挂链接：卡面还没定稿，首页上它只占个位。壳页照生成，所以素材一落地、
    // 删掉 manifest 里的 wip 就整条通了（连立绘也是：make_landing_thumbs.py 一跑就换脸）。
    // role=group 是必须的：aria-label 挂在裸 <div> 上读屏会直接忽略，而这里想带上
    // 弹数（可见文本只有卡名和"制作中"）。
    const box = card.wip
      ? `          <div class="pending" role="group" aria-label="${esc(`${card.act} · ${card.title}（${card.wip}）`)}">\n` +
        `${inner}` +
        `            <span class="tag">${esc(card.wip)}</span>\n` +
        `          </div>\n`
      : `          <a href="${card.route}" aria-label="${esc(`${card.act} · ${card.title}`)}">\n` +
        `${inner}` +
        `          </a>\n`;
    return `        <li>\n${box}        </li>`;
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
