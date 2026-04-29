---
name: startup
description: Use when launching the math-adventure server for actual play on the LAN — first runs the install skill end-to-end, then starts uvicorn via run.sh and reports the URLs for kid + parent. Project-specific.
---

# startup

把项目从任意状态 → 服务器在局域网可访问。组合 install + run.sh,一步到位。

## 执行步骤

### 1. 先跑 install skill

**REQUIRED SUB-SKILL:** 必须先成功执行 `install` skill 的全部 5 步(拉代码、装 uv、`uv sync`、`compileall`、`pytest`)。

如果 install 中任何一步失败,**停在那里报错,不要继续启动服务器**。坏代码不该跑给孩子看。

### 2. 启动 uvicorn

```bash
./run.sh
```

`run.sh` 会:

- 检测到 uv 已装(install 那步装过了),`uv sync --quiet` 再确认一遍依赖
- 探测局域网 IP,打印三个 URL:孩子玩 / 家长仪表盘 / API 文档
- 起 uvicorn 监听 `0.0.0.0:8000`

**Claude Code 执行注意**: 这是长跑前台进程,跑 Bash 工具时必须 `run_in_background: true`。启动后:

1. 等约 2 秒让 uvicorn 起来
2. `curl -sf http://localhost:8000/api/state >/dev/null` 验证服务在听
3. 把三个 URL 报给用户

停止服务器: 用户终端按 Ctrl+C,或者让 Claude 用 KillShell 杀对应的后台进程。

## 何时不该用

- **只想验证代码能跑**(不需要服务器对外)→ 用 `install` skill 就够。
- **dev 模式自动重载**(改 Python 自动重启)→ `uv run uvicorn backend.main:app --reload`,不要走 `run.sh`。
- **服务器已经在跑** → 直接刷新浏览器,不要再跑 startup(端口会冲突)。
