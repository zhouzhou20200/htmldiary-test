// ==================== 共享工具函数 ====================

/**
 * HTML 转义，防止 XSS
 */
function escHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * ISO 时间格式化为 YYYY-MM-DD HH:mm
 */
function formatTime(iso) {
  const d = new Date(iso);
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * 灯箱：点击图片查看大图
 */
function createLightbox() {
  const lb = document.createElement('div');
  lb.id = 'globalLightbox';
  lb.style.cssText = 'display:none;position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.85);z-index:9999;cursor:pointer;justify-content:center;align-items:center;';
  lb.onclick = function () { lb.style.display = 'none'; };
  lb.innerHTML = '<img id="globalLbImg" style="max-width:90%;max-height:90%;border-radius:8px;object-fit:contain;">';
  document.body.appendChild(lb);
  return lb;
}

let _lightbox = null;
function showLightbox(src) {
  if (!_lightbox) _lightbox = createLightbox();
  document.getElementById('globalLbImg').src = src;
  _lightbox.style.display = 'flex';
}

/**
 * 通用 fetch 封装
 */
async function apiFetch(url, options = {}) {
  const res = await fetch(url, options);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

/**
 * 【功能5】主题切换工具
 */
function getTheme() {
  return localStorage.getItem('theme') || 'light';
}

function setTheme(theme) {
  localStorage.setItem('theme', theme);
  document.documentElement.setAttribute('data-theme', theme);
}

function toggleTheme() {
  const next = getTheme() === 'light' ? 'dark' : 'light';
  setTheme(next);
  return next;
}

// 页面加载时自动应用主题
(function initTheme() {
  document.documentElement.setAttribute('data-theme', getTheme());
})();
