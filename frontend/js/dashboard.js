// === 家长仪表盘 ===

async function loadDashboard() {
  let stats;
  try {
    stats = await Api.getStats(30);
    const state = await Api.getState();
    renderKPIs(stats, state);
    renderDailyChart(stats.daily);
    renderWrongTable(stats.wrong_top);
  } catch (e) {
    document.body.innerHTML = '<div style="padding:40px;text-align:center;">'
      + '后端连接失败: ' + e.message + '</div>';
  }
}

function renderKPIs(stats, state) {
  const grid = document.getElementById('kpi-grid');
  grid.innerHTML = '';

  const kpis = [
    { label: '总答题数', value: stats.total_questions },
    { label: '总正确率', value: stats.overall_accuracy + '%' },
    { label: '平均用时', value: stats.avg_seconds + 's' },
    { label: '总金币', value: state.total_coins },
    { label: '最高连击', value: state.best_combo },
    { label: '玩了天数', value: state.days_played + ' 天' },
  ];

  kpis.forEach(k => {
    const card = document.createElement('div');
    card.className = 'kpi-card';
    card.innerHTML = `
      <div class="kpi-label">${k.label}</div>
      <div class="kpi-value">${k.value}</div>
    `;
    grid.appendChild(card);
  });
}

function renderDailyChart(daily) {
  const ctx = document.getElementById('daily-chart').getContext('2d');

  if (daily.length === 0) {
    document.getElementById('daily-chart').replaceWith(
      Object.assign(document.createElement('div'), {
        className: 'empty', textContent: '还没有数据,让孩子做几道题吧',
      })
    );
    return;
  }

  new Chart(ctx, {
    type: 'bar',
    data: {
      labels: daily.map(d => d.date.slice(5)),  // MM-DD
      datasets: [
        {
          label: '答对',
          data: daily.map(d => d.correct),
          backgroundColor: 'rgba(46, 125, 50, 0.7)',
          borderColor: 'rgba(46, 125, 50, 1)',
          borderWidth: 1,
        },
        {
          label: '答错',
          data: daily.map(d => d.done - d.correct),
          backgroundColor: 'rgba(198, 40, 40, 0.6)',
          borderColor: 'rgba(198, 40, 40, 1)',
          borderWidth: 1,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: { stacked: true, grid: { display: false } },
        y: { stacked: true, beginAtZero: true, ticks: { stepSize: 1 } },
      },
      plugins: {
        legend: { position: 'top' },
        tooltip: {
          callbacks: {
            afterLabel(ctx) {
              const i = ctx.dataIndex;
              return '正确率 ' + daily[i].accuracy + '%';
            },
          },
        },
      },
    },
  });
}

function renderWrongTable(wrong) {
  const container = document.getElementById('wrong-table-container');
  container.innerHTML = '';

  if (wrong.length === 0) {
    container.innerHTML = '<div class="empty">没有错题,真棒!</div>';
    return;
  }

  const table = document.createElement('table');
  table.className = 'wrong-table';
  table.innerHTML = `
    <thead>
      <tr>
        <th>题目</th>
        <th>正确答案</th>
        <th style="text-align:right;">错误次数</th>
      </tr>
    </thead>
    <tbody>
      ${wrong.map(w => `
        <tr>
          <td class="question">${w.a} + ${w.b}</td>
          <td>${w.answer}</td>
          <td class="count">${w.wrong_count}</td>
        </tr>
      `).join('')}
    </tbody>
  `;
  container.appendChild(table);
}

document.getElementById('refresh-btn').addEventListener('click', loadDashboard);

loadDashboard();
