# 轻笔记 (QuickNote)

轻量简洁的浏览器侧边栏笔记扩展，随时记录、不打断浏览，简单好用。

## 功能特性

* 📝 **多笔记管理** - 支持创建、编辑、删除多个笔记
* 📦 **浏览器原生侧边栏** - 不占用页面空间，随用随开
* 💾 **本地自动保存** - 数据自动保存到 IndexedDB，不丢失
* 🔌 **开箱即用** - 无需注册与配置

## 安装步骤

1. 克隆 / 下载本项目代码
2. 打开浏览器「扩展管理」（`chrome://extensions/`）
3. 开启「开发者模式」
4. 点击「加载已解压的扩展程序」，选择项目文件夹

## 使用方式

1. 点击扩展图标打开侧边栏笔记
2. 直接输入内容，自动实时保存

## 文件结构

```
quicknote/
├── background.js      # 扩展后台逻辑
├── manifest.json      # 扩展配置清单
├── sidepanel.css      # 侧边栏样式
├── sidepanel.html     # 侧边栏界面
└── sidepanel.js       # 笔记交互逻辑
```

## 技术实现

* **存储**：IndexedDB 本地数据库，数据不上传服务器
* **编辑器**：支持富文本的 contenteditable div
* **图片**：支持粘贴图片，以 base64 格式存储
* **主题**：CSS 变量 + data-theme 属性，支持动态切换

## 截图预览

<img width="2560" height="1290" alt="image" src="https://github.com/user-attachments/assets/1e51c715-6c94-4660-85ba-b91e4ccb7751" />
