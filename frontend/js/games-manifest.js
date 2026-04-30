// === 游戏注册清单 ===
// 加新游戏:在这里加一行,然后在 index.html 里 <script> 引入对应 game.js,
// 该游戏代码自己挂 window.<module> = { start(host), exit() }。

window.Games = [
  {
    id: 'cou-shi',
    name: '凑十大冒险',
    icon: '⛏',
    color: 'green',
    module: 'CouShi',
    enabled: true,
  },
  {
    id: 'chai-kuang',
    name: '矿石分解大师',
    icon: '🔨',
    color: 'orange',
    module: 'ChaiKuang',
    enabled: true,
  },
  {
    id: 'placeholder-2',
    name: '敬请期待',
    icon: '🔒',
    color: 'gray',
    module: null,
    enabled: false,
  },
];
