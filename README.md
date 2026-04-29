# 凑十大冒险 (Math Adventure)

一年级进位加法练习游戏,《我的世界》像素风。

孩子在平板上玩游戏,家长在另一台设备打开仪表盘看进度。

## 快速启动

```bash
# 1. 安装 uv (一次)
curl -LsSf https://astral.sh/uv/install.sh | sh

# 2. 安装依赖
uv sync

# 3. 启动服务器
./run.sh
# 或者
uv run uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload
```

启动后:

- **孩子玩**: 在平板浏览器打开 `http://192.168.1.110:8000/`
- **家长看进度**: 在电脑浏览器打开 `http://192.168.1.110:8000/dashboard`
- **API 文档**: `http://192.168.1.110:8000/docs`

(把 `192.168.1.110` 换成你电脑的实际局域网 IP——Mac/Linux 用 `ifconfig`,Windows 用 `ipconfig`)

## 数据存哪

`data/game.db` —— SQLite,会自动创建。备份它就备份了所有进度。

## 项目结构

```
backend/        FastAPI 后端
frontend/       静态前端 (HTML/CSS/JS)
data/           SQLite 数据库
```

详见 `CLAUDE.md`。

## 开发

用 Claude Code 开发。先读 `CLAUDE.md` 了解架构约定。

```bash
# 启动开发模式 (代码改动自动重载)
uv run uvicorn backend.main:app --reload
```
