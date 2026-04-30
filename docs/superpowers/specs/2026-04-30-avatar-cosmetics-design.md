# Avatar Cosmetics 装扮系统 — 设计文档

**日期**: 2026-04-30
**目标用户**: 7 岁孩子,中国小学一年级
**功能定位**: 用答题攒来的金币装扮一个 Alex 风格的女孩角色,作为长期目标 + 金币消耗出口

## 一、目标与动机

主页左侧目前是空白草地(用户在截图中红框标注)。新增一个站立的 Alex 角色,孩子可以点击进入装扮商店,用答题挣的金币购买帽子/衣服/手持物/裤鞋,装扮自己的角色。

**为什么**:
1. 给金币赋予明确意义(目前金币只是数字,缺乏消费场景)。
2. 给孩子一个长期、温和的目标——攒钱买"心仪的那件",比"再做一题"更有持续力。
3. 增加"我的"代入感。Alex 是孩子,装扮她 = 装扮"我"。

**不为什么**:这不是属性养成系统。装扮不影响游戏数值,纯外观。7 岁孩子不需要"+5 攻击"分散对数学的注意力。

## 二、范围

### In scope (v1)
- 一个固定的 Alex 风格女孩角色(默认绿 T 恤 + 棕裤 + 灰鞋,橘红长发,绿眼睛)
- **4 个装扮槽位**:`head` / `top` / `hand` / `legs`
- **首版 ~20 件装扮**(每槽位 5 件,见第八节清单)
- 装扮商店全屏页面:左侧实时角色预览 + 右侧 4 槽位货架
- 试穿 + 购买 + 切换装备 + 取消装备的完整交互流程
- 装扮永久拥有(买过就一直在),金币不能退回
- 后端 SQLite 持久化拥有/装备状态;刷新和重启不丢

### Out of scope (v1)
- 男孩 (Steve) 装扮 — 留作下一版
- 装扮的属性加成、稀有度、限时折扣、抽奖 — 永不
- 宠物伙伴、小屋背景元素 — 后续迭代,需要单独 spec
- 角色动画(走/跳/挥手)— v1 静止站立即可
- 装扮预览的多角度旋转 — 仅正面

## 三、用户体验流程

### 主页
- 左侧空地新增一个站立的 Alex 角色(viewBox 192x384,在主页上以 ~180px 高度展示)
- 角色按当前装备 (`equipped_cosmetics`) 渲染,默认是 Alex 原版套装
- 角色可点击,光标显示 pointer,有微妙的 idle hover(轻微缩放)提示可交互

### 进入装扮商店(`platform.enterShop()`)
切换屏(类似当前 `enterGame()` 模式)。商店布局:
- **顶部 topbar**:返回按钮 + 标题"装扮衣橱" + 当前金币
- **左侧 1/3**:角色预览,viewBox 192x384,~280px 高;下方列出当前装备的四件物品名字
- **右侧 2/3**:4 个货架(头/上衣/手持/裤鞋),每个货架内显示该槽位的所有装扮(包括已装备/已拥有/未购),按价格升序

### 装扮卡片三种状态
1. **未拥有**:显示图标 + 价格 (`💰 120`),底色白色
2. **已拥有未装备**:显示图标 + "已拥有"角标,底色绿色
3. **已装备(当前穿着)**:显示图标 + "穿着中"角标,底色金色,粗边框

### 点击装扮的行为
| 当前状态 | 点击后 |
|---------|--------|
| 未拥有 | 角色立即试穿(本地 preview 态);底部弹出"购买 💰N"+"取消"按钮栏;若金币不够,购买按钮变灰显示"还差 N 金币" |
| 已拥有未装备 | 角色立即换装,后端立即保存 (`POST /api/cosmetics/equip`);无确认 |
| 已装备 | 取消装备(该槽位置 null),后端立即保存;角色还原到无该装扮 |

### 切换试穿
- 已经在试穿态(底部购买栏可见),点同槽位的另一件未拥有装扮 → 切到新的预览;购买栏更新价格
- 点已拥有装扮 → 直接装备,丢弃当前 preview
- 点"取消"按钮 → 角色回到 `savedEquipped`,关闭购买栏

### 购买成功
- 扣金币飘字动画 (`-120 💰`),音效(用现有 `audio.js` 的金币音)
- 该装扮卡片从"未拥有"变"已装备",底色金色
- 角色已经在试穿态显示该装扮,购买后变为永久装备
- 关闭购买栏

### 退出商店
- 任何未确认的 preview 态丢弃
- 主页角色用 `savedEquipped` 渲染
- topbar 金币更新

## 四、架构

### 4.1 后端 (Python / FastAPI / SQLite)

#### Schema 迁移 (`backend/db.py` 的 `init_db()`)

`CREATE TABLE IF NOT EXISTS` 不能加新字段,所以用 `PRAGMA table_info` 检测后 `ALTER TABLE`:

```python
def _ensure_player_state_columns(conn) -> None:
    """给老的 player_state 表加新字段。幂等。"""
    cols = {row[1] for row in conn.execute("PRAGMA table_info(player_state)")}
    if "owned_cosmetics" not in cols:
        conn.execute(
            "ALTER TABLE player_state ADD COLUMN owned_cosmetics TEXT DEFAULT '[]'"
        )
    if "equipped_cosmetics" not in cols:
        conn.execute(
            "ALTER TABLE player_state ADD COLUMN equipped_cosmetics TEXT DEFAULT '{}'"
        )
```

在 `init_db()` 末尾调用 `_ensure_player_state_columns(conn)`。

新字段语义:
- `owned_cosmetics` (TEXT, JSON 数组):`["princess_crown", "diamond_sword"]`
- `equipped_cosmetics` (TEXT, JSON 对象):`{"head": "princess_crown", "top": null, "hand": "diamond_sword", "legs": null}`,固定 4 个键,值是 cosmetic_id 或 null

#### 后端装扮白名单 (`backend/cosmetics.py` 新文件)

```python
# 后端只关心 id/slot/price 用于校验,不关心怎么画
COSMETICS = {
    "princess_crown": {"slot": "head", "price": 120},
    "bunny_ears":     {"slot": "head", "price": 50},
    # ... 共 20 件
}
SLOTS = ("head", "top", "hand", "legs")
```

修改装扮目录时**前端 `catalog.js` 和后端 `cosmetics.py` 必须同步**。两边各自维护避免引入构建工具,用 PR review 保证一致性。这个重复是已知 tradeoff;若后续装扮超过 50 件,考虑改成单一 JSON。

#### API 端点

##### 扩展 `GET /api/state`

`get_player_state()` 返回值新增两个字段:
```python
{
    "total_coins": ...,
    # 新增:
    "owned_cosmetics": [...],          # list[str]
    "equipped_cosmetics": {            # dict[slot, str|None]
        "head": "princess_crown",
        "top": None,
        "hand": None,
        "legs": None,
    },
    # 其他原有字段...
}
```

##### 新端点 `POST /api/cosmetics/buy`

请求:`{"cosmetic_id": "princess_crown"}`

逻辑(`BEGIN IMMEDIATE` 事务):
1. 校验 `cosmetic_id` 在 `COSMETICS` 字典里 → 否则 400 `"Unknown cosmetic"`
2. 读 `player_state.owned_cosmetics`,若已包含 → 400 `"Already owned"`
3. 读 `player_state.total_coins`,若 < price → 400 `"Insufficient coins"`
4. 在同一事务内:`total_coins -= price`,`owned_cosmetics` 加上该 id,`equipped_cosmetics[slot] = id`(自动装备)
5. 提交事务,返回完整 state

响应(成功):200 + 同 `GET /api/state` 的完整 state(前端直接覆盖本地)
响应(失败):400 + `{"detail": "..."}`,前端弹"Oops 没买上,再试试"

##### 新端点 `POST /api/cosmetics/equip`

请求:`{"slot": "head", "cosmetic_id": "princess_crown"}` 或 `{"slot": "head", "cosmetic_id": null}`

逻辑:
1. 校验 slot 在 `SLOTS` 中
2. 若 `cosmetic_id` 不为 null:校验它在 `COSMETICS` 中,且 slot 字段匹配,且玩家 `owned_cosmetics` 包含它
3. 写 `equipped_cosmetics[slot] = cosmetic_id`
4. 不扣金币
5. 返回完整 state

#### 数据访问层补充 (`backend/db.py`)

新增函数:
- `get_owned_cosmetics(conn) -> list[str]`
- `get_equipped_cosmetics(conn) -> dict[str, str|None]`
- `buy_cosmetic(cosmetic_id: str, slot: str, price: int) -> dict | None` — 用 `BEGIN IMMEDIATE`,返回新 state 或 None(失败)
- `set_equipped(slot: str, cosmetic_id: str | None) -> dict`

`update_player_state` 不动,新功能用专用函数避免参数膨胀。

### 4.2 前端 (原生 JS / SVG)

#### 新文件结构

```
frontend/js/avatar/
├── catalog.js     # 装扮目录(SVG 渲染函数 + 元数据)— 全局 window.Cosmetics
├── avatar.js      # Alex 角色 SVG 渲染器 — 全局 window.Avatar.render(equipped)
├── shop.js        # 商店屏 — 全局 window.AvatarShop.start(host)/exit()
└── home-tile.js   # 主页角色展示位 — 全局 window.AvatarHomeTile.render(parentEl)

frontend/css/avatar.css
```

#### `index.html` 变更

```html
<link rel="stylesheet" href="/css/avatar.css">
<script src="/js/avatar/catalog.js"></script>
<script src="/js/avatar/avatar.js"></script>
<script src="/js/avatar/home-tile.js"></script>
<script src="/js/avatar/shop.js"></script>
```

#### `platform.js` 变更

- `renderHome()` 修改布局:把现有"挑游戏"区域往右移,左侧空地放 `AvatarHomeTile.render(leftSlotEl)`
- 新增 `enterShop()`(模仿 `enterGame()`):把 `gameHostEl` 借用,挂载 `AvatarShop.start(gameHostEl)`,退出时清理
- 退出 shop 时(类似 `exit()`)调用 `AvatarShop.exit()` + 重新渲染 home(因为装备可能变了)

#### `catalog.js` 格式

```js
window.Cosmetics = {
  princess_crown: {
    slot: 'head',
    name: '公主王冠',
    price: 120,
    renderIcon: () => `<svg viewBox="0 0 48 48" shape-rendering="crispEdges">...</svg>`,
    renderOnAvatar: () => `<g class="cm-head">...</g>`,
  },
  // ...
};

window.CosmeticSlots = ['head', 'top', 'hand', 'legs'];
window.CosmeticSlotNames = { head: '头', top: '上衣', hand: '手持', legs: '裤鞋' };
```

`renderIcon` 返回独立 SVG 字符串(用于货架卡片)。
`renderOnAvatar` 返回 `<g>...</g>` 字符串,假定父级 SVG viewBox 是 `0 0 192 384`,使用约定的槽位锚点。

#### 槽位锚点约定(写进 `avatar.js` 顶部注释)

| Slot | y 范围 | x 范围 | 说明 |
|------|--------|--------|------|
| head | -24 ~ 24 | 24 ~ 168 | 允许超出 viewBox 上沿(高皇冠/兔耳) |
| top | 96 ~ 240 | 12 ~ 180 | 从脖子到腰,覆盖默认绿T恤 + 袖子。可延伸成长袍盖到腿 |
| hand | 138 ~ 250 | 130 ~ 195 | 右手位置 |
| legs | 240 ~ 372 | 36 ~ 156 | 从腰到脚 |

#### `avatar.js` 主渲染

```js
window.Avatar = {
  render(equipped) {
    return `
      <svg viewBox="0 0 192 384" shape-rendering="crispEdges" class="avatar-svg">
        ${BASE_HEAD_AND_HAIR}
        ${BASE_BODY_SKIN}
        ${equipped.top ? '' : BASE_DEFAULT_TOP /* 绿 T 恤 */}
        ${equipped.legs ? '' : BASE_DEFAULT_LEGS /* 棕裤 + 灰鞋 */}
        ${equipped.head ? Cosmetics[equipped.head].renderOnAvatar() : ''}
        ${equipped.top ? Cosmetics[equipped.top].renderOnAvatar() : ''}
        ${equipped.hand ? Cosmetics[equipped.hand].renderOnAvatar() : ''}
        ${equipped.legs ? Cosmetics[equipped.legs].renderOnAvatar() : ''}
      </svg>
    `;
  }
};
```

**z-order 通过 SVG 元素顺序保证**:基底层先画,装扮层后画。head 永远在最上(王冠/帽子盖头发)。

#### `shop.js` 状态机

```js
window.AvatarShop = {
  state: {
    savedEquipped: {...},   // 后端权威,刷新基准
    previewSlot: null,       // 当前在试穿哪个槽位
    previewCosmeticId: null, // 试穿哪一件
  },

  // 当前用于渲染的合成态
  effectiveEquipped() {
    if (!this.state.previewSlot) return this.state.savedEquipped;
    return {
      ...this.state.savedEquipped,
      [this.state.previewSlot]: this.state.previewCosmeticId
    };
  },

  onClickItem(cosmeticId) {
    const item = Cosmetics[cosmeticId];
    const owned = Platform.playerState.owned_cosmetics.includes(cosmeticId);
    if (owned) {
      // 直接换装(若已装备则取消)
      const cur = this.state.savedEquipped[item.slot];
      const next = cur === cosmeticId ? null : cosmeticId;
      this.equip(item.slot, next);
    } else {
      // 试穿
      this.state.previewSlot = item.slot;
      this.state.previewCosmeticId = cosmeticId;
      this.rerender();
    }
  },

  async equip(slot, cosmeticId) { /* POST /api/cosmetics/equip + 更新本地 */ },
  async buy(cosmeticId) { /* POST /api/cosmetics/buy + 更新本地 + 清 preview */ },
  cancelPreview() { /* 清 preview + rerender */ },
  exit() { /* 抛弃 preview,什么也不保存 */ },
};
```

#### `home-tile.js`

简单的角色显示位:
- 拿 `Platform.playerState.equipped_cosmetics`,调用 `Avatar.render()`,塞进容器
- 整个容器可点击 → `Platform.enterShop()`
- hover 加微动画(`transform: scale(1.02)`)

## 五、错误处理

| 场景 | 处理 |
|------|------|
| 购买请求 4xx(金币不够 / 已拥有 / 未知 id) | 弹"Oops 没买上,再试试" toast,3 秒消失;不修改本地 state;若是金币不够,顺便高亮金币数 |
| 购买请求 5xx 或网络挂 | 同上 toast;前端不假设成功 |
| `equip` 请求失败 | toast + 回退本地 state 到调用前 |
| `catalog.js` 加载失败 | 主页角色位显示"加载中"占位文字,不挂掉首页其他功能 |
| 后端校验未知 `cosmetic_id`(前后端目录脱节) | 后端返回 400,前端 toast"装扮暂不可用",并 console.error 提醒开发者 |
| 旧数据库(没有新字段) | `_ensure_player_state_columns()` 在 init_db 时自动 ALTER,默认值 `'[]'` 和 `'{}'`,老用户进入即可用 |
| 双击购买 | 后端 `BEGIN IMMEDIATE` + "Already owned" 校验,第二次必然失败 |

## 六、测试

### 后端单测 (`tests/test_cosmetics.py`)

| 测试 | 期望 |
|------|------|
| `test_buy_success` | 金币足、未拥有 → 200,扣钱、加入 owned、自动 equip,返回新 state |
| `test_buy_insufficient_coins` | 金币不够 → 400,state 不变 |
| `test_buy_already_owned` | 已拥有再买 → 400 |
| `test_buy_unknown_id` | 伪造 id → 400 |
| `test_equip_success` | 拥有的装扮可装备/换槽位/置 null |
| `test_equip_not_owned` | 未拥有的装扮 equip → 400 |
| `test_equip_wrong_slot` | head 装扮 equip 到 top → 400 |
| `test_get_state_returns_cosmetics` | `/api/state` 返回 `owned_cosmetics` 和 `equipped_cosmetics` |
| `test_migration_old_db` | 旧 schema(无新字段)调 `init_db` 后字段存在,默认值正确 |

### 前端手测(没有自动化,验收清单)

1. ☐ 主页左侧出现 Alex,默认装(绿 T 恤、棕裤、灰鞋,无头无手持)
2. ☐ 点击 Alex 进商店,看到 4 槽位货架 + 角色预览
3. ☐ 点未购物品 → 角色立刻穿上 + 弹底部购买栏
4. ☐ 同槽位再点另一件未购 → 切试穿
5. ☐ 点"取消" → 角色回原状 + 关闭购买栏
6. ☐ 金币足够时点购买 → 扣钱飘字、变已装备、关闭购买栏
7. ☐ 金币不够时购买按钮变灰 + 显示"还差 N 金币"
8. ☐ 已购点击 = 直接换装(无确认)
9. ☐ 再点正装备的 = 取消装备
10. ☐ 退出商店,主页角色显示最新装扮
11. ☐ 刷新页面装扮持久(后端持久化生效)
12. ☐ 重启后端不丢装扮(数据库迁移正确)
13. ☐ 旧 game.db(没新字段)启动后端,功能正常,默认全空
14. ☐ 装扮商店在平板上(横屏 / 竖屏)布局不破

## 七、安全 / 隐私

无。本项目假设家庭局域网内可信(README 说明)。装扮数据没有 PII。

## 八、首版装扮清单(20 件)

### head (5)
| id | 名字 | 价格 |
|----|------|------|
| `bunny_ears` | 兔耳头箍 | 50 |
| `straw_hat_flower` | 草帽 + 花 | 60 |
| `butterfly_bow` | 蝴蝶结 | 70 |
| `princess_crown` | 公主王冠 | 120 |
| `miner_helmet` | 矿工头灯 | 80 |

### top (5)
| id | 名字 | 价格 |
|----|------|------|
| `explorer_vest` | 探险家背心 | 100 |
| `pink_princess_dress` | 粉色公主裙 | 200 |
| `mage_robe` | 法师紫袍 | 250 |
| `pirate_coat` | 海盗船长服 | 180 |
| `diamond_armor` | 钻石盔甲 | 350 |

### hand (5)
| id | 名字 | 价格 |
|----|------|------|
| `flower` | 鲜花 | 30 |
| `apple` | 苹果 | 30 |
| `diamond_pickaxe` | 钻石镐 | 220 |
| `magic_wand` | 魔法杖 | 280 |
| `diamond_sword` | 钻石剑 | 300 |

### legs (5)
| id | 名字 | 价格 |
|----|------|------|
| `denim_boots` | 牛仔靴 | 80 |
| `rainbow_socks` | 彩虹长袜 | 100 |
| `snow_boots` | 雪地靴 | 120 |
| `glass_slippers` | 玻璃鞋 | 200 |
| `knight_legs` | 骑士护腿 | 250 |

价格梯度设计:
- 30-100 金币(1-2 天可购,8 件):降低门槛,孩子开始就能买
- 120-200 金币(3-5 天攒,5 件):主力消费区
- 220-350 金币(1 周以上,7 件):高目标,避免短期就买光

## 九、未决问题

无 — 所有关键决策已澄清。下一步:写实现计划(交给 writing-plans skill)。

## 十、相关文件改动汇总

**新建**:
- `backend/cosmetics.py`
- `frontend/js/avatar/catalog.js`
- `frontend/js/avatar/avatar.js`
- `frontend/js/avatar/shop.js`
- `frontend/js/avatar/home-tile.js`
- `frontend/css/avatar.css`
- `tests/test_cosmetics.py`

**修改**:
- `backend/db.py`(加字段迁移、几个新数据访问函数)
- `backend/api.py`(扩展 `/api/state` 返回值,新增两个端点)
- `backend/models.py`(新增请求/响应 Pydantic 模型)
- `frontend/index.html`(引入新文件)
- `frontend/js/platform.js`(主页布局调整 + `enterShop()` 入口)
