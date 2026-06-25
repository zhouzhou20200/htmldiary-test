const express = require('express');
const multer = require('multer');
const session = require('express-session');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const sharp = require('sharp');

const app = express();
const PORT = 3000;

// ==================== 目录初始化 ====================
const uploadsDir = path.join(__dirname, 'uploads');
const dataFile = path.join(__dirname, 'data', 'entries.json');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
if (!fs.existsSync(path.dirname(dataFile))) fs.mkdirSync(path.dirname(dataFile), { recursive: true });

// ==================== 认证配置 ====================
const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.ADMIN_PASS || 'please-change-password';
const SESSION_SECRET = process.env.SESSION_SECRET || 'diary-app-secret-' + crypto.randomBytes(8).toString('hex');

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 7 * 24 * 60 * 60 * 1000 }
}));

// ==================== 静态文件 ====================
app.use(express.static(path.join(__dirname, 'public')));
app.use('/picture1', express.static(path.join(__dirname, 'picture1')));
app.use('/uploads', express.static(uploadsDir));

// ==================== 认证中间件 ====================
function requireAuth(req, res, next) {
  if (req.session && req.session.authenticated) return next();
  res.status(401).json({ error: '未登录，请先登录' });
}

// ==================== 登录接口 ====================
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  if (username === ADMIN_USER && password === ADMIN_PASS) {
    req.session.authenticated = true;
    res.json({ ok: true });
  } else {
    res.status(401).json({ error: '账号或密码错误' });
  }
});

app.post('/api/logout', (req, res) => {
  req.session.destroy();
  res.json({ ok: true });
});

app.get('/api/check-auth', (req, res) => {
  res.json({ authenticated: !!(req.session && req.session.authenticated) });
});

// ==================== 文件上传 ====================
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, Date.now() + '-' + crypto.randomBytes(4).toString('hex') + ext);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('只允许上传图片文件'));
  }
});

// 生成缩略图
async function generateThumbnail(filename) {
  const inputPath = path.join(uploadsDir, filename);
  const thumbName = 'thumb-' + filename;
  const thumbPath = path.join(uploadsDir, thumbName);
  try {
    await sharp(inputPath)
      .resize({ width: 800, withoutEnlargement: true })
      .jpeg({ quality: 80 })
      .toFile(thumbPath.replace(path.extname(thumbPath), '.jpg'));
    return thumbName.replace(path.extname(thumbName), '.jpg');
  } catch (e) {
    console.error('缩略图生成失败:', e.message);
    return null;
  }
}

// ==================== 数据读写 ====================
let writeQueue = Promise.resolve();

function readEntries() {
  if (!fs.existsSync(dataFile)) return [];
  try {
    return JSON.parse(fs.readFileSync(dataFile, 'utf-8'));
  } catch {
    return [];
  }
}

function safeWriteEntries(entries) {
  writeQueue = writeQueue.then(() => {
    fs.writeFileSync(dataFile, JSON.stringify(entries, null, 2), 'utf-8');
  }).catch(err => console.error('写入日记失败:', err));
  return writeQueue;
}

// ==================== SSE 实时推送 ====================
const sseClients = new Set();

function broadcastEntries() {
  const entries = readEntries();
  const data = JSON.stringify(entries);
  for (const client of sseClients) {
    client.write(`data: ${data}\n\n`);
  }
}

app.get('/api/entries/stream', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  });
  res.write('\n');
  const entries = readEntries();
  res.write(`data: ${JSON.stringify(entries)}\n\n`);
  sseClients.add(res);
  req.on('close', () => sseClients.delete(res));
});

// ==================== 日记 API ====================

// 获取日记
app.get('/api/entries', (req, res) => {
  const all = readEntries();
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 10));
  const start = (page - 1) * limit;
  const entries = all.slice(start, start + limit);
  res.json({ entries, total: all.length, page, pages: Math.ceil(all.length / limit) });
});

// 【功能1】获取单条日记详情
app.get('/api/entries/:id', (req, res) => {
  const entries = readEntries();
  const entry = entries.find(e => e.id === req.params.id);
  if (!entry) return res.status(404).json({ error: '未找到' });
  res.json(entry);
});

// 获取全部日记
app.get('/api/entries/all', (req, res) => {
  res.json(readEntries());
});

// 发布日记
app.post('/api/entries', requireAuth, upload.array('images', 9), async (req, res) => {
  try {
    const text = (req.body.text || '').trim();
    const files = req.files || [];
    if (!text && files.length === 0) return res.status(400).json({ error: '至少需要文字或图片' });
    if (text.length > 10000) return res.status(400).json({ error: '日记内容不能超过 10000 字' });

    const thumbImages = [];
    for (const f of files) {
      const thumb = await generateThumbnail(f.filename);
      thumbImages.push(thumb || f.filename);
    }

    const mode = req.body.mode === 'travel' ? 'travel' : 'daily';
    const location = mode === 'travel' ? (req.body.location || '').trim().slice(0, 50) : '';
    let createdAt = new Date().toISOString();
    if (req.body.createdAt) {
      const d = new Date(req.body.createdAt);
      if (!isNaN(d.getTime())) createdAt = d.toISOString();
    }

    const entry = {
      id: crypto.randomUUID(),
      mode, location, text,
      images: files.map(f => f.filename),
      thumbImages, createdAt
    };

    const entries = readEntries();
    entries.unshift(entry);
    await safeWriteEntries(entries);
    broadcastEntries();
    res.json(entry);
  } catch (err) {
    console.error('POST /api/entries error:', err);
    res.status(500).json({ error: err.message });
  }
});

// 编辑日记
app.put('/api/entries/:id', requireAuth, upload.array('images', 9), async (req, res) => {
  try {
    const text = req.body.text;
    const location = req.body.location;
    if (text !== undefined && text.length > 10000) return res.status(400).json({ error: '日记内容不能超过 10000 字' });
    const entries = readEntries();
    const entry = entries.find(e => e.id === req.params.id);
    if (!entry) return res.status(404).json({ error: '未找到' });

    if (text !== undefined) entry.text = text.trim();
    if (location !== undefined && entry.mode === 'travel') entry.location = location.trim().slice(0, 50);
    if (req.body.createdAt) {
      const d = new Date(req.body.createdAt);
      if (!isNaN(d.getTime())) entry.createdAt = d.toISOString();
    }

    // 处理删除的图片
    if (req.body.removeImages) {
      let removeList = [];
      try { removeList = JSON.parse(req.body.removeImages); } catch (e) {}
      if (Array.isArray(removeList) && removeList.length > 0) {
        entry.images = (entry.images || []).filter(img => !removeList.includes(img));
        entry.thumbImages = (entry.thumbImages || []).filter(img => !removeList.includes(img));
        for (const img of removeList) {
          const imgPath = path.join(uploadsDir, img);
          if (fs.existsSync(imgPath)) try { fs.unlinkSync(imgPath); } catch (e) {}
          const thumbPath = path.join(uploadsDir, 'thumb-' + img);
          if (fs.existsSync(thumbPath)) try { fs.unlinkSync(thumbPath); } catch (e) {}
        }
      }
    }

    // 处理新增图片
    const files = req.files || [];
    if (files.length > 0) {
      if (!entry.images) entry.images = [];
      if (!entry.thumbImages) entry.thumbImages = [];
      for (const f of files) {
        const thumb = await generateThumbnail(f.filename);
        entry.images.push(f.filename);
        entry.thumbImages.push(thumb || f.filename);
      }
    }

    await safeWriteEntries(entries);
    broadcastEntries();
    res.json(entry);
  } catch (err) {
    console.error('PUT /api/entries error:', err);
    res.status(500).json({ error: err.message });
  }
});

// 删除日记
app.delete('/api/entries/:id', requireAuth, (req, res) => {
  let entries = readEntries();
  const idx = entries.findIndex(e => e.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: '未找到' });
  const [removed] = entries.splice(idx, 1);
  // 清理图片文件
  const allImages = [...(removed.images || []), ...(removed.thumbImages || [])];
  for (const img of allImages) {
    const imgPath = path.join(uploadsDir, img);
    if (fs.existsSync(imgPath)) try { fs.unlinkSync(imgPath); } catch (e) {}
  }
  safeWriteEntries(entries);
  broadcastEntries();
  res.json({ ok: true });
});

// 获取旅游地点列表
app.get('/api/travel-locations', (req, res) => {
  const entries = readEntries();
  const travelEntries = entries.filter(e => e.mode === 'travel' && e.location);
  const groups = {};
  for (const e of travelEntries) {
    if (!groups[e.location]) groups[e.location] = [];
    groups[e.location].push(e);
  }
  const result = Object.entries(groups).map(([location, items]) => ({ location, entries: items }));
  res.json(result);
});

// 【功能3】统计数据接口
app.get('/api/stats', (req, res) => {
  const all = readEntries();
  const year = parseInt(req.query.year) || new Date().getFullYear();
  const month = parseInt(req.query.month) || (new Date().getMonth() + 1);

  // 按年月筛选
  const monthEntries = all.filter(e => {
    const d = new Date(e.createdAt);
    return d.getFullYear() === year && (d.getMonth() + 1) === month;
  });

  // 旅行篇数
  const travelCount = monthEntries.filter(e => e.mode === 'travel').length;

  // 去过的城市（当月）
  const cities = new Set(monthEntries.filter(e => e.mode === 'travel' && e.location).map(e => e.location));

  // 图片总数（当月）
  let imageCount = 0;
  monthEntries.forEach(e => {
    imageCount += (e.images || []).length;
  });

  // 每日发布数（柱状图）
  const daysInMonth = new Date(year, month, 0).getDate();
  const dailyCounts = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const count = monthEntries.filter(e => new Date(e.createdAt).getDate() === d).length;
    dailyCounts.push({ day: d, count });
  }

  // 连续打卡天数（从今天往前）
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let streak = 0;
  for (let i = 0; i < 365; i++) {
    const checkDate = new Date(today);
    checkDate.setDate(checkDate.getDate() - i);
    const hasEntry = all.some(e => {
      const d = new Date(e.createdAt);
      return d.getFullYear() === checkDate.getFullYear()
        && d.getMonth() === checkDate.getMonth()
        && d.getDate() === checkDate.getDate();
    });
    if (hasEntry) streak++;
    else break;
  }

  // 全年所有城市
  const yearEntries = all.filter(e => {
    const d = new Date(e.createdAt);
    return d.getFullYear() === year;
  });
  const yearCities = new Set(yearEntries.filter(e => e.mode === 'travel' && e.location).map(e => e.location));

  res.json({
    year, month,
    total: monthEntries.length,
    travelCount,
    cityCount: cities.size,
    imageCount,
    dailyCounts,
    streak,
    yearCityCount: yearCities.size
  });
});

// ==================== 倒数日背景图上传 ====================
const countdownBgDir = path.join(__dirname, 'uploads', 'countdown-bg');
if (!fs.existsSync(countdownBgDir)) fs.mkdirSync(countdownBgDir, { recursive: true });

const cdStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, countdownBgDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, 'cd-' + Date.now() + '-' + crypto.randomBytes(4).toString('hex') + ext);
  }
});
const cdUpload = multer({
  storage: cdStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('只允许上传图片'));
  }
});

app.use('/uploads/countdown-bg', express.static(countdownBgDir));

app.post('/api/upload-countdown-bg', cdUpload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: '未选择文件' });
  res.json({ path: '/uploads/countdown-bg/' + req.file.filename });
});

// ==================== 启动 ====================
app.listen(PORT, () => {
  console.log(`日记网站已启动: http://localhost:${PORT}/index.html`);
});
