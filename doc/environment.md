# 本机环境

仓库现在在 **Windows**：`<repo-root>`。下表左列是本机事实，右列是旧 mac
（`/Users/<user>/Documents/code-dev/holo-card`）的写法——文档里出现 mac 路径时按这张表换算。

| 依赖 | 本机（Windows） | 旧 mac（历史文档里的写法） |
|---|---|---|
| Blender | **未安装，建卡不需要**（见 [`pipeline.md`](pipeline.md)） | `/Applications/Blender.app/Contents/MacOS/Blender`，5.1.2，Cycles GPU |
| 技能脚本 | 仓库内置 `.agents/skills/holo-card-pipeline/scripts/`（Blender 用，本机不需要） | 旧 mac 的 `~/.agents/skills/holo-card-studio/scripts/holographic/` |
| Python | `python3`（<toolchain-mgr> shim，3.14.4）+ PIL 12.3.0 + numpy 2.5.1 + **cv2 5.0.0** | `python3`，PIL 12.2 + numpy |
| Node / 包管理 | `node` 26.5.0 + `pnpm` 12.6.0（<toolchain-mgr> pin），依赖在 `site/pnpm-lock.yaml` | `~/.local/share/<toolchain-mgr>/shims/node` + npm |
| three | `site/node_modules`，0.180；Vite 裸导入 `three` / `three/addons/...` | 同 |

（**没有** scipy / skimage，别 import。cv2 是 2026-09-25 复核时确认装了的（5.0.0）——
连通域、泛洪这类事直接用它，别手写 Python 循环；但管线脚本本身不依赖它，只有临时
抠图/诊断脚本会用到。）

## 网络与 PATH 的两条硬事实

- `pip` 直连 pypi.org 会超时中断，装包加 `-i https://<pypi-mirror>/pypi/simple/`；
  npm 走 `~/.npmrc` 里的 <npm-mirror>。GitHub release 直连不通，`<toolchain-mgr> install` 需要活的代理
  （<proxy-client> 端口不固定，<proxy-port> 时断）。
- **agent 的 Bash 会话里 `pnpm` 会被独立版抢走**：`C:\Users\<user>\AppData\Local\pnpm`（11.21.0）
  排在 <toolchain-mgr> shims 之前，`pnpm -v` 拿到 11.21.0。跑命令前先
  `export PATH="/c/Users/<user>/AppData/Local/<toolchain-mgr>/shims:$PATH"`。用户自己的终端里 <toolchain-mgr> 在前，
  不受影响。注册表 PATH 与 agent 会话 PATH 顺序不同，别拿 `which -a` 的结论推断终端行为。
