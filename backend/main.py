"""FastAPI 应用入口。挂载静态文件 + API 路由。"""
from __future__ import annotations

from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from . import db
from .api import router as api_router
from .static_no_cache import NoCacheStaticFiles

FRONTEND_DIR = Path(__file__).parent.parent / "frontend"


@asynccontextmanager
async def lifespan(app: FastAPI):
    """启动时初始化数据库。"""
    db.init_db()
    print("✓ 数据库已就绪:", db.DB_PATH)
    yield


app = FastAPI(
    title="凑十大冒险",
    description="一年级进位加法游戏后端",
    version="0.1.0",
    lifespan=lifespan,
)

# CORS:开发时方便,局域网内不严格
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# API 路由
app.include_router(api_router)


# 显式路由 / 和 /dashboard,确保返回 HTML 文件
@app.get("/")
def index():
    return FileResponse(FRONTEND_DIR / "index.html")


@app.get("/dashboard")
def dashboard():
    return FileResponse(FRONTEND_DIR / "dashboard.html")


# 静态资源 (CSS / JS / 游戏)。挂在最后,/css/* /js/* /games/* 走这里。
# NoCacheStaticFiles 加 Cache-Control: no-store,避免移动端缓存老 JS。
app.mount("/css", NoCacheStaticFiles(directory=FRONTEND_DIR / "css"), name="css")
app.mount("/js", NoCacheStaticFiles(directory=FRONTEND_DIR / "js"), name="js")
app.mount("/games", NoCacheStaticFiles(directory=FRONTEND_DIR / "games"), name="games")
