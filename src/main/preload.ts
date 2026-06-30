import { contextBridge, ipcRenderer } from 'electron';

// 暴露安全的API给渲染进程
contextBridge.exposeInMainWorld('electronAPI', {
  // 文件/目录选择
  selectDirectory: () => ipcRenderer.invoke('select-directory'),
  selectFile: (options: { title: string; filters: any[] }) => 
    ipcRenderer.invoke('select-file', options),
  
  // 视频相关操作
  scanVideos: (directory: string) => ipcRenderer.invoke('scan-videos', directory),
  generateThumbnail: (videoPath: string) => ipcRenderer.invoke('generate-thumbnail', videoPath),
  // 预览功能已移除
  
  // 播放器操作
  openWithPlayer: (videoPath: string, playerPath?: string) => 
    ipcRenderer.invoke('open-with-player', videoPath, playerPath),
  
  // 视频信息获取
  getVideoInfo: (videoPath: string) => ipcRenderer.invoke('get-video-info', videoPath),
  
  // 数据库操作
  saveCategory: (category: any) => ipcRenderer.invoke('save-category', category),
  getCategories: () => ipcRenderer.invoke('get-categories'),
  deleteCategory: (categoryId: string) => ipcRenderer.invoke('delete-category', categoryId),
  saveVideoInfo: (videoInfo: any) => ipcRenderer.invoke('save-video-info', videoInfo),
  getVideosByCategory: (categoryId: string) => ipcRenderer.invoke('get-videos-by-category', categoryId),
  getAllVideos: () => ipcRenderer.invoke('get-all-videos'),
  checkFileExists: (filePath: string) => ipcRenderer.invoke('check-file-exists', filePath),
  hasVirtualRename: (videoId: string) => ipcRenderer.invoke('has-virtual-rename', videoId),
  
  // 设置管理
  saveSetting: (key: string, value: any) => ipcRenderer.invoke('save-setting', key, value),
  getSetting: (key: string, defaultValue?: any) => ipcRenderer.invoke('get-setting', key, defaultValue),
  
  // 自动扫描管理
  getAutoScanSettings: () => ipcRenderer.invoke('get-auto-scan-settings'),
  updateAutoScanSettings: (settings: any) => ipcRenderer.invoke('update-auto-scan-settings', settings),
  getAutoScanStatus: () => ipcRenderer.invoke('get-auto-scan-status'),
  pauseAutoScan: () => ipcRenderer.invoke('pause-auto-scan'),
  getAutoScanDebugInfo: () => ipcRenderer.invoke('get-auto-scan-debug-info'),
  
  // 封面管理
  selectImage: () => ipcRenderer.invoke('select-image'),
  saveCoverImage: (imagePath: string, videoId: string) => ipcRenderer.invoke('save-cover-image', imagePath, videoId),
  updateVideoCover: (videoId: string, coverPath: string) => ipcRenderer.invoke('update-video-cover', videoId, coverPath),
  getCoversDirectory: () => ipcRenderer.invoke('get-covers-directory'),
  getImageAsDataUrl: (imagePath: string) => ipcRenderer.invoke('get-image-as-dataurl', imagePath),
  
  // 播放历史管理
  addPlayHistory: (history: any) => ipcRenderer.invoke('add-play-history', history),
  getPlayHistory: (limit?: number) => ipcRenderer.invoke('get-play-history', limit),
  clearPlayHistory: () => ipcRenderer.invoke('clear-play-history'),
  
  // 主题管理
  getThemes: () => ipcRenderer.invoke('get-themes'),
  getActiveTheme: () => ipcRenderer.invoke('get-active-theme'),
  setActiveTheme: (themeId: string) => ipcRenderer.invoke('set-active-theme', themeId),
  saveTheme: (theme: any) => ipcRenderer.invoke('save-theme', theme),
  deleteTheme: (themeId: string) => ipcRenderer.invoke('delete-theme', themeId),
  selectBackgroundImage: () => ipcRenderer.invoke('select-background-image'),
  
  // 标签管理
  saveTag: (tag: any) => ipcRenderer.invoke('save-tag', tag),
  getTags: () => ipcRenderer.invoke('get-tags'),
  deleteTag: (tagId: string) => ipcRenderer.invoke('delete-tag', tagId),
  getVideosByTag: (tagId: string) => ipcRenderer.invoke('get-videos-by-tag', tagId),
  
  // 重命名规则管理
  saveRenameRule: (rule: any) => ipcRenderer.invoke('save-rename-rule', rule),
  getRenameRules: () => ipcRenderer.invoke('get-rename-rules'),
  deleteRenameRule: (ruleId: string) => ipcRenderer.invoke('delete-rename-rule', ruleId),
  parseFileName: (filePath: string) => ipcRenderer.invoke('parse-filename', filePath),
  generateRenamePreview: (ruleId: string, videoIds: string[]) => 
    ipcRenderer.invoke('generate-rename-preview', ruleId, videoIds),
  executeRename: (ruleId: string, previewResults: any[], mode: 'virtual' | 'physical') => 
    ipcRenderer.invoke('execute-rename', ruleId, previewResults, mode),
  getRenameHistory: (limit?: number) => ipcRenderer.invoke('get-rename-history', limit),
  clearRenameHistory: () => ipcRenderer.invoke('clear-rename-history'),
  revertRename: (historyId: string) => ipcRenderer.invoke('revert-rename', historyId),
  getPresetTemplates: () => ipcRenderer.invoke('get-preset-templates'),
  
  // NFO文件管理
  parseNFO: (videoPath: string) => ipcRenderer.invoke('parse-nfo', videoPath),
  fixNFOData: (categoryId: string) => ipcRenderer.invoke('fix-nfo-data', categoryId),
  diagnoseNFOScan: (categoryId: string) => ipcRenderer.invoke('diagnose-nfo-scan', categoryId),
  writeNFO: (nfoPath: string, nfoData: any, type?: 'movie' | 'tvshow') => 
    ipcRenderer.invoke('write-nfo', nfoPath, nfoData, type),
  createNFOPath: (videoPath: string) => ipcRenderer.invoke('create-nfo-path', videoPath),
  hasNFOFile: (videoPath: string) => ipcRenderer.invoke('has-nfo-file', videoPath),
  
  // 清理规则管理
  getCleaningRules: () => ipcRenderer.invoke('get-cleaning-rules'),
  saveCleaningRule: (rule: any) => ipcRenderer.invoke('save-cleaning-rule', rule),
  deleteCleaningRule: (ruleId: string) => ipcRenderer.invoke('delete-cleaning-rule', ruleId),
  updateCleaningRuleStatus: (ruleId: string, enabled: boolean) => 
    ipcRenderer.invoke('update-cleaning-rule-status', ruleId, enabled),
  testCleaningRule: (rule: any, testText: string) => 
    ipcRenderer.invoke('test-cleaning-rule', rule, testText),
  previewCleaningEffect: (testText: string) => 
    ipcRenderer.invoke('preview-cleaning-effect', testText),
  
  // 事件监听
  onScanProgress: (callback: (progress: { current: number; total: number; currentPath: string; percentage: number }) => void) => {
    const listener = (_: any, progress: any) => callback(progress);
    ipcRenderer.on('scan-progress', listener);
    // 返回清理函数
    return () => ipcRenderer.removeListener('scan-progress', listener);
  },
  
  onAutoScanResult: (callback: (result: { categoryId: string; action: string; data: any }) => void) => {
    const listener = (_: any, result: any) => callback(result);
    ipcRenderer.on('auto-scan-result', listener);
    // 返回清理函数
    return () => ipcRenderer.removeListener('auto-scan-result', listener);
  },
  
  // 🔥 新增：重命名进度监听
  onRenameProgress: (callback: (progressData: any) => void) => {
    const listener = (_: any, progressData: any) => callback(progressData);
    ipcRenderer.on('rename-progress', listener);
    // 返回清理函数
    return () => ipcRenderer.removeListener('rename-progress', listener);
  },
  
  removeRenameProgressListener: (callback: any) => {
    ipcRenderer.removeListener('rename-progress', callback);
  }
}); 