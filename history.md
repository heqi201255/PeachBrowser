# PeachBrowser 开发历史

## 2026-02-18

### 初始化项目结构
- 创建项目目录结构: server/, client/, data/
- 创建 package.json 配置依赖
- 创建 config.json 配置服务器、数据库、缩略图、扫描器等参数

### 技术栈
- 后端: Node.js + Express + sql.js (纯JS的SQLite实现)
- 前端: 纯HTML/CSS/JavaScript (响应式设计)
- 媒体处理: FFmpeg
- 认证: JWT + bcryptjs

### 后端实现
- server/database.js: SQLite3数据库初始化，包含用户、媒体库、媒体文件、标签、播放历史等表
- server/scanner.js: 文件扫描模块，递归扫描目录，计算文件MD5（基于内容，忽略元数据）
- server/thumbnail.js: 缩略图生成服务，使用FFmpeg为视频和图片生成预览图，支持队列处理
- server/index.js: Express主服务器，包含所有API路由

### 前端实现
- client/index.html: 主HTML入口
- client/css/style.css: 响应式样式，支持桌面和移动端
- client/js/api.js: API调用封装
- client/js/store.js: 状态管理
- client/js/components/auth.js: 登录/注册页面
- client/js/components/libraries.js: 媒体库选择界面
- client/js/components/browser.js: 媒体浏览界面（窗格化+分页+hover预览）
- client/js/components/player.js: 播放器模态框
- client/js/app.js: 主应用入口

### 功能实现
- 用户注册/登录（本地JWT认证）
- 媒体库管理（添加/删除/扫描）
- 媒体文件浏览（分页/筛选/搜索）
- 预览图自动生成（异步队列处理）
- 视频hover预览（鼠标悬停自动播放，左右拖动调整进度）
- 标签系统（添加/删除/按标签筛选）
- 播放历史记录
- 文件上传（拖拽+按钮）
- 文件删除（移到回收站）
- 响应式设计（支持移动端）

### 已知限制
- 由于浏览器安全限制，添加媒体库时需要手动输入文件夹路径
- 预览图提取依赖FFmpeg，需确保系统已安装
- 文件夹选择器在纯Web环境下不可用，需要后续集成Electron来实现原生文件夹选择

### 启动方式
```bash
npm install
npm start
```

然后访问 http://localhost:3000

## 2026-02-18 (更新)

### Bug修复
1. **媒体文件不显示问题**
   - 简化了SQL查询，拆分复杂的多表JOIN为多个简单查询
   - sql.js对复杂GROUP BY支持有限，改用程序逻辑拼接数据
   
2. **退出登录后媒体库消失问题**
   - 确保数据库每次操作后正确保存
   - 修正了datetime函数的SQL语法（使用datetime("now")而非CURRENT_TIMESTAMP）
   
3. **UI抖动问题**
   - 移除library-card的transform动画，改为只过渡border-color
   - 添加will-change: transform优化grid渲染性能

### 新增功能
- 添加server/metadata.js: 使用ffprobe提取媒体元数据（分辨率、时长、帧率、编码等）
- 扫描时自动提取并存储媒体元数据到media_metadata表

## 2026-02-18 (第二次更新)

### Bug修复
1. **401 Unauthorized错误**
   - 浏览器直接加载图片/视频时不携带Authorization header
   - 修复: 后端支持从URL参数中读取token，前端在URL中添加token参数
   
2. **Token持久化验证**
   - 添加用户存在性验证，确保token对应的用户仍然存在
   
3. **修复数据库权限查询**
   - 数据库结构改为使用user_libraries关联表
   - 添加checkLibraryAccess辅助函数统一处理权限检查
   - 修复所有library查询以支持新的权限系统

### 新增功能
1. **目录结构浏览**
   - API支持按路径过滤，显示当前目录下的文件和子目录
   - 左侧栏添加目录树，支持展开/收起子目录
   - 添加文件夹卡片显示，双击进入目录
   - 顶栏添加返回按钮，支持返回上级目录
   
2. **独立播放器页面 (player.html)**
   - 创建独立的视频播放页面，替代原来的模态框
   - 支持播放列表显示（显示同目录下所有视频）
   - 添加快捷键支持:
     - ↑ 上一个视频
     - ↓ 下一个视频  
     - ← 后退5秒
     - → 前进5秒
     - 空格 播放/暂停
     - ESC 退出
   - 播放器页面包含侧边播放列表，可点击切换
   
3. **评分功能**
   - 添加media_ratings表存储用户评分
   - 文件详情栏显示5星评分，点击即可打分
   - 每个用户独立存储评分
   
4. **文件同步功能**
   - 添加同步按钮，点击后检查文件变更
   - 自动删除数据库中已不存在的文件记录
   - 自动扫描新增文件并提取元数据
   
5. **标签系统改进**
   - 标签现在按媒体库隔离，只显示当前库的标签
   - 添加标签后立即刷新标签列表

### UI改进
1. **左侧栏重构**
   - PeachBrowser logo变为可点击菜单
   - 添加"返回媒体库"选项到logo菜单
   - 新增"目录"面板显示文件夹树状结构
   - 目录支持展开/收起子文件夹
   
2. **顶栏优化**
   - 布局改为: [返回按钮] [媒体库名/路径] [搜索栏] [同步按钮] [用户菜单]
   - 返回按钮在非根目录时显示
   - 添加同步按钮用于手动同步文件
   
3. **修复详情栏覆盖问题**
   - 添加响应式布局，详情栏弹出时顶栏内容自动左移
   
4. **添加评分星星样式**
   - 媒体卡片显示评分星星
   - 详情栏添加可交互的5星评分组件

### 技术改进
1. **API更新**
   - /api/libraries/:id/media 支持path参数过滤目录
   - /api/libraries/:id/directories 新增，获取目录结构
   - /api/media/:id/rating GET/POST 新增，评分功能
   - /api/libraries/:id/sync POST 新增，文件同步
   - /api/tags 支持libraryId参数，按库筛选标签
   
2. **权限系统**
   - 支持管理员和普通用户角色
   - 管理员默认账号: admin/admin
   - 只有管理员能创建/删除媒体库
   - 普通用户只能访问被分配的媒体库

## 2026-02-18 (第三次更新)

### Bug修复
1. **缩略图500错误**
   - 修复URL解码问题，后端现在正确解码URL编码的路径
   - 添加安全检查，确保路径不越界
   - 改进错误处理，记录详细错误信息

2. **退出登录按钮无响应**
   - 检查并确认事件绑定正确
   - 用户菜单下拉框现在正确显示/隐藏
   - 退出登录后清除token并重置store

3. **左侧栏目录滚动条样式**
   - 添加全局自定义滚动条样式
   - 滚动条现在与深色主题匹配
   - 使用细滚动条，hover时变亮

4. **筛选时文件夹显示逻辑**
   - 修复：当筛选特定类型（如视频）时，只显示包含该类型文件的文件夹
   - 修改后端API，在获取目录列表时考虑文件类型筛选条件
   - 空文件夹或不含匹配文件类型的文件夹不再显示

### 新增测试文件
- `test/run_tests.sh`: 基础功能测试脚本
- `test/comprehensive_test.sh`: 综合测试脚本
- `test/test_thumbnails.sh`: 缩略图API测试
- `client/test.html`: 前端UI测试页面

### 已知问题
 1. **文件选择器**: 浏览器限制无法调用系统文件选择器，仍需手动输入路径
 2. **缩略图生成**: 某些视频格式可能导致FFmpeg生成缩略图失败
 3. **Electron集成**: 如需原生文件选择器，需要后续集成Electron

## 2026-02-18 (第四次更新)

### Bug修复
1. **缩略图路径错误** (Critical)
   - `res.sendFile()` 需要绝对路径
   - 修改为使用 `path.resolve()` 后的路径

2. **目录树显示文件而非文件夹** (Critical)
   - 重写 `/api/libraries/:id/directories` API
   - 现在只返回包含子目录的文件夹，不再将文件误判为文件夹
   - 添加 `hasSubdirs` 检测逻辑

3. **用户菜单下拉框点击问题** (Critical)
   - 添加 `z-index: 1001` 确保下拉框在最上层
   - 修复事件传播问题，添加 `e.stopPropagation()`
   - 确保所有菜单按钮点击不会立即关闭菜单

4. **登录后管理员状态未更新** (Critical)
   - 登录后立即调用 `api.getCurrentUser()` 获取完整的用户信息
   - 正确设置 `store.isAdmin` 状态
   - 退出登录后正确重置状态

5. **API权限查询错误** (Critical)
   - 多个API使用了旧的 `l.user_id = ?` 查询（已废弃）
   - 改为使用 `checkLibraryAccess()` 函数检查权限
   - 影响的API：`/api/media/:id/play`, `/api/media/:id`, `/api/media/:id` (DELETE), `/api/media/:id/tags`, `/api/media/:id/rating`

### 新增功能
1. **删除用户功能**
   - 管理员现在可以删除普通用户
   - 添加 `DELETE /api/admin/users/:userId` API
   - 用户管理界面添加删除按钮
   - 禁止删除管理员和自己

2. **用户权限改进**
   - 可访问媒体库现在使用多选下拉框（原来可能有问题）
   - 下拉框高度固定，更易操作
   - 保存时批量更新所有用户的权限

## 2026-02-19 (第五次更新)

### Bug修复
1. **播放器页面改进**
   - 移除prev/next按钮（快捷键已足够）
   - 视频容器改为flex布局，视频/图片自动填满可用空间
   - 使用`object-fit: contain`保持宽高比

2. **标签显示问题**
   - 修复详情面板标签显示`[object Object]`的问题
   - API返回的tags现在是字符串数组而非对象数组

3. **标签筛选功能**
   - 添加按标签筛选媒体的API支持
   - 点击左侧栏标签现在会筛选右侧文件列表
   - SQL查询添加tag条件JOIN

4. **删除媒体库时的缩略图删除**
   - 修复`trash is not a function`错误
   - trash 8.x是ESM模块，改用动态import
   - 删除媒体库时使用`fs.rmSync`删除缩略图文件夹
   - 删除媒体文件时使用动态import加载trash移到回收站

### UI改进
1. **用户权限表格**
   - 改为checkbox矩阵形式，每列对应一个媒体库
   - 更直观地展示每个用户的权限配置