---
name: install
description: Use when setting up math-adventure on a new machine or refreshing a stale checkout — pulls latest code, installs uv if missing, syncs Python deps, syntax-checks code, runs pytest. Project-specific to math-adventure.
---

# install

让 math-adventure 项目从零(或者陈旧状态)恢复到可运行状态。**幂等**——重复跑没问题。

## 执行步骤

按顺序在项目根目录跑,**任一步失败立即停下报错,不要继续后面的步骤**。

### 1. 拉最新代码

```bash
git pull --ff-only
```

如果当前分支没有 upstream,先问用户跟哪个远端分支再继续。如果工作区有未提交改动,`--ff-only` 不会动它们,但要提醒用户。

### 2. 装 uv (没装才装)

```bash
if ! command -v uv >/dev/null 2>&1; then
  curl -LsSf https://astral.sh/uv/install.sh | sh
  export PATH="$HOME/.local/bin:$PATH"
fi
uv --version
```

最后那行确认 uv 在 PATH 里。如果还找不到,提示用户重开 shell。

### 3. 同步依赖

```bash
uv sync
```

首次跑会创建 `.venv/` 并生成 `uv.lock`,把 `pyproject.toml` 里的 runtime 和 dev 依赖都装齐(包括 pytest)。

### 4. 语法检查

```bash
uv run python -m compileall -q backend tests
```

Python 不是编译型语言,这一步用字节码编译来抓语法错误和未关闭的字符串等问题。`-q` 只在出错时输出。

### 5. 跑单元测试

```bash
uv run pytest -q
```

## 完成判定

5 步全过 → 输出 `✅ 准备好了,跑 ./run.sh 启动服务器`。

任何一步非 0 退出 → 报告失败的步骤号 + 命令输出最后 20 行,**停在那里**,不要尝试自动修复。

## 何时不该用

- 只改了前端 (HTML/CSS/JS):浏览器刷新即可,不用重新装依赖。
- 部署到生产环境:这个项目设计上只在家庭局域网用,见 `CLAUDE.md` 的"已知限制"。
