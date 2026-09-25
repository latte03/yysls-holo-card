# ModelScope API-Inference 生图接口事实

2026-09-25 实测 + 官方文档核对。文档：`modelscope.cn/docs/model-service/API-Inference/intro` 与 `/limits`。

## 读文档的前提

`modelscope.cn/docs/**` 是纯前端渲染的 SPA：`WebFetch` 和 `curl` 只能拿到约 5 KB 的空壳，CDN
（`resouces.modelscope.cn/document/docdata/<stamp>/dist/...`）只放 `_resources/` 里的图片，没有裸 `.md`。
**用内置浏览器读**：`navigate_page` → `take_snapshot(filePath=...)` → grep 那份 a11y dump。不需要截图。

## 调用链（异步任务制，不是 OpenAI images 契约）

```
POST https://api-inference.modelscope.cn/v1/images/generations
  Headers: Authorization: Bearer <ms-token>
           Content-Type: application/json
           X-ModelScope-Async-Mode: true
  Body:    {"model": "...", "prompt": "...", ...}
  → {"task_status":"SUCCEED","task_id":"<uuid>","request_id":"..."}

GET https://api-inference.modelscope.cn/v1/tasks/{task_id}
  Headers: X-ModelScope-Task-Type: image_generation
  → task_status: RUNNING | SUCCEED | FAILED ；SUCCEED 时 output_images[] 是 OSS 直链
```

**坑**：POST 响应里那个 `task_status: SUCCEED` 只代表**任务受理成功**，图还没画完。真状态在 `/v1/tasks/{id}`。

## 参数

| 字段 | 说明 | 取值域 |
|---|---|---|
| `model` | AIGC 模型 ID | 以模型页范例为准，文档里的 ID 会过期 |
| `prompt` | 正向提示词 | < 2000 字符 |
| `negative_prompt` | 负向提示词 | < 4000 字符 |
| `size` | 分辨率 | SD 64²–2048² · FLUX ≤1024² · **Qwen-Image ≤1664²** · Z-Image-Turbo 512²–2048² |
| `seed` | 随机种子 | `[0, 2^31-1]`，**不含 -1**；要随机就省略该字段 |
| `steps` | 采样步数 | `[1, 100]` |
| `guidance` | 提示词引导 | `[1.5, 20]` |
| `image_url` | 待编辑图，仅编辑类模型 | 公网 URL 或 base64 data URL；实测**数组包 data URL** 可用 |
| `loras` | LoRA | 单个 repo-id 字符串，或 dict；最多 6 个且权重和须为 1.0 |

**没有 `sampler` / `scheduler` 字段**，全文档和模型页范例都没有。服务端默认调度器是 FlowMatchEuler
（≙ ComfyUI 的 `euler`），所以"用 euler 采样"这条不需要传参也成立。

## 图生图实测

- 2.5 MB PNG → base64 约 3.4 MB 请求体，**没有撞到体积限制**，本地文件不需要托管 URL。
- `image_url: ["data:image/png;base64,…"]`（数组形式）被接受；脚本里保留了字符串形式的自动回落。
- 输入 1024×1536、请求 `size: 1328x1328` 时，**输出听请求尺寸**，不会被输入比例拉回。

## 账号与额度

- 需要 `ms-` 开头的 Access Token（`modelscope.cn/my/myaccesstoken`），且账号**必须绑定阿里云账号并通过实名认证**。
- 限流是动态的，官方口径"保障开发者单并发正常使用"——**不要串行开并发轰炸**。
- 免费额度按**魔粒**扣减：轻量 0.5 / 主流 1 / 旗舰 2 每次。模型页选「魔搭社区」时左侧显示"预计魔粒扣减"。
- 非商用、无 SLA，别拿它跑线上任务。

## token 从哪来

脚本只读环境变量 `MODELSCOPE_API_TOKEN`。当前 shell 里取不到（`env | grep MODELSCOPE` 为空）
就先问用户它配在哪、怎么注入，别自己猜路径也别把它写进任何文件。**永远不要 echo 它的值**——
要确认注入成功，只看长度：`node -e 'console.log((process.env.MODELSCOPE_API_TOKEN||"").length)'`。

## 耗时基线

条件不同不可互比，每行都标了自己的配置：

| 条件 | 耗时 |
|---|---|
| `Qwen/Qwen-Image` · 1024² · 默认步数 · 纯文生图 | ≈ 28 s |
| `Qwen/Qwen-Image-2.1` · 1328² · 40 步 · 纯文生图 | ≈ 52 s |
| `Qwen/Qwen-Image-2.1` · 1328² · 40 步 · 带参考图 | ≈ 66 s |
| `Qwen/Qwen-Image-2.1` · 1024² · 8 步 · 带参考图（脚本自检用） | ≈ 15 s |

步数是主导变量：8 步 15 s / 40 步 66 s 都带同一张参考图，但分辨率也不同，所以仍不是单变量对照。
