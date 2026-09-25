#!/usr/bin/env node
// ModelScope API-Inference 生图（文生图 / 图生图）。零依赖，需 MODELSCOPE_API_TOKEN。
// 必须用 `<toolchain-mgr> exec -- node ms_gen.mjs ...` 调用：token 在 <toolchain-mgr> 的 [env] 段，普通 Git Bash 取不到。

import { readFileSync, writeFileSync } from 'node:fs';
import { extname } from 'node:path';

const USAGE = `用法: <toolchain-mgr> exec -- node ms_gen.mjs --prompt <file> --out <file> [选项]

  --model   <id>     默认 Qwen/Qwen-Image-2.1
  --prompt  <file>   正向提示词（UTF-8 文本，<2000 字符）
  --negative <file>  负面提示词（<4000 字符），走 negative_prompt 字段
  --image   <file>   参考图，转 base64 data URL 走 image_url（图生图/编辑）
  --size    a,b      默认 1328x1328,1024x1024（前一个失败自动回落后一个）
  --steps   <int>    默认 40，取值域 [1,100]
  --seed    <int>    默认不传（= 随机）。取值域 [0,2^31-1]，不要传 -1
  --out     <file>   输出 PNG 路径
  --verbose          逐次打印轮询状态`;

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : fallback;
};

if (process.argv.includes('--help') || !arg('prompt')) {
  console.log(USAGE);
  process.exit(arg('prompt') ? 0 : 2);
}

const token = process.env.MODELSCOPE_API_TOKEN;
if (!token) {
  console.error('FAIL: MODELSCOPE_API_TOKEN 不在环境里——用 `<toolchain-mgr> exec --` 包一层');
  process.exit(2);
}

const model = arg('model', 'Qwen/Qwen-Image-2.1');
const prompt = readFileSync(arg('prompt'), 'utf8').trim();
const negative = arg('negative') ? readFileSync(arg('negative'), 'utf8').trim() : '';
const out = arg('out', 'out.png');
const steps = Number(arg('steps', 40));
const sizes = String(arg('size', '1328x1328,1024x1024')).split(',');
const seed = arg('seed');
const imagePath = arg('image');
const verbose = process.argv.includes('--verbose');

if (prompt.length >= 2000) console.error(`WARN: prompt ${prompt.length} 字符，上限 2000`);
if (negative.length >= 4000) console.error(`WARN: negative ${negative.length} 字符，上限 4000`);

const BASE = 'https://api-inference.modelscope.cn/';
const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
const t0 = Date.now();

let dataUrl = '';
if (imagePath) {
  const buf = readFileSync(imagePath);
  const mime = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' }[
    extname(imagePath).toLowerCase()
  ];
  if (!mime) {
    console.error(`FAIL: 不支持的图片扩展名 ${extname(imagePath)}`);
    process.exit(2);
  }
  dataUrl = `data:${mime};base64,${buf.toString('base64')}`;
  console.log(`参考图 ${buf.length}B → base64 ${dataUrl.length}B`);
}

const attempts = [];
for (const size of sizes) {
  const base = { model, prompt, size, steps };
  if (negative) base.negative_prompt = negative;
  if (seed !== undefined && seed !== '') base.seed = Number(seed);
  if (dataUrl) {
    attempts.push({ size, body: { ...base, image_url: [dataUrl] }, form: 'array' });
    attempts.push({ size, body: { ...base, image_url: dataUrl }, form: 'string' });
  } else {
    attempts.push({ size, body: base, form: 'none' });
  }
}

let taskId = '';
let used = null;
let lastStatus = 0;
let lastText = '';
for (const a of attempts) {
  const res = await fetch(`${BASE}v1/images/generations`, {
    method: 'POST',
    headers: { ...headers, 'X-ModelScope-Async-Mode': 'true' },
    body: JSON.stringify(a.body),
  });
  const text = await res.text();
  lastStatus = res.status;
  lastText = text;
  if (verbose || !res.ok) console.log(`POST size=${a.size} image_url=${a.form} -> ${res.status} ${text.slice(0, 300)}`);
  if (res.ok) {
    try {
      taskId = JSON.parse(text).task_id;
    } catch {}
    if (taskId) {
      used = a;
      break;
    }
  }
}
if (!taskId) {
  console.error(`FAIL: 提交未成功（最后一次 HTTP ${lastStatus}）\n${lastText.slice(0, 600)}`);
  process.exit(1);
}

let polls = 0;
let data;
while (Date.now() - t0 < 420_000) {
  await new Promise((r) => setTimeout(r, 4000));
  polls++;
  const res = await fetch(`${BASE}v1/tasks/${taskId}`, {
    headers: { ...headers, 'X-ModelScope-Task-Type': 'image_generation' },
  });
  data = await res.json().catch(() => ({}));
  const s = data?.task_status ?? '-';
  if (verbose) process.stdout.write(`  ${((Date.now() - t0) / 1000).toFixed(0)}s ${s}\n`);
  if (s === 'SUCCEED' || s === 'FAILED') break;
}

if (data?.task_status !== 'SUCCEED') {
  console.error(`FAIL: 任务未成功 status=${data?.task_status ?? '?'}/${polls} 次轮询\n${JSON.stringify(data).slice(0, 600)}`);
  process.exit(1);
}

const url = (data.output_images ?? data.images ?? [])[0];
const img = await fetch(url);
const buf = Buffer.from(await img.arrayBuffer());
writeFileSync(out, buf);
const secs = ((Date.now() - t0) / 1000).toFixed(1);
console.log(
  `OK ${out}  ${buf.readUInt32BE(16)}x${buf.readUInt32BE(20)}  ${(buf.length / 1024) | 0}KB  ` +
    `${secs}s / ${polls} 次轮询  model=${model}  size=${used.size}  image_url=${used.form}`,
);
