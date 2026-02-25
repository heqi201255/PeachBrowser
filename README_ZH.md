<div align="center">
  <img src="client/assets/logo.png" alt="PeachBrowser Logo" width="200">
  <h1>PeachBrowser</h1>
  <p>一个简单易用的本地媒体库浏览器 (Eagle替代)</p>
</div>

---

## 简介

PeachBrowser 是一个轻量级的本地媒体库管理系统，支持视频和图片的浏览、管理和预览。基于 Node.js 构建，提供响应式的 Web 界面，支持桌面端和移动端访问。

## 功能特性

- **用户认证** - 本地 JWT 认证，支持用户注册/登录
- **媒体库管理** - 添加、删除、扫描媒体目录
- **媒体浏览** - 分页、筛选、搜索功能
- **预览图生成** - 自动为视频和图片生成缩略图（异步队列处理）
- **视频预览** - 鼠标悬停自动播放，左右拖动调整进度
- **标签系统** - 为媒体文件添加标签，按标签筛选
- **播放历史** - 记录观看历史
- **响应式设计** - 支持桌面端和移动端

## 技术栈

| 类型 | 技术 |
|------|------|
| 后端 | Node.js + Express |
| 数据库 | sql.js (SQLite) |
| 前端 | 原生 HTML/CSS/JavaScript |
| 媒体处理 | FFmpeg |
| 认证 | JWT + bcryptjs |

## 快速开始

### 环境要求

- Node.js >= 14
- FFmpeg（用于缩略图生成）

### 安装运行

```bash
npm install
npm start
```

访问 http://localhost:3000

### 配置

编辑 `config.json` 配置服务器、数据库、缩略图、扫描器等参数：

```json
{
  "server": {
    "port": 3000
  },
  "database": {
    "path": "./data/peach.db"
  },
  "thumbnail": {
    "size": 320,
    "quality": 2
  },
  "scanner": {
    "concurrency": 5
  }
}
```

## 已知限制

- 由于浏览器安全限制，添加媒体库时需要手动输入文件夹路径
- 预览图生成依赖 FFmpeg，请确保系统已安装
- 文件夹选择器在纯 Web 环境下不可用，后续可集成 Electron 实现原生文件夹选择

## 更新日志

### 2026-02-18

- 初始化项目结构
- 完成用户认证、媒体库管理、文件浏览等核心功能
- 实现预览图自动生成
- 实现视频 hover 预览
- 实现标签系统和播放历史
- 响应式设计支持移动端

## 许可证

MIT License