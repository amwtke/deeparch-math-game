// === 后端 API 封装 ===
// 所有对后端的请求都走这里,方便日后改 base URL 或加错误处理

const API_BASE = '';  // 同源,不需要前缀

async function apiGet(path) {
  const res = await fetch(API_BASE + path);
  if (!res.ok) throw new Error(`GET ${path} 失败: ${res.status}`);
  return res.json();
}

async function apiPost(path, body) {
  const res = await fetch(API_BASE + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
  });
  if (!res.ok) throw new Error(`POST ${path} 失败: ${res.status}`);
  return res.json();
}

const Api = {
  getState: () => apiGet('/api/state'),
  submitAnswer: (payload) => apiPost('/api/answer', payload),
  submitDecomposeAnswer: (payload) => apiPost('/api/decompose/answer', payload),
  getStats: (days = 30) => apiGet(`/api/stats?days=${days}`),
  reset: () => apiPost('/api/reset'),
};

window.Api = Api;
