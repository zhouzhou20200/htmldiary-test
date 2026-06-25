# 📝 日记记录

一个简洁的个人日记网站，支持日常日记和旅游日记记录。

## ✨ 功能特点

- 📝 日常/旅游双模式日记
- 🖼️ 图片上传与预览
- 📅 日历视图与时间轴切换
- 📊 月度统计面板
- ⏰ 倒数日/纪念日组件
- 🌙 暗色/亮色主题切换
- 🎨 3D 立体相册展示
- 📱 响应式设计，支持移动端

## 🚀 快速开始

### 安装依赖

```bash
npm install
```

### 启动服务

```bash
npm start
```

### 访问页面

浏览器打开 http://localhost:3000

## 📁 项目结构

```
├── server.js          # 后端服务
├── package.json       # 依赖配置
├── public/            # 前端页面
│   ├── index.html     # 登录页
│   ├── 67zz.html      # 首页（主页面）
│   ├── diary.html     # 写日记页
│   ├── detail.html    # 日记详情/海报页
│   ├── css/common.css # 共享样式
│   └── js/common.js   # 共享工具函数
├── picture1/          # 静态图片资源
├── data/              # 数据存储（自动创建）
└── uploads/           # 用户上传的日记图片（自动创建）
```

## ⚙️ 配置

可通过环境变量配置管理员账号：

```bash
ADMIN_USER=admin ADMIN_PASS=your-password npm start
```

## 📄 许可证

MIT License
