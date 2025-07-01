# 视频管理工具

一个基于 Electron + React + TypeScript 开发的本地视频文件管理工具，帮助您更好地组织和播放本地视频资源。

## ✨ 功能特性

### 🗂️ 分类管理
- **自定义分类**：将本地文件夹映射为视频分类（如：dm-动漫，ds-电视剧，dy-电影）
- **可扩展分类**：支持添加、编辑、删除分类
- **颜色标识**：为每个分类设置专属颜色
- **路径绑定**：每个分类绑定到特定的本地文件夹

### 🎬 视频管理
- **智能扫描**：自动扫描分类目录下的视频文件
- **多层目录支持**：智能识别多层目录结构中的视频文件
- **剧集管理**：自动归组多集视频（动漫、电视剧等）
- **封面展示**：为视频生成预览封面
- **播放集成**：一键调用本地播放器播放视频

### ⚙️ 设置选项
- **播放器配置**：设置默认视频播放器
- **扫描深度**：自定义目录扫描的层级深度
- **自动扫描**：开启/关闭自动扫描新视频
- **缩略图质量**：调整缩略图生成质量

## 🚀 快速开始

### 环境要求
- Node.js 16+ 
- Windows 10/11
- 已安装的视频播放器（如 VLC、PotPlayer、MPC-HC 等）

### 安装依赖
```bash
npm install
```

### 开发模式运行
```bash
npm run dev
```

### 构建生产版本
```bash
npm run build
npm run dist
```

## 📖 使用指南

### 1. 设置播放器
首次使用时，请先进入「设置」页面：
1. 点击「选择」按钮选择您的视频播放器程序（.exe文件）
2. 推荐使用：VLC Media Player、PotPlayer、MPC-HC 等
3. 点击「测试」按钮验证播放器是否可用
4. 点击「保存设置」

### 2. 创建分类
进入「分类管理」页面：
1. 点击「添加分类」按钮
2. 输入分类名称（如：动漫、电影、电视剧）
3. 点击「选择目录」选择对应的本地文件夹
4. 选择分类颜色（可选）
5. 添加描述信息（可选）
6. 点击「确定」保存

### 3. 浏览视频
进入「视频库」页面：
1. 在顶部下拉菜单中选择要浏览的分类
2. 系统会自动扫描该分类下的视频文件
3. 点击视频卡片可以：
   - 单个视频：直接播放
   - 多集视频：查看剧集列表
4. 点击「刷新」按钮重新扫描视频文件

## 🎯 支持的视频格式

- MP4, AVI, MKV, MOV
- WMV, FLV, WebM, M4V
- MPG, MPEG, 3GP

## 📁 项目结构

```
MPlayer/
├── src/
│   ├── main/           # Electron 主进程
│   │   ├── main.ts     # 主进程入口
│   │   ├── preload.ts  # 预加载脚本
│   │   ├── database.ts # 数据存储
│   │   └── videoScanner.ts # 视频扫描
│   └── renderer/       # React 渲染进程
│       └── src/
│           ├── App.tsx # 主应用组件
│           └── components/ # 功能组件
├── dist/               # 构建输出
└── release/           # 打包输出
```

## 🔧 技术栈

- **前端框架**：React 18 + TypeScript
- **UI 组件库**：Ant Design 5
- **桌面框架**：Electron 25
- **构建工具**：Vite 4
- **数据存储**：LowDB (JSON文件数据库)

## 📝 开发说明

### 添加新功能
1. 在 `src/main/main.ts` 中添加 IPC 处理器
2. 在 `src/main/preload.ts` 中暴露 API
3. 在 React 组件中调用 `window.electronAPI`

### 数据存储
- 应用数据存储在用户数据目录的 `video-manager.json` 文件中
- 支持分类、视频信息、用户设置的持久化存储

## 🤝 贡献指南

1. Fork 本项目
2. 创建功能分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 创建 Pull Request

## 📄 许可证

本项目采用 MIT 许可证 - 查看 [LICENSE](LICENSE) 文件了解详情

## 🙏 致谢

- [Electron](https://electronjs.org/) - 跨平台桌面应用框架
- [React](https://reactjs.org/) - 用户界面库
- [Ant Design](https://ant.design/) - 企业级 UI 设计语言
- [Vite](https://vitejs.dev/) - 下一代前端构建工具 