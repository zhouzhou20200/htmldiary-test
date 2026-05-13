const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = 3000;

const uploadsDir = path.join(__dirname, 'uploads');
const dataFile = path.join(__dirname, 'data', 'entries.json');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
if (!fs.existsSync(path.dirname(dataFile))) fs.mkdirSync(path.dirname(dataFile), { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, Date.now() + '-' + Math.random().toString(36).slice(2, 8) + ext);
  }
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(__dirname));
app.use('/uploads', express.static(uploadsDir));

function readEntries() {
  if (!fs.existsSync(dataFile)) return [];
  try { return JSON.parse(fs.readFileSync(dataFile, 'utf-8')); } catch { return []; }
}
function writeEntries(entries) {
  fs.writeFileSync(dataFile, JSON.stringify(entries, null, 2), 'utf-8');
}

// 获取所有日记
app.get('/api/entries', (req, res) => {
  res.json(readEntries());
});

// 发布日记（支持多张图片）
app.post('/api/entries', upload.array('images', 9), (req, res) => {
  try {
    const text = (req.body.text || '').trim();
    const files = req.files || [];
    if (!text && files.length === 0) {
      return res.status(400).json({ error: '至少需要文字或图片' });
    }
    const entry = {
      id: Date.now().toString(),
      text,
      images: files.map(f => f.filename),
      createdAt: new Date().toISOString()
    };
    const entries = readEntries();
    entries.unshift(entry);
    writeEntries(entries);
    res.json(entry);
  } catch (err) {
    console.error('POST /api/entries error:', err);
    res.status(500).json({ error: err.message });
  }
});

// 删除日记
app.delete('/api/entries/:id', (req, res) => {
  let entries = readEntries();
  const idx = entries.findIndex(e => e.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: '未找到' });
  const [removed] = entries.splice(idx, 1);
  if (removed.images) {
    removed.images.forEach(img => {
      const imgPath = path.join(uploadsDir, img);
      if (fs.existsSync(imgPath)) fs.unlinkSync(imgPath);
    });
  }
  writeEntries(entries);
  res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log(`日记网站已启动: http://localhost:${PORT}/index.html`);
});
