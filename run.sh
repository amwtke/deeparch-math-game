#!/usr/bin/env bash
set -e

cd "$(dirname "$0")"

# 检查 uv 是否安装
if ! command -v uv &> /dev/null; then
    echo "❌ 没有装 uv,先运行:"
    echo "   curl -LsSf https://astral.sh/uv/install.sh | sh"
    exit 1
fi

# 同步依赖 (第一次运行会装)
uv sync --quiet

# 显示局域网 IP
echo ""
echo "🎮 凑十大冒险启动中..."
echo ""
if command -v hostname &> /dev/null; then
    if [[ "$OSTYPE" == "darwin"* ]]; then
        IP=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || echo "未检测到")
    else
        IP=$(hostname -I 2>/dev/null | awk '{print $1}' || echo "未检测到")
    fi
    echo "   🎯 孩子玩:    http://${IP}:8000/"
    echo "   📊 家长仪表盘: http://${IP}:8000/dashboard"
    echo "   📚 API 文档:   http://${IP}:8000/docs"
fi
echo ""

# 启动
exec uv run uvicorn backend.main:app --host 0.0.0.0 --port 8000 "$@"
