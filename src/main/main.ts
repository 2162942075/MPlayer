import { app, BrowserWindow, Menu, ipcMain, dialog, protocol } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { isDev, logger } from './utils';

let mainWindow: BrowserWindow | null = null;

// 设置应用名称，确保用户数据目录正确
app.setName('video-manager');

// 禁用安全警告（仅开发环境）
if (isDev) {
  process.env['ELECTRON_DISABLE_SECURITY_WARNINGS'] = 'true';
}

function createWindow(): void {
  // 创建主窗口
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    icon: path.join(__dirname, isDev ? '../../icons/video-manager.ico' : '../icons/video-manager.ico'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
    show: false,
    titleBarStyle: 'default',
  });

  // 加载页面
  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  // 窗口准备好后显示
  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  // 窗口关闭事件
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// 应用就绪时创建窗口
app.whenReady().then(() => {
  createWindow();

  // macOS 特殊处理
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// 所有窗口关闭时退出应用（macOS除外）
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// 导入数据库和视频扫描器
import { database } from './database';
import { videoScanner } from './videoScanner';
import { autoScanManager } from './autoScanManager';
import { spawn } from 'child_process';



// 初始化数据库
database.init().then(async () => {
  logger.info('数据库初始化完成');
  // 初始化主题数据
  await database.initThemes();
  logger.info('主题初始化完成');
  
  // 预加载清理规则缓存
  await getCachedCleaningRules();
  logger.info('清理规则缓存已预加载');
  
  // 自动扫描管理器已经在其构造函数中自动初始化
  logger.info('自动扫描管理器已初始化');
}).catch((error) => {
  logger.error('初始化失败:', error);
});

// IPC 处理器
ipcMain.handle('select-directory', async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    properties: ['openDirectory'],
  });
  return result.filePaths[0] || null;
});

ipcMain.handle('select-file', async (_, options: { title: string; filters: any[] }) => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    title: options.title,
    properties: ['openFile'],
    filters: options.filters,
  });
  return result.filePaths[0] || null;
});

// 分类管理
ipcMain.handle('save-category', async (_, category) => {
  try {
    await database.saveCategory(category);
    
    // 刷新自动扫描监听器（包含新分类）
    if (category.id && category.path) {
      await autoScanManager.refreshWatchers();
      logger.info('已刷新自动扫描监听器，包含新分类:', category.name);
    }
    
    return { success: true };
  } catch (error) {
    logger.error('保存分类失败:', error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
});

ipcMain.handle('get-categories', async () => {
  try {
    return await database.getCategories();
  } catch (error) {
    console.error('获取分类失败:', error);
    return [];
  }
});

ipcMain.handle('delete-category', async (_, categoryId: string) => {
  try {
    // 删除数据库中的分类数据
    await database.deleteCategory(categoryId);
    
    // 刷新自动扫描监听器（移除已删除的分类）
    await autoScanManager.refreshWatchers();
    console.log('已刷新自动扫描监听器，移除已删除的分类:', categoryId);
    
    return { success: true };
  } catch (error) {
    console.error('删除分类失败:', error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
});

// 视频管理
ipcMain.handle('scan-videos', async (_, categoryId: string) => {
  try {
    const categories = await database.getCategories();
    const category = categories.find(c => c.id === categoryId);
    
    if (!category) {
      throw new Error('分类不存在');
    }

    // 在清除数据前，保存现有的用户数据（封面、标签等）
    const existingVideos = await database.getVideosByCategory(categoryId);
    const coverMap = new Map<string, string>();
    const userDataMap = new Map<string, any>();
    
    // 收集所有视频和剧集的用户数据
    for (const video of existingVideos) {
      // 保存封面
      if (video.thumbnail) {
        coverMap.set(video.id, video.thumbnail);
        console.log('保存封面信息 - 主视频:', video.id, video.title);
      }
      
      // 🔥 保存用户数据（标签、评分、观看状态等）
      userDataMap.set(video.id, {
        tags: video.tags || [],
        userRating: video.userRating,
        userNotes: video.userNotes,
        watchStatus: video.watchStatus,
        lastWatchedAt: video.lastWatchedAt,
        watchProgress: video.watchProgress
      });
      
      // 收集剧集的数据
      if (video.episodes) {
        for (const episode of video.episodes) {
          // 保存剧集封面
          if (episode.thumbnail) {
            coverMap.set(episode.id, episode.thumbnail);
            console.log('保存封面信息 - 剧集:', episode.id, episode.title);
          }
          
          // 🔥 保存剧集用户数据
          userDataMap.set(episode.id, {
            tags: episode.tags || [],
            userRating: episode.userRating,
            userNotes: episode.userNotes,
            watchStatus: episode.watchStatus,
            lastWatchedAt: episode.lastWatchedAt,
            watchProgress: episode.watchProgress
          });
        }
      }
    }
    
    console.log('共保存了', coverMap.size, '个封面信息，', userDataMap.size, '个用户数据');

    // 🔥 更安全的方案：先清理不存在的文件，再扫描新文件
    console.log('🔍 开始检查数据库中现有视频文件的存在性...');
    
    const currentVideos = await database.getVideosByCategory(categoryId);
    const toDelete: string[] = [];
    const validExistingVideos: any[] = [];
    
    // 检查现有视频文件是否还存在
    for (const video of currentVideos) {
      let shouldKeep = false;
      
      if (video.isDirectory) {
        // 如果是目录，检查目录是否存在
        if (fs.existsSync(video.path)) {
          shouldKeep = true;
          // 同时检查目录下的剧集文件
          if (video.episodes && video.episodes.length > 0) {
            const validEpisodes = video.episodes.filter(episode => fs.existsSync(episode.path));
            if (validEpisodes.length !== video.episodes.length) {
              console.log(`📁 ${video.title}: 移除 ${video.episodes.length - validEpisodes.length} 个不存在的剧集`);
              video.episodes = validEpisodes;
              // 需要更新数据库
              await database.saveVideoInfo(video);
            }
          }
        }
      } else {
        // 如果是单个文件，检查文件是否存在
        if (fs.existsSync(video.path)) {
          shouldKeep = true;
        }
      }
      
      if (shouldKeep) {
        validExistingVideos.push(video);
        console.log(`✅ 保留存在的文件: ${video.title}`);
      } else {
        toDelete.push(video.id);
        console.log(`❌ 标记删除不存在的文件: ${video.title} (${video.path})`);
      }
    }
    
    // 从数据库中删除不存在的文件记录
    if (toDelete.length > 0) {
      console.log(`🗑️ 从数据库删除 ${toDelete.length} 个不存在的文件记录...`);
      for (const videoId of toDelete) {
        // 我们需要实现一个删除单个视频的方法
        await database.deleteVideoById(videoId);
      }
      console.log('✅ 不存在的文件记录已清理');
    } else {
      console.log('✅ 所有现有文件都存在，无需清理');
    }

    const maxDepth = await database.getSetting('scanDepth', 3);
    
    // 设置扫描进度回调
    videoScanner.setProgressCallback((current: number, total: number, currentPath: string) => {
      // 向渲染进程发送扫描进度
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('scan-progress', {
          current,
          total,
          currentPath,
          percentage: total > 0 ? Math.round((current / total) * 100) : 0
        });
      }
    });
    
    console.log('📂 开始扫描新增和变化的文件...');
    const scannedVideos = await videoScanner.scanDirectory(category.path, categoryId, maxDepth);
    
    // 清除进度回调
    videoScanner.setProgressCallback(undefined);
    
    // 🔥 找出真正新增的视频（避免重复保存）
    const existingVideoIds = new Set(validExistingVideos.map(v => v.id));
    const existingVideoPaths = new Set(validExistingVideos.map(v => v.path));
    
    // 🔥 同时收集所有剧集的ID和路径
    for (const video of validExistingVideos) {
      if (video.episodes) {
        for (const episode of video.episodes) {
          existingVideoIds.add(episode.id);
          existingVideoPaths.add(episode.path);
        }
      }
    }
    
    // 🔥 修复：过滤重复视频，不仅基于ID，还基于路径
    const newVideos = scannedVideos.filter(video => {
      // 检查主视频ID和路径是否已存在
      if (existingVideoIds.has(video.id)) {
        return false;
      }
      
      // 🔥 重要：检查相同路径是否已存在（处理ID变化的情况）
      if (existingVideoPaths.has(video.path)) {
        console.log(`⚠️ 发现相同路径的主视频，跳过: ${video.title} (${video.path})`);
        return false;
      }
      
      // 🔥 检查剧集是否重复
      if (video.episodes) {
        const validEpisodes = video.episodes.filter(episode => {
          if (existingVideoIds.has(episode.id)) {
            return false;
          }
          if (existingVideoPaths.has(episode.path)) {
            console.log(`⚠️ 发现相同路径的剧集，跳过: ${episode.title} (${episode.path})`);
            return false;
          }
          return true;
        });
        
        // 如果所有剧集都被过滤掉了，那么这个主视频也不需要
        if (validEpisodes.length === 0) {
          console.log(`⚠️ 主视频的所有剧集都已存在，跳过整个主视频: ${video.title}`);
          return false;
        }
        
        // 更新剧集列表
        video.episodes = validEpisodes;
      }
      
      return true;
    });
    
    console.log(`📊 扫描结果统计:`);
    console.log(`  📁 保留现有视频: ${validExistingVideos.length} 个`);
    console.log(`  🆕 发现新增视频: ${newVideos.length} 个`);
    console.log(`  🗑️ 删除无效记录: ${toDelete.length} 个`);
    
    // 🔥 恢复用户数据到新扫描的视频
    for (const video of newVideos) {
      // 恢复封面
      if (coverMap.has(video.id)) {
        video.thumbnail = coverMap.get(video.id);
        console.log('恢复封面信息 - 新视频:', video.id, video.title);
      }
      
      // 🔥 恢复用户数据（标签、评分等）
      if (userDataMap.has(video.id)) {
        const userData = userDataMap.get(video.id);
        video.tags = userData.tags;
        (video as any).userRating = userData.userRating;
        (video as any).userNotes = userData.userNotes;
        video.watchStatus = userData.watchStatus || video.watchStatus;
        (video as any).lastWatchedAt = userData.lastWatchedAt;
        (video as any).watchProgress = userData.watchProgress;
        console.log('恢复用户数据 - 新视频:', video.id, video.title, '标签数量:', video.tags?.length || 0);
      }
      
      // 恢复剧集的数据
      if (video.episodes) {
        for (const episode of video.episodes) {
          // 恢复剧集封面
          if (coverMap.has(episode.id)) {
            episode.thumbnail = coverMap.get(episode.id);
            console.log('恢复封面信息 - 新剧集:', episode.id, episode.title);
          }
          
          // 🔥 恢复剧集用户数据
          if (userDataMap.has(episode.id)) {
            const userData = userDataMap.get(episode.id);
            episode.tags = userData.tags;
            (episode as any).userRating = userData.userRating;
            (episode as any).userNotes = userData.userNotes;
            episode.watchStatus = userData.watchStatus || episode.watchStatus;
            (episode as any).lastWatchedAt = userData.lastWatchedAt;
            (episode as any).watchProgress = userData.watchProgress;
            console.log('恢复用户数据 - 新剧集:', episode.id, episode.title, '标签数量:', episode.tags?.length || 0);
          }
        }
      }
    }
    
    console.log('用户数据恢复完成');

    // 保存新增的视频
    if (newVideos.length > 0) {
      console.log(`📦 保存 ${newVideos.length} 个新增视频...`);
      for (const video of newVideos) {
        await database.saveVideoInfo(video);
      }
      console.log('✅ 新增视频保存完成');
    }
    
    // 🔥 检查并更新现有视频的NFO数据
    console.log('🔍 检查现有视频的NFO数据更新...');
    let nfoUpdatedCount = 0;
    for (const scannedVideo of scannedVideos) {
      const existingVideo = validExistingVideos.find(v => v.id === scannedVideo.id);
      if (existingVideo) {
        // 比较NFO数据是否有变化
        const existingNFO = existingVideo.nfoData;
        const scannedNFO = scannedVideo.nfoData;
        
        // 如果扫描到的视频有NFO数据，但现有视频没有，或者NFO内容有变化
        if (scannedNFO && (!existingNFO || JSON.stringify(existingNFO) !== JSON.stringify(scannedNFO))) {
          console.log(`🔄 更新NFO数据: ${existingVideo.title}`);
          existingVideo.nfoData = scannedNFO;
          await database.saveVideoInfo(existingVideo);
          nfoUpdatedCount++;
        }
        
        // 同样检查剧集的NFO数据
        if (existingVideo.episodes && scannedVideo.episodes) {
          for (let i = 0; i < existingVideo.episodes.length; i++) {
            const existingEpisode = existingVideo.episodes[i];
            const scannedEpisode = scannedVideo.episodes.find(ep => ep.id === existingEpisode.id);
            
            if (scannedEpisode && scannedEpisode.nfoData && 
                (!existingEpisode.nfoData || JSON.stringify(existingEpisode.nfoData) !== JSON.stringify(scannedEpisode.nfoData))) {
              console.log(`🔄 更新剧集NFO数据: ${existingEpisode.title}`);
              existingEpisode.nfoData = scannedEpisode.nfoData;
            }
          }
          
                     // 如果有剧集NFO更新，保存整个视频对象
           if (existingVideo.episodes.some((ep: any) => scannedVideo.episodes?.find((sep: any) => sep.id === ep.id && sep.nfoData))) {
             await database.saveVideoInfo(existingVideo);
           }
        }
      }
    }
    
    if (nfoUpdatedCount > 0) {
      console.log(`✅ 更新了 ${nfoUpdatedCount} 个视频的NFO数据`);
    } else {
      console.log('✅ 所有现有视频的NFO数据都是最新的');
    }
    
    // 返回所有有效视频（现有的 + 新增的）
    const allValidVideos = [...validExistingVideos, ...newVideos];
    console.log(`✅ 扫描完成，当前分类共有 ${allValidVideos.length} 个有效视频`);
    
    return allValidVideos;
  } catch (error) {
    console.error('扫描视频失败:', error);
    return [];
  }
});

ipcMain.handle('get-videos-by-category', async (_, categoryId: string) => {
  try {
    let videos = await database.getVideosByCategory(categoryId);
    
    // 如果没有视频数据，自动扫描一次
    if (videos.length === 0) {
      const categories = await database.getCategories();
      const category = categories.find(c => c.id === categoryId);
      
      if (category) {
        const maxDepth = await database.getSetting('scanDepth', 3);
        
        // 设置扫描进度回调
        videoScanner.setProgressCallback((current: number, total: number, currentPath: string) => {
          // 向渲染进程发送扫描进度
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('scan-progress', {
              current,
              total,
              currentPath,
              percentage: total > 0 ? Math.round((current / total) * 100) : 0
            });
          }
        });
        
        videos = await videoScanner.scanDirectory(category.path, categoryId, maxDepth);
        
        // 清除进度回调
        videoScanner.setProgressCallback(undefined);
        
        // 保存扫描结果（首次扫描，没有需要恢复的封面信息）
        for (const video of videos) {
          await database.saveVideoInfo(video);
        }
      }
    }
    
    return videos;
  } catch (error) {
    console.error('获取视频失败:', error);
    return [];
  }
});

// 获取所有视频
ipcMain.handle('get-all-videos', async () => {
  try {
    const videos = await database.getAllVideos();
    console.log('获取所有视频数量:', videos.length);
    return videos;
  } catch (error) {
    console.error('获取所有视频失败:', error);
    return [];
  }
});

// 检查文件是否存在
ipcMain.handle('check-file-exists', async (_, filePath: string) => {
  try {
    console.log('检查文件是否存在:', filePath);
    const exists = fs.existsSync(filePath);
    console.log('文件存在性检查结果:', exists);
    return exists;
  } catch (error) {
    console.error('检查文件存在性失败:', error);
    return false;
  }
});

// 检查视频是否有虚拟重命名
ipcMain.handle('has-virtual-rename', async (_, videoId: string) => {
  try {
    return await database.hasVirtualRename(videoId);
  } catch (error) {
    console.error('检查虚拟重命名失败:', error);
    return false;
  }
});

ipcMain.handle('save-video-info', async (_, videoInfo) => {
  try {
    await database.saveVideoInfo(videoInfo);
    return { success: true };
  } catch (error) {
    console.error('保存视频信息失败:', error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
});

// 播放器相关
ipcMain.handle('open-with-player', async (_, videoPath: string, playerPath?: string) => {
  try {
    let player = playerPath;
    
    if (!player) {
      // 从设置中获取默认播放器
      player = await database.getSetting('playerPath');
    }
    
    // 如果没有配置外部播放器，使用内置的 ffplay
    if (!player) {
      let ffplayPath: string;
      
      // 检测开发环境的多种方式
      const isDevelopment = process.env.NODE_ENV === 'development' || 
                           !app.isPackaged || 
                           fs.existsSync(path.join(process.cwd(), 'package.json'));
      
      if (isDevelopment) {
        // 开发环境：使用项目目录下的 ffmpeg
        ffplayPath = path.join(process.cwd(), 'ffmpeg', 'bin', 'ffplay.exe');
      } else {
        // 生产环境：使用 extraResources 中的 ffmpeg
        ffplayPath = path.join(process.resourcesPath, 'ffmpeg', 'bin', 'ffplay.exe');
      }
      
      console.log('尝试查找内置播放器:', ffplayPath);
      
      if (fs.existsSync(ffplayPath)) {
        player = ffplayPath;
        console.log('使用内置播放器 FFplay:', player);
      } else {
        console.error('内置播放器不可用，查找路径:', ffplayPath);
        console.error('资源路径信息:', {
          resourcesPath: process.resourcesPath,
          appPath: app.getAppPath(),
          env: process.env.NODE_ENV
        });
        return { success: false, error: '未配置外部播放器且内置播放器不可用，请在设置中配置播放器' };
      }
    } else {
      console.log('使用外部播放器:', player);
    }
    
    console.log('启动播放器:', player, '播放文件:', videoPath);
    
        // 准备播放器参数
    let args: string[];
    if (player.includes('ffplay')) {
      // 内置FFplay播放器
      args = [videoPath];
      console.log('内置播放器参数:', args);
    } else {
      // 外部播放器，只传递视频路径
      args = [videoPath];
    }
    
    // 检查视频文件是否存在
    if (!fs.existsSync(videoPath)) {
      console.error('视频文件不存在:', videoPath);
      return { success: false, error: '视频文件不存在: ' + videoPath };
    }
    
    // 检查是否启用调试模式
    const debugMode = await database.getSetting('ffplayDebugMode', false);
    if (debugMode) {
      // 添加调试参数
      if (player.includes('ffplay')) {
        args.unshift('-loglevel', 'debug');
      }
    }
    
    // 启动播放器
    console.log('准备启动播放器，命令行:', player, args.join(' '));
    console.log('完整命令:', `"${player}" ${args.map(arg => `"${arg}"`).join(' ')}`);
    console.log('视频文件路径:', videoPath);
    console.log('视频文件存在:', fs.existsSync(videoPath));
    
    // 如果启用调试模式，弹出命令行信息
    if (debugMode && player.includes('ffplay')) {
      const fullCommand = `"${player}" ${args.map(arg => `"${arg}"`).join(' ')}`;
      console.log('FFplay调试命令:', fullCommand);
      
      // 可以选择性地弹出对话框显示命令
      const { dialog } = require('electron');
      dialog.showMessageBox({
        type: 'info',
        title: 'FFplay 调试信息',
        message: '完整命令行：',
        detail: fullCommand,
        buttons: ['确定']
      });
    }
    
    const child = spawn(player, args, {
      detached: true,
      stdio: 'ignore'
    });
    
    // 监听子进程错误
    child.on('error', (error) => {
      console.error('子进程启动失败:', error);
    });
    
    child.unref();
    return { success: true, playerType: player.includes('ffplay') ? 'built-in' : 'external' };
  } catch (error) {
    console.error('打开播放器失败:', error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
});

// 设置管理
ipcMain.handle('save-setting', async (_, key: string, value: any) => {
  try {
    await database.saveSetting(key, value);
    return { success: true };
  } catch (error) {
    console.error('保存设置失败:', error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
});

ipcMain.handle('get-setting', async (_, key: string, defaultValue: any = null) => {
  try {
    return await database.getSetting(key, defaultValue);
  } catch (error) {
    console.error('获取设置失败:', error);
    return defaultValue;
  }
});

// 自动扫描管理
ipcMain.handle('get-auto-scan-settings', async () => {
  try {
    return autoScanManager.getSettings();
  } catch (error) {
    console.error('获取自动扫描设置失败:', error);
    throw error;
  }
});

ipcMain.handle('update-auto-scan-settings', async (_, settings) => {
  try {
    await autoScanManager.updateSettings(settings);
    return { success: true };
  } catch (error) {
    console.error('更新自动扫描设置失败:', error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
});

ipcMain.handle('get-auto-scan-status', async () => {
  try {
    return {
      watchingStatus: autoScanManager.getWatchingStatus(),
      performanceInfo: autoScanManager.getPerformanceInfo()
    };
  } catch (error) {
    console.error('获取自动扫描状态失败:', error);
    throw error;
  }
});

ipcMain.handle('pause-auto-scan', async () => {
  try {
    autoScanManager.pauseForUserAction();
    return { success: true };
  } catch (error) {
    console.error('暂停自动扫描失败:', error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
});

ipcMain.handle('get-auto-scan-debug-info', async () => {
  try {
    return autoScanManager.getDebugInfo();
  } catch (error) {
    console.error('获取自动扫描调试信息失败:', error);
    throw error;
  }
});

// 缩略图生成
ipcMain.handle('generate-thumbnail', async (_, videoPath: string) => {
  try {
    return videoScanner.generateThumbnail(videoPath);
  } catch (error) {
    console.error('生成缩略图失败:', error);
    return null;
  }
});

// 预览功能已移除

// 封面管理
ipcMain.handle('select-image', async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    title: '选择封面图片',
    properties: ['openFile'],
    filters: [
      { name: '图片文件', extensions: ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp'] },
      { name: '所有文件', extensions: ['*'] }
    ]
  });
  return result.filePaths[0] || null;
});

ipcMain.handle('get-covers-directory', async () => {
  const path = require('path');
  const userDataPath = app.getPath('userData');
  const coversDir = path.join(userDataPath, 'covers');
  return coversDir;
});

ipcMain.handle('get-image-as-dataurl', async (_, imagePath: string) => {
  try {
    const fs = require('fs');
    const path = require('path');
    
    if (!fs.existsSync(imagePath)) {
      console.error('图片文件不存在:', imagePath);
      return null;
    }
    
    // 异步读取文件内容
    const imageBuffer = await fs.promises.readFile(imagePath);
    
    // 获取文件扩展名以确定MIME类型
    const ext = path.extname(imagePath).toLowerCase();
    let mimeType = 'image/jpeg'; // 默认
    
    switch (ext) {
      case '.png':
        mimeType = 'image/png';
        break;
      case '.gif':
        mimeType = 'image/gif';
        break;
      case '.bmp':
        mimeType = 'image/bmp';
        break;
      case '.webp':
        mimeType = 'image/webp';
        break;
      case '.jpg':
      case '.jpeg':
      default:
        mimeType = 'image/jpeg';
        break;
    }
    
    // 转换为base64数据URL
    const base64 = imageBuffer.toString('base64');
    const dataUrl = `data:${mimeType};base64,${base64}`;
    
    console.log('成功转换图片为数据URL，文件:', imagePath, '大小:', imageBuffer.length, 'bytes');
    return dataUrl;
  } catch (error) {
    console.error('转换图片为数据URL失败:', error);
    return null;
  }
});

ipcMain.handle('save-cover-image', async (_, imagePath: string, videoId: string) => {
  try {
    const fs = require('fs');
    const path = require('path');
    
    // 创建封面存储目录
    const userDataPath = app.getPath('userData');
    const coversDir = path.join(userDataPath, 'covers');
    
    console.log('用户数据目录:', userDataPath);
    console.log('封面保存目录:', coversDir);
    
    if (!fs.existsSync(coversDir)) {
      fs.mkdirSync(coversDir, { recursive: true });
      console.log('创建封面目录:', coversDir);
    }
    
    // 检查并迁移旧的Electron目录中的文件
    const oldUserDataPath = path.join(path.dirname(userDataPath), 'Electron');
    const oldCoversDir = path.join(oldUserDataPath, 'covers');
    if (fs.existsSync(oldCoversDir)) {
      console.log('发现旧的封面目录:', oldCoversDir);
      try {
        const oldFiles = fs.readdirSync(oldCoversDir);
        for (const file of oldFiles) {
          const oldFilePath = path.join(oldCoversDir, file);
          const newFilePath = path.join(coversDir, file);
          if (!fs.existsSync(newFilePath)) {
            fs.copyFileSync(oldFilePath, newFilePath);
            console.log('迁移文件:', file);
          }
        }
      } catch (error) {
        console.log('迁移旧文件时出错:', error);
      }
    }
    
    // 生成新的文件名
    const ext = path.extname(imagePath);
    const newFileName = `${videoId}${ext}`;
    const newPath = path.join(coversDir, newFileName);
    
    console.log('原图片路径:', imagePath);
    console.log('新文件路径:', newPath);
    console.log('视频ID:', videoId);
    
    // 复制图片文件
    fs.copyFileSync(imagePath, newPath);
    
    // 验证文件是否成功复制
    if (fs.existsSync(newPath)) {
      const stats = fs.statSync(newPath);
      console.log('封面文件保存成功，大小:', stats.size, 'bytes');
    } else {
      console.error('封面文件保存失败');
    }
    
    return { success: true, coverPath: newPath };
  } catch (error) {
    console.error('保存封面图片失败:', error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
});

ipcMain.handle('update-video-cover', async (_, videoId: string, coverPath: string) => {
  try {
    console.log('开始更新视频封面 - 视频ID:', videoId, '封面路径:', coverPath);
    
    // 获取视频信息并更新封面
    const categories = await database.getCategories();
    for (const category of categories) {
      const videos = await database.getVideosByCategory(category.id);
      const video = videos.find(v => v.id === videoId);
      
      if (video) {
        console.log('找到主视频:', video.title, '原封面:', video.thumbnail);
        video.thumbnail = coverPath;
        await database.saveVideoInfo(video);
        console.log('主视频封面更新成功');
        return { success: true };
      }
      
      // 检查是否是剧集中的视频
      for (const v of videos) {
        if (v.episodes) {
          const episode = v.episodes.find(e => e.id === videoId);
          if (episode) {
            console.log('找到剧集视频:', episode.title, '所属:', v.title, '原封面:', episode.thumbnail);
            episode.thumbnail = coverPath;
            await database.saveVideoInfo(v);
            console.log('剧集视频封面更新成功');
            return { success: true };
          }
        }
      }
    }
    
    console.log('未找到对应的视频，videoId:', videoId);
    return { success: false, error: '未找到对应的视频' };
  } catch (error) {
    console.error('更新视频封面失败:', error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
});

// 播放历史管理
ipcMain.handle('add-play-history', async (_, history) => {
  try {
    await database.addPlayHistory(history);
    return { success: true };
  } catch (error) {
    console.error('添加播放历史失败:', error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
});

ipcMain.handle('get-play-history', async (_, limit?: number) => {
  try {
    return await database.getPlayHistory(limit);
  } catch (error) {
    console.error('获取播放历史失败:', error);
    return [];
  }
});

ipcMain.handle('clear-play-history', async () => {
  try {
    await database.clearPlayHistory();
    return { success: true };
  } catch (error) {
    console.error('清空播放历史失败:', error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
});

// 标签管理
ipcMain.handle('save-tag', async (_, tag) => {
  try {
    await database.saveTag(tag);
    return { success: true };
  } catch (error) {
    console.error('保存标签失败:', error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
});

ipcMain.handle('get-tags', async () => {
  try {
    return await database.getTags();
  } catch (error) {
    console.error('获取标签失败:', error);
    return [];
  }
});

ipcMain.handle('delete-tag', async (_, tagId: string) => {
  try {
    await database.deleteTag(tagId);
    return { success: true };
  } catch (error) {
    console.error('删除标签失败:', error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
});

ipcMain.handle('get-videos-by-tag', async (_, tagId: string) => {
  try {
    return await database.getVideosByTag(tagId);
  } catch (error) {
    console.error('按标签获取视频失败:', error);
    return [];
  }
});

// NFO文件管理
ipcMain.handle('parse-nfo', async (_, videoPath: string) => {
  try {
    const { NFOParser } = await import('./nfoParser');
    const nfoPath = NFOParser.findNFOFile(videoPath);
    if (!nfoPath) return null;
    
    return await NFOParser.parseNFO(nfoPath);
  } catch (error) {
    console.error('解析NFO文件失败:', error);
    return null;
  }
});

ipcMain.handle('write-nfo', async (_, nfoPath: string, nfoData: any, type: 'movie' | 'tvshow' = 'movie') => {
  try {
    const { NFOParser } = await import('./nfoParser');
    return await NFOParser.writeNFO(nfoPath, nfoData, type);
  } catch (error) {
    console.error('写入NFO文件失败:', error);
    return false;
  }
});

ipcMain.handle('create-nfo-path', async (_, videoPath: string) => {
  try {
    const { NFOParser } = await import('./nfoParser');
    return NFOParser.createNFOPath(videoPath);
  } catch (error) {
    console.error('创建NFO文件路径失败:', error);
    return null;
  }
});

ipcMain.handle('has-nfo-file', async (_, videoPath: string) => {
  try {
    const { NFOParser } = await import('./nfoParser');
    return NFOParser.hasNFOFile(videoPath);
  } catch (error) {
    console.error('检查NFO文件失败:', error);
    return false;
  }
});

// 修复所有视频的NFO数据
ipcMain.handle('fix-nfo-data', async (_, categoryId: string) => {
  try {
    console.log('🔧 开始修复NFO数据，分类:', categoryId);
    const { NFOParser } = await import('./nfoParser');
    
    // 获取该分类的所有视频
    const videos = await database.getVideosByCategory(categoryId);
    let fixedCount = 0;
    let totalCount = 0;
    
    for (const video of videos) {
      totalCount++;
      try {
        // 查找NFO文件
        const nfoPath = NFOParser.findNFOFile(video.path);
        if (nfoPath) {
          // 重新解析NFO文件
          const nfoData = await NFOParser.parseNFO(nfoPath);
          if (nfoData) {
            // 更新数据库中的NFO数据
            const updatedVideo = { ...video, nfoData };
            await database.saveVideoInfo(updatedVideo);
            fixedCount++;
            console.log(`✅ 修复NFO数据: ${video.title}`);
          }
        }
      } catch (error) {
        console.error(`❌ 修复NFO数据失败: ${video.title}`, error);
      }
    }
    
    console.log(`🎉 NFO数据修复完成: ${fixedCount}/${totalCount}`);
    return { success: true, fixedCount, totalCount };
  } catch (error) {
    console.error('修复NFO数据失败:', error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
});

// 添加NFO扫描诊断功能
ipcMain.handle('diagnose-nfo-scan', async (_, categoryId: string) => {
  try {
    console.log('🔍 开始NFO扫描诊断，分类:', categoryId);
    const { NFOParser } = await import('./nfoParser');
    const fs = await import('fs');
    const path = await import('path');
    
    // 获取该分类的所有视频
    const videos = await database.getVideosByCategory(categoryId);
    const diagnosis: any[] = [];
    
    console.log(`📊 开始诊断 ${videos.length} 个视频的NFO情况`);
    
    for (const video of videos) {
      const videoInfo: any = {
        videoTitle: video.title,
        videoPath: video.path,
        isDirectory: video.isDirectory,
        hasNFOInDatabase: !!video.nfoData,
        nfoFileFound: false,
        nfoFilePath: '',
        nfoFileExists: false,
        nfoParseSuccess: false,
        nfoData: null as any,
        actors: [] as string[],
        error: ''
      };
      
      try {
        // 查找NFO文件
        const nfoPath = NFOParser.findNFOFile(video.path);
        if (nfoPath) {
          videoInfo.nfoFileFound = true;
          videoInfo.nfoFilePath = nfoPath;
          videoInfo.nfoFileExists = fs.existsSync(nfoPath);
          
          if (videoInfo.nfoFileExists) {
            // 尝试解析NFO文件
            const nfoData = await NFOParser.parseNFO(nfoPath);
            if (nfoData) {
              videoInfo.nfoParseSuccess = true;
              videoInfo.nfoData = nfoData;
              videoInfo.actors = nfoData.actors || [];
            }
          }
        }
      } catch (error) {
        videoInfo.error = error instanceof Error ? error.message : String(error);
      }
      
      diagnosis.push(videoInfo);
      console.log(`🔍 诊断完成: ${video.title} - NFO找到:${videoInfo.nfoFileFound} 解析成功:${videoInfo.nfoParseSuccess}`);
    }
    
    // 统计信息
    const stats = {
      totalVideos: videos.length,
      videosWithNFOInDB: diagnosis.filter(d => d.hasNFOInDatabase).length,
      nfoFilesFound: diagnosis.filter(d => d.nfoFileFound).length,
      nfoFilesExist: diagnosis.filter(d => d.nfoFileExists).length,
      nfoParseSuccess: diagnosis.filter(d => d.nfoParseSuccess).length,
      totalActors: [...new Set(diagnosis.flatMap(d => d.actors))].length
    };
    
    console.log('📊 NFO诊断统计:', stats);
    
    return { 
      success: true, 
      diagnosis, 
      stats,
      missingNFOVideos: diagnosis.filter(d => !d.nfoFileFound),
      failedParseVideos: diagnosis.filter(d => d.nfoFileFound && !d.nfoParseSuccess)
    };
  } catch (error) {
    console.error('NFO扫描诊断失败:', error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
});

// 主题管理
ipcMain.handle('get-themes', async () => {
  try {
    return await database.getThemes();
  } catch (error) {
    console.error('获取主题列表失败:', error);
    return [];
  }
});

ipcMain.handle('get-active-theme', async () => {
  try {
    return await database.getActiveTheme();
  } catch (error) {
    console.error('获取当前主题失败:', error);
    return 'default';
  }
});

ipcMain.handle('set-active-theme', async (_, themeId: string) => {
  try {
    await database.setActiveTheme(themeId);
    return { success: true };
  } catch (error) {
    console.error('设置主题失败:', error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
});

ipcMain.handle('save-theme', async (_, theme: any) => {
  try {
    console.log('收到保存主题请求:', theme?.name);
    
    // 验证主题数据
    if (!theme || !theme.name || !theme.colors) {
      throw new Error('主题数据不完整');
    }
    
    await database.saveTheme(theme);
    console.log('主题保存成功:', theme.name);
    return { success: true };
  } catch (error) {
    console.error('保存主题失败:', error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
});

ipcMain.handle('delete-theme', async (_, themeId: string) => {
  try {
    await database.deleteTheme(themeId);
    return { success: true };
  } catch (error) {
    console.error('删除主题失败:', error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
});

ipcMain.handle('select-background-image', async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    title: '选择背景图片',
    properties: ['openFile'],
    filters: [
      { name: '图片文件', extensions: ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp'] },
      { name: '所有文件', extensions: ['*'] }
    ]
  });
  return result.filePaths[0] || null;
});

// 设置菜单
const template: Electron.MenuItemConstructorOptions[] = [
  {
    label: '文件',
    submenu: [
      {
        label: '退出',
        accelerator: 'CmdOrCtrl+Q',
        click: () => {
          app.quit();
        },
      },
    ],
  },
  {
    label: '视图',
    submenu: [
      { role: 'reload', label: '重新加载' },
      { role: 'forceReload', label: '强制重新加载' },
      { role: 'toggleDevTools', label: '切换开发者工具' },
      { type: 'separator' },
      { role: 'resetZoom', label: '实际大小' },
      { role: 'zoomIn', label: '放大' },
      { role: 'zoomOut', label: '缩小' },
      { type: 'separator' },
      { role: 'togglefullscreen', label: '切换全屏' },
    ],
  },
];

Menu.setApplicationMenu(Menu.buildFromTemplate(template));

// 视频信息提取
ipcMain.handle('get-video-info', async (_, videoPath: string) => {
  try {
    console.log('开始获取视频信息:', videoPath);
    
    // 检查文件是否存在
    if (!fs.existsSync(videoPath)) {
      throw new Error('视频文件不存在');
    }
    
    // 获取文件基本信息
    const stats = fs.statSync(videoPath);
    const fileSizeBytes = stats.size;
    const fileSizeMB = (fileSizeBytes / (1024 * 1024)).toFixed(2);
    const fileSizeGB = (fileSizeBytes / (1024 * 1024 * 1024)).toFixed(2);
    const fileSize = parseFloat(fileSizeGB) >= 1 ? `${fileSizeGB} GB` : `${fileSizeMB} MB`;
    
    const createTime = stats.birthtime;
    const modifyTime = stats.mtime;
    
    // 基本信息（不依赖FFmpeg）
    const basicInfo = {
      fileName: path.basename(videoPath),
      filePath: videoPath,
      fileSize: fileSize,
      fileSizeBytes: fileSizeBytes,
      extension: path.extname(videoPath).toLowerCase(),
      createTime: createTime.toISOString(),
      modifyTime: modifyTime.toISOString(),
      // 默认值
      duration: '未知',
      resolution: '未知',
      codec: '未知',
      bitrate: '未知',
      frameRate: '未知',
      audioCodec: '未知',
      channels: '未知'
    };

    // 尝试使用FFprobe获取详细信息
    console.log('🔍 准备调用extractVideoMetadata...');
    try {
      console.log('🔍 开始执行extractVideoMetadata，路径:', videoPath);
      const ffprobeResult = await extractVideoMetadata(videoPath);
      console.log('🔍 extractVideoMetadata返回结果:', ffprobeResult);
      if (ffprobeResult) {
        console.log('🔍 合并FFprobe结果到basicInfo...');
        Object.assign(basicInfo, ffprobeResult);
        console.log('🔍 合并后的basicInfo:', basicInfo);
      } else {
        console.log('⚠️ extractVideoMetadata返回了空结果');
      }
    } catch (ffprobeError) {
      console.error('❌ FFprobe获取视频信息失败，使用基本信息:', ffprobeError);
      console.error('❌ 错误类型:', typeof ffprobeError);
      console.error('❌ 错误详情:', ffprobeError instanceof Error ? ffprobeError.message : String(ffprobeError));
    }

    console.log('视频信息获取成功:', basicInfo);
    return { success: true, info: basicInfo };
  } catch (error) {
    console.error('获取视频信息失败:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : String(error),
      info: null 
    };
  }
});

// FFprobe视频信息提取函数
async function extractVideoMetadata(videoPath: string): Promise<any> {
  return new Promise((resolve, reject) => {
    // 构建FFprobe命令 - 使用正确的路径逻辑
    let ffprobePath: string;
    
    console.log('🚨🚨🚨 环境检查 NODE_ENV:', process.env.NODE_ENV);
    console.log('🚨🚨🚨 当前目录 __dirname:', __dirname);
    console.log('🚨🚨🚨 process.cwd():', process.cwd());
    console.log('🚨🚨🚨 app.isPackaged:', app.isPackaged);
    
    // 改进环境检测：优先检查是否为打包状态，其次检查环境变量
    const isDevelopment = !app.isPackaged || process.env.NODE_ENV === 'development';
    console.log('🚨🚨🚨 判断为开发环境:', isDevelopment);
    
    if (isDevelopment) {
      // 开发环境：使用项目目录下的 ffmpeg
      ffprobePath = path.join(__dirname, '..', '..', 'ffmpeg', 'bin', 'ffprobe.exe');
      console.log('🚨🚨🚨 开发环境路径计算结果:', ffprobePath);
    } else {
      // 生产环境：使用 extraResources 中的 ffmpeg
      ffprobePath = path.join(process.resourcesPath, 'ffmpeg', 'bin', 'ffprobe.exe');
      console.log('🚨🚨🚨 生产环境路径计算结果:', ffprobePath);
    }
    
    console.log('FFprobe路径检查:', ffprobePath, '存在:', fs.existsSync(ffprobePath));
    
    if (!fs.existsSync(ffprobePath)) {
      // 如果找不到内置的，尝试直接使用项目目录中的ffmpeg（兜底方案）
      const fallbackPath = path.join(process.cwd(), 'ffmpeg', 'bin', 'ffprobe.exe');
      console.log('🚨🚨🚨 尝试兜底路径:', fallbackPath);
      if (fs.existsSync(fallbackPath)) {
        ffprobePath = fallbackPath;
        console.log('✅ 使用兜底路径FFprobe');
      } else {
        ffprobePath = 'ffprobe';
        console.log('❌ 使用系统路径FFprobe');
      }
    }
    
    console.log('最终使用FFprobe路径:', ffprobePath);
    const args = [
      '-v', 'quiet',
      '-print_format', 'json',
      '-show_format',
      '-show_streams',
      videoPath
    ];

    console.log('执行FFprobe命令:', ffprobePath, 'args:', args);
    console.log('视频文件路径:', videoPath);
    console.log('视频文件是否存在:', fs.existsSync(videoPath));

    const child = spawn(ffprobePath, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => {
      stdout += data.toString();
      console.log('FFprobe stdout chunk:', data.toString().substring(0, 100));
    });

    child.stderr.on('data', (data) => {
      stderr += data.toString();
      console.log('FFprobe stderr chunk:', data.toString());
    });

    child.on('close', (code) => {
      console.log('🔄 FFprobe进程结束，退出代码:', code);
      console.log('📊 stdout长度:', stdout.length);
      console.log('📊 stderr长度:', stderr.length);
      console.log('📄 stdout前100字符:', stdout.substring(0, 100));
      if (stderr) {
        console.log('⚠️ stderr内容:', stderr);
      }
      
      if (code !== 0) {
        console.error('❌ FFprobe命令执行失败，错误代码:', code, '错误信息:', stderr);
        reject(new Error(`FFprobe failed with code ${code}: ${stderr}`));
        return;
      }

      if (!stdout.trim()) {
        console.error('❌ FFprobe没有输出任何内容');
        reject(new Error('FFprobe returned empty output'));
        return;
      }

      console.log('🔍 开始解析JSON数据...');
      try {
        const data = JSON.parse(stdout);
        console.log('✅ JSON解析成功');
        
        // 保存FFprobe原始数据到文件用于调试
        const tempDir = path.join(process.cwd(), 'temp');
        const debugPath = path.join(tempDir, 'ffprobe-debug.json');
        console.log('📁 准备保存调试文件到:', debugPath);
        try {
          // 确保temp目录存在
          if (!fs.existsSync(tempDir)) {
            console.log('📁 temp目录不存在，创建中...');
            fs.mkdirSync(tempDir, { recursive: true });
            console.log('✅ temp目录创建成功:', tempDir);
          } else {
            console.log('📁 temp目录已存在:', tempDir);
          }
          
          console.log('💾 开始写入调试文件...');
          fs.writeFileSync(debugPath, JSON.stringify(data, null, 2));
          console.log('✅ FFprobe原始数据已保存到:', debugPath);
          
          // 验证文件是否真的被创建
          if (fs.existsSync(debugPath)) {
            const fileSize = fs.statSync(debugPath).size;
            console.log('✅ 文件验证成功，大小:', fileSize, 'bytes');
          } else {
            console.error('❌ 文件验证失败，文件不存在');
          }
        } catch (writeError) {
          console.error('❌ 保存调试文件失败:', writeError);
          console.error('❌ 错误详情:', writeError instanceof Error ? writeError.message : String(writeError));
        }
        
        console.log('📊 FFprobe解析成功，streams数量:', data.streams?.length || 0);
        console.log('📋 format信息:', data.format ? '存在' : '不存在');
        
        const format = data.format || {};
        const videoStream = data.streams?.find((s: any) => s.codec_type === 'video') || {};
        const audioStream = data.streams?.find((s: any) => s.codec_type === 'audio') || {};

        console.log('🎯 关键字段检查:');
        console.log('  format.duration:', format.duration, '(类型:', typeof format.duration, ')');
        console.log('  format.bit_rate:', format.bit_rate, '(类型:', typeof format.bit_rate, ')');
        console.log('  videoStream.codec_name:', videoStream.codec_name, '(类型:', typeof videoStream.codec_name, ')');
        console.log('  videoStream.width:', videoStream.width, '(类型:', typeof videoStream.width, ')');
        console.log('  videoStream.height:', videoStream.height, '(类型:', typeof videoStream.height, ')');
        console.log('  videoStream.r_frame_rate:', videoStream.r_frame_rate, '(类型:', typeof videoStream.r_frame_rate, ')');
        console.log('  audioStream.codec_name:', audioStream.codec_name, '(类型:', typeof audioStream.codec_name, ')');
        console.log('  audioStream.channels:', audioStream.channels, '(类型:', typeof audioStream.channels, ')');

        // 格式化时长
        const formatDuration = (seconds: number): string => {
          if (!seconds || isNaN(seconds)) return '未知';
          const hours = Math.floor(seconds / 3600);
          const minutes = Math.floor((seconds % 3600) / 60);
          const secs = Math.floor(seconds % 60);
          if (hours > 0) {
            return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
          } else {
            return `${minutes}:${secs.toString().padStart(2, '0')}`;
          }
        };

        // 格式化码率
        const formatBitrate = (bitrate: number): string => {
          if (!bitrate || isNaN(bitrate)) return '未知';
          const kbps = Math.round(bitrate / 1000);
          if (kbps >= 1000) {
            return `${(kbps / 1000).toFixed(1)} Mbps`;
          } else {
            return `${kbps} kbps`;
          }
        };

        // 计算帧率
        const calculateFrameRate = (rFrameRate: string): string => {
          if (!rFrameRate) return '未知';
          try {
            // r_frame_rate 通常是分数形式，如 "25/1" 或 "30000/1001"
            const parts = rFrameRate.split('/');
            if (parts.length === 2) {
              const numerator = parseFloat(parts[0]);
              const denominator = parseFloat(parts[1]);
              if (!isNaN(numerator) && !isNaN(denominator) && denominator !== 0) {
                const fps = numerator / denominator;
                return `${Math.round(fps)} fps`;
              }
            }
            return '未知';
          } catch (error) {
            console.warn('帧率计算失败:', error);
            return '未知';
          }
        };

        const result = {
          duration: formatDuration(parseFloat(format.duration)),
          resolution: videoStream.width && videoStream.height 
            ? `${videoStream.width}x${videoStream.height}` 
            : '未知',
          codec: videoStream.codec_name || '未知',
          bitrate: formatBitrate(parseInt(format.bit_rate) || parseInt(videoStream.bit_rate)),
          frameRate: calculateFrameRate(videoStream.r_frame_rate),
          audioCodec: audioStream.codec_name || '未知',
          channels: audioStream.channels 
            ? `${audioStream.channels} 声道` 
            : '未知'
        };

        console.log('格式化后的视频信息:', result);
        resolve(result);
      } catch (parseError) {
        console.error('解析FFprobe输出失败:', parseError);
        console.error('原始stdout:', stdout);
        reject(parseError);
      }
    });

    child.on('error', (error) => {
      console.error('FFprobe进程启动失败:', error);
      reject(error);
    });

    // 设置超时
    setTimeout(() => {
      if (!child.killed) {
        console.warn('FFprobe执行超时，终止进程');
        child.kill();
        reject(new Error('FFprobe timeout'));
      }
    }, 15000); // 15秒超时
  });
}

// 重命名规则管理
ipcMain.handle('save-rename-rule', async (_, rule) => {
  try {
    await database.saveRenameRule(rule);
    return { success: true };
  } catch (error) {
    console.error('保存重命名规则失败:', error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
});

ipcMain.handle('get-rename-rules', async () => {
  try {
    return await database.getRenameRules();
  } catch (error) {
    console.error('获取重命名规则失败:', error);
    return [];
  }
});

ipcMain.handle('delete-rename-rule', async (_, ruleId: string) => {
  try {
    await database.deleteRenameRule(ruleId);
    return { success: true };
  } catch (error) {
    console.error('删除重命名规则失败:', error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
});

// 解析文件名
ipcMain.handle('parse-filename', async (_, filePath: string) => {
  try {
    const fileName = path.basename(filePath, path.extname(filePath));
    const ext = path.extname(filePath);
    
    // 简化的文件名解析逻辑
    const parsed = {
      title: await extractTitle(fileName),
      year: extractYear(fileName),
      quality: extractQuality(fileName),
      source: extractSource(fileName),
      codec: extractCodec(fileName),
      language: extractLanguage(fileName),
      group: extractGroup(fileName),
      season: extractSeasonEpisode(fileName)?.season,
      episode: extractSeasonEpisode(fileName)?.episode,
      ext: ext
    };
    
    return parsed;
  } catch (error) {
    console.error('解析文件名失败:', error);
    return null;
  }
});

// 生成重命名预览
ipcMain.handle('generate-rename-preview', async (_, ruleId: string, videoIds: string[]) => {
  try {
    console.log('开始生成重命名预览，规则ID:', ruleId, '视频IDs:', videoIds);
    
    const rules = await database.getRenameRules();
    const rule = rules.find(r => r.id === ruleId);
    if (!rule) {
      throw new Error('重命名规则不存在');
    }

    console.log('找到重命名规则:', rule.name, '模板:', rule.template);
    
    const allVideos = await database.getAllVideos(); // 获取所有视频
    console.log('获取到视频总数:', allVideos.length);
    const results: any[] = [];

    for (const videoId of videoIds) {
      console.log('处理视频ID:', videoId);
      const video = findVideoById(allVideos, videoId);
      if (video) {
        console.log('找到视频:', video.title, '路径:', video.path);
        const parsed = await parseVideoFileName(video.path);
        console.log('解析结果:', parsed);
        const newName = applyTemplate(rule.template, parsed);
        console.log('生成的新文件名:', newName);
        results.push({
          videoId,
          originalPath: video.path,
          originalName: path.basename(video.path),
          newName: newName,
          isValid: validateFileName(newName)
        });
      } else {
        console.log('未找到视频ID:', videoId);
      }
    }

    console.log('预览结果:', results);
    return results;
  } catch (error) {
    console.error('生成重命名预览失败:', error);
    return [];
  }
});

// 执行重命名
ipcMain.handle('execute-rename', async (_, ruleId: string, previewResults: any[], mode: 'virtual' | 'physical') => {
  console.log('=== 执行重命名开始 ===');
  console.log('接收到的参数:');
  console.log('  ruleId:', ruleId);
  console.log('  mode:', mode);
  console.log('  previewResults数量:', previewResults.length);
  console.log('  previewResults:', previewResults);

  try {
    const rule = await database.getRenameRules().then(rules => rules.find(r => r.id === ruleId));
    if (!rule) {
      console.error('重命名规则不存在, ruleId:', ruleId);
      throw new Error('重命名规则不存在');
    }

    console.log('找到的规则:', rule);
    console.log('规则模式:', rule.mode);
    console.log('使用的模式:', mode);

    const results: any[] = [];
    const totalFiles = previewResults.length;
    
    // 🔥 修复：批处理大小改为1，避免并发数据库写入冲突
    const batchSize = 1; // 每批处理1个文件，等同于串行处理
    const batches: any[][] = [];
    
    // 将文件分批
    for (let i = 0; i < previewResults.length; i += batchSize) {
      batches.push(previewResults.slice(i, i + batchSize));
    }
    
    console.log(`📦 串行处理：共 ${totalFiles} 个文件，分为 ${batches.length} 批，每批 ${batchSize} 个文件（避免并发冲突）`);
    
    // 发送开始事件，通知前端显示进度
    mainWindow?.webContents.send('rename-progress', {
      type: 'start',
      total: totalFiles,
      current: 0,
      message: '开始批量重命名...'
    });
    
    let processedCount = 0;
    
    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      const batch = batches[batchIndex];
      console.log(`📦 处理第 ${batchIndex + 1}/${batches.length} 批，包含 ${batch.length} 个文件`);
      
      // 处理当前批次中的文件（现在每批只有1个文件，等同于串行）
      const batchPromises = batch.map(async (preview, index) => {
        const currentIndex = batchIndex * batchSize + index + 1;
        
        console.log(`🚀 [${currentIndex}/${totalFiles}] Promise开始执行: ${path.basename(preview.originalPath)}`);
        
        try {
          // 发送当前文件处理进度
          mainWindow?.webContents.send('rename-progress', {
            type: 'progress',
            total: totalFiles,
            current: processedCount + index + 1,
            message: `正在处理: ${path.basename(preview.originalPath)}`,
            fileName: path.basename(preview.originalPath)
          });
          
          if (mode === 'virtual') {
            // 虚拟重命名：只更新数据库中的显示名称
            console.log(`🎭 [${currentIndex}/${totalFiles}] 虚拟重命名：${path.basename(preview.originalPath)}`);
            
            const displayName = getPathNameWithoutExt(preview.newName);
            // 🔥 修复：虚拟重命名必须使用立即写入，避免批量操作时的数据竞争条件
            await database.updateVideoDisplayName(preview.videoId, displayName, true);
            
            // 记录重命名历史 - 虚拟重命名使用立即写入确保数据一致性
            await database.saveRenameHistory({
              id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
              ruleId: ruleId,
              ruleName: rule.name,
              videoId: preview.videoId,
              originalPath: preview.originalPath,
              newPath: preview.newName,
              mode: 'virtual',
              timestamp: Date.now(),
              canRevert: true
            }, true); // 使用立即写入

            console.log(`✅ [${currentIndex}/${totalFiles}] 虚拟重命名完成，准备返回结果...`);
            const result = {
              videoId: preview.videoId,
              success: true,
              message: '虚拟重命名成功',
              originalPath: preview.originalPath,
              newPath: preview.newName
            };
            console.log(`📤 [${currentIndex}/${totalFiles}] 返回结果:`, result);
            return result;
          } else {
            // 物理重命名：实际重命名文件
            console.log(`💾 [${currentIndex}/${totalFiles}] 物理重命名：${path.basename(preview.originalPath)}`);
            
            const originalPath = preview.originalPath;
            
            // 智能路径处理：检测是否需要移除路径前缀
            let targetDir = path.dirname(originalPath);
            let newPath = path.join(targetDir, preview.newName);
            
            // 检测新文件名是否暗示需要移除路径前缀
            const originalFileName = path.basename(originalPath);
            const newFileName = preview.newName;
            
            // 如果新文件名明显更短且不包含特殊字符，可能是要移除前缀
            const containsWebPrefix = originalFileName.includes('www.') || originalFileName.includes('[') || originalFileName.includes(']');
            const newFileIsSimpler = !newFileName.includes('www.') && !newFileName.includes('[') && !newFileName.includes(']');
            
            if (containsWebPrefix && newFileIsSimpler) {
              // 尝试找到更简洁的目标目录（移除网址前缀后的目录）
              const pathParts = originalPath.split(path.sep);
              let cleanTargetDir = '';
              
              // 寻找不包含网址标识的目录层级
              for (let i = 0; i < pathParts.length - 1; i++) {
                const part = pathParts[i];
                if (!part.includes('www.') && !part.includes('[') && !part.includes(']') && part.trim() !== '') {
                  cleanTargetDir = pathParts.slice(0, i + 1).join(path.sep);
                }
              }
              
              if (cleanTargetDir && cleanTargetDir !== targetDir) {
                // 确保目标目录存在
                if (fs.existsSync(cleanTargetDir)) {
                  targetDir = cleanTargetDir;
                  newPath = path.join(targetDir, preview.newName);
                }
              }
            }
            
            // 检查原文件是否存在
            if (!fs.existsSync(originalPath)) {
              throw new Error(`原文件不存在: ${originalPath}`);
            }
            
            // 检查新文件名是否已存在
            if (fs.existsSync(newPath)) {
              throw new Error(`目标文件已存在: ${preview.newName}`);
            }
            
            // 检查文件权限
            try {
              fs.accessSync(originalPath, fs.constants.R_OK | fs.constants.W_OK);
            } catch (error) {
              throw new Error(`文件权限不足: ${originalPath}`);
            }
            
            // 重命名文件
            try {
              fs.renameSync(originalPath, newPath);
            } catch (error) {
              throw new Error(`文件重命名失败: ${error instanceof Error ? error.message : String(error)}`);
            }
            
            // 验证重命名是否成功
            if (!fs.existsSync(newPath)) {
              throw new Error('重命名操作执行但新文件不存在');
            }
            
            // 更新数据库中的文件路径
            console.log(`💾 [${currentIndex}/${totalFiles}] 更新数据库路径...`);
            
            // 获取更新前的数据
            const beforeVideos = await database.getAllVideos();
            const beforeVideo = findVideoById(beforeVideos, preview.videoId);
            
            // 执行数据库更新 - 🔥 获取新的videoId
            const newVideoId = await database.updateVideoPath(preview.videoId, newPath);
            console.log(`🔄 [${currentIndex}/${totalFiles}] videoId已更新: ${preview.videoId} -> ${newVideoId}`);
            
            // 🔥 修复：物理重命名后，无论是否有NFO都应该更新标题为新文件名
            // 用户重命名就是想要显示新的名字，NFO只用于提供额外信息
            if (beforeVideo) {
              const newFileName = getPathNameWithoutExt(newPath);
              
              if (beforeVideo.title !== newFileName) {
                console.log(`💾 [${currentIndex}/${totalFiles}] 同步更新标题: "${beforeVideo.title}" -> "${newFileName}"`);
                await database.updateVideoDisplayName(newVideoId, newFileName); // 🔥 使用新的videoId
              }
            }
            
            // 🔥 修复剧集路径同步问题：如果重命名的是主视频目录，需要同步更新剧集路径
            console.log(`📺 [${currentIndex}/${totalFiles}] 检查剧集路径同步...`);
            try {
              const allVideos = await database.getAllVideos();
              const mainVideo = findVideoById(allVideos, newVideoId); // 🔥 使用新的videoId
              
              if (mainVideo && mainVideo.isDirectory && mainVideo.episodes && mainVideo.episodes.length > 0) {
                console.log(`📺 [${currentIndex}/${totalFiles}] 发现剧集视频，开始同步 ${mainVideo.episodes.length} 个剧集路径...`);
                let episodeUpdated = false;
                
                for (const episode of mainVideo.episodes) {
                  // 计算剧集的新路径
                  const oldEpisodePath = episode.path;
                  const episodeFileName = path.basename(oldEpisodePath);
                  const newEpisodePath = path.join(mainVideo.path, episodeFileName);
                  
                  if (oldEpisodePath !== newEpisodePath) {
                    episode.path = newEpisodePath;
                    episodeUpdated = true;
                  }
                }
                
                if (episodeUpdated) {
                  console.log(`📺 [${currentIndex}/${totalFiles}] 保存更新后的剧集信息...`);
                  await database.saveVideoInfo(mainVideo);
                  console.log(`✅ [${currentIndex}/${totalFiles}] 剧集路径同步完成`);
                } else {
                  console.log(`ℹ️ [${currentIndex}/${totalFiles}] 剧集路径无需更新`);
                }
              } else {
                console.log(`ℹ️ [${currentIndex}/${totalFiles}] 非剧集视频，跳过剧集路径同步`);
              }
            } catch (episodeError) {
              console.error(`💥 [${currentIndex}/${totalFiles}] 剧集路径同步失败:`, episodeError);
            }
            console.log(`✅ [${currentIndex}/${totalFiles}] 剧集路径同步检查完成`);
            
            // 记录重命名历史
            console.log(`💾 [${currentIndex}/${totalFiles}] 保存重命名历史...`);
            await database.saveRenameHistory({
              id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
              ruleId: ruleId,
              ruleName: rule.name,
              videoId: newVideoId, // 🔥 使用新的videoId
              originalPath: originalPath,
              newPath: newPath,
              mode: 'physical',
              timestamp: Date.now(),
              canRevert: true
            });
            console.log(`✅ [${currentIndex}/${totalFiles}] 重命名历史已保存`);

            console.log(`🎉 [${currentIndex}/${totalFiles}] 物理重命名完全成功，准备返回结果...`);
            const result = {
              videoId: newVideoId, // 🔥 返回新的videoId
              success: true,
              message: '物理重命名成功',
              originalPath: originalPath,
              newPath: newPath
            };
            console.log(`📤 [${currentIndex}/${totalFiles}] 返回结果:`, result);
            return result;
          }
        } catch (error) {
          console.error(`❌ [${currentIndex}/${totalFiles}] 重命名失败:`, error);
          const errorResult = {
            videoId: preview.videoId,
            success: false,
            message: error instanceof Error ? error.message : String(error),
            originalPath: preview.originalPath
          };
          console.log(`📤 [${currentIndex}/${totalFiles}] Promise异常结束，返回错误结果:`, errorResult);
          return errorResult;
        }
      });
    
      // 等待当前批次完成
      console.log(`📦 等待第 ${batchIndex + 1} 批次的 ${batch.length} 个Promise完成...`);
      const batchResults = await Promise.all(batchPromises);
      console.log(`✅ 第 ${batchIndex + 1} 批次完成，获得 ${batchResults.length} 个结果`);
      
      results.push(...batchResults);
      processedCount += batch.length;
      
      console.log(`📊 当前进度: ${processedCount}/${totalFiles}`);
      
      // 发送批次完成进度
      console.log(`📡 发送批次完成进度事件...`);
      mainWindow?.webContents.send('rename-progress', {
        type: 'batch-complete',
        total: totalFiles,
        current: processedCount,
        message: `第 ${batchIndex + 1}/${batches.length} 批处理完成`,
        batchIndex: batchIndex + 1,
        totalBatches: batches.length
      });
      console.log(`✅ 批次完成进度事件已发送`);
      
      // 批次间短暂延迟，给界面响应时间
      if (batchIndex < batches.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    
    // 🔥 关键修复：在返回结果前先强制写入数据，确保前端刷新时能读到最新数据
    console.log('💾 批量操作完成，强制保存所有数据到磁盘...');
    try {
      await database.forceWrite();
      console.log('✅ 所有数据已成功保存到磁盘');
    } catch (writeError) {
      console.error('💥 强制写入失败:', writeError);
    }

    // 发送完成事件
    const successCount = results.filter(r => r.success).length;
    const failureCount = results.filter(r => !r.success).length;
    
    mainWindow?.webContents.send('rename-progress', {
      type: 'complete',
      total: totalFiles,
      current: totalFiles,
      message: `批量重命名完成！成功: ${successCount} 个，失败: ${failureCount} 个`,
      successCount,
      failureCount
    });

    // 🔥 强制通知前端刷新视频列表
    try {
      // 获取视频所属的分类ID（取第一个成功的视频）
      const firstSuccessResult = results.find(r => r.success);
      if (firstSuccessResult) {
        const allVideos = await database.getAllVideos();
        const targetVideo = findVideoById(allVideos, firstSuccessResult.videoId);
        
        if (targetVideo && targetVideo.categoryId) {
          // 发送自动扫描结果事件，触发前端刷新
          mainWindow?.webContents.send('auto-scan-result', {
            categoryId: targetVideo.categoryId,
            action: 'update',
            reason: '批量重命名操作完成'
          });
        }
      }
    } catch (eventError) {
      console.error('💥 发送更新事件失败:', eventError);
    }

    console.log('=== 执行重命名完成 ===');
    console.log('总结:');
    console.log('  成功处理:', results.filter(r => r.success).length);
    console.log('  失败处理:', results.filter(r => !r.success).length);
    console.log('  详细结果:', results);

    // 🔥 最终安全检查：确保数据已经保存到磁盘再返回给前端
    console.log('🔒 最终检查：确保所有数据已保存到磁盘...');
    try {
      await database.forceWrite(); // 再次确保数据已保存
      console.log('✅ 最终检查通过：数据已安全保存');
    } catch (finalWriteError) {
      console.error('💥 最终写入检查失败:', finalWriteError);
    }

    // 🔥 明确日志：准备返回结果
    const finalResult = { success: true, results };
    console.log('🚀 准备返回执行结果给前端:', finalResult);
    console.log('🚀 返回时间:', new Date().toLocaleTimeString());
    console.log('🔒 返回前数据状态：已确保保存到磁盘');
    
    return finalResult;
  } catch (error) {
    console.error('=== 执行重命名失败 ===');
    console.error('错误详情:', error);
    
    // 🔥 错误处理：确保即使出错也尝试保存已处理的数据
    try {
      console.log('💾 出错时强制保存已处理的数据...');
      await database.forceWrite();
      console.log('✅ 已处理数据已保存');
    } catch (writeError) {
      console.error('💥 错误处理中的写入失败:', writeError);
    }
    
    // 发送错误事件
    mainWindow?.webContents.send('rename-progress', {
      type: 'error',
      message: error instanceof Error ? error.message : String(error)
    });
    
    // 🔥 明确日志：准备返回错误结果
    const errorResult = { success: false, error: error instanceof Error ? error.message : String(error) };
    console.log('💥 准备返回错误结果给前端:', errorResult);
    console.log('💥 返回时间:', new Date().toLocaleTimeString());
    
    return errorResult;
  }
});

// 获取重命名历史
ipcMain.handle('get-rename-history', async (_, limit: number = 50) => {
  try {
    return await database.getRenameHistory(limit);
  } catch (error) {
    console.error('获取重命名历史失败:', error);
    return [];
  }
});

// 清空重命名历史
ipcMain.handle('clear-rename-history', async () => {
  try {
    await database.clearRenameHistory();
    return { success: true };
  } catch (error) {
    console.error('清空重命名历史失败:', error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
});

// 回退重命名
ipcMain.handle('revert-rename', async (_, historyId: string) => {
  try {
    const historyList = await database.getRenameHistory(1000);
    const history = historyList.find(h => h.id === historyId);
    
    if (!history) {
      return { success: false, error: '重命名历史记录不存在' };
    }
    
    if (!history.canRevert) {
      return { success: false, error: '此记录不支持回退' };
    }
    
    console.log('执行重命名回退:');
    console.log('  历史记录ID:', historyId);
    console.log('  模式:', history.mode);
    console.log('  原路径:', history.originalPath);
    console.log('  新路径:', history.newPath);
    
    if (history.mode === 'virtual') {
      // 虚拟重命名回退：恢复原始显示名称
      const originalName = getPathNameWithoutExt(history.originalPath);
      await database.updateVideoDisplayName(history.videoId, originalName);
      console.log('  虚拟重命名回退完成');
    } else {
      // 物理重命名回退：恢复原始文件名
      const currentPath = history.newPath;
      const originalPath = history.originalPath;
      
      // 检查当前文件是否存在
      if (!fs.existsSync(currentPath)) {
        return { success: false, error: `当前文件不存在: ${currentPath}` };
      }
      
      // 检查原文件名是否已被占用
      if (fs.existsSync(originalPath)) {
        return { success: false, error: `原文件名已被占用: ${originalPath}` };
      }
      
      // 执行文件回退
      try {
        fs.renameSync(currentPath, originalPath);
        console.log('  物理文件回退成功');
        
        // 更新数据库中的文件路径
        await database.updateVideoPath(history.videoId, originalPath);
        console.log('  数据库路径回退完成');
        
        // 🔥 修复：物理回退后，也要同步更新标题为原始文件名
        // 保持与重命名逻辑的一致性，用户看到的标题应该跟随文件名
        const originalFileName = getPathNameWithoutExt(originalPath);
        await database.updateVideoDisplayName(history.videoId, originalFileName);
        console.log('  数据库标题回退完成');
        
        // 🔥 修复剧集路径同步问题：如果回退的是主视频目录，需要同步更新剧集路径
        try {
          console.log('🔍 检查回退是否需要同步更新剧集路径...');
          const allVideos = await database.getAllVideos();
          const mainVideo = findVideoById(allVideos, history.videoId);
          
          if (mainVideo && mainVideo.isDirectory && mainVideo.episodes && mainVideo.episodes.length > 0) {
            console.log('📺 发现主视频有剧集，需要同步回退剧集路径');
            console.log(`  📁 主视频回退路径: ${mainVideo.path}`);
            console.log(`  📺 剧集数量: ${mainVideo.episodes.length}`);
            
            let episodeUpdated = false;
            
            for (const episode of mainVideo.episodes) {
              // 计算剧集的回退路径
              const currentEpisodePath = episode.path;
              const episodeFileName = path.basename(currentEpisodePath);
              const revertedEpisodePath = path.join(mainVideo.path, episodeFileName);
              
              console.log(`  🔙 剧集路径回退: ${episode.title}`);
              console.log(`    📂 当前路径: ${currentEpisodePath}`);
              console.log(`    📁 回退路径: ${revertedEpisodePath}`);
              
              if (currentEpisodePath !== revertedEpisodePath) {
                episode.path = revertedEpisodePath;
                episodeUpdated = true;
                console.log(`    ✅ 剧集路径已回退`);
              } else {
                console.log(`    ➡️ 剧集路径无需回退`);
              }
            }
            
            if (episodeUpdated) {
              console.log('💾 保存回退后的剧集路径到数据库...');
              await database.saveVideoInfo(mainVideo);
              console.log('✅ 剧集路径同步回退完成！');
            } else {
              console.log('ℹ️ 所有剧集路径都已是正确的，无需回退');
            }
          } else {
            console.log('ℹ️ 当前视频不是包含剧集的主视频，跳过剧集路径同步');
          }
        } catch (episodeError) {
          console.error('💥 剧集路径同步回退失败:', episodeError);
        }
      } catch (error) {
        console.error('  物理文件回退失败:', error);
        return { success: false, error: `文件回退失败: ${error instanceof Error ? error.message : String(error)}` };
      }
    }
    
    // 标记为已回退
    await database.markRenameHistoryReverted(historyId);
    
    // 🔥 强制通知前端刷新视频列表（回退操作）
    try {
      console.log('📡 发送回退操作后的视频列表更新事件...');
      
      // 获取视频所属的分类ID
      const allVideos = await database.getAllVideos();
      const targetVideo = findVideoById(allVideos, history.videoId);
      
      if (targetVideo && targetVideo.categoryId) {
        // 发送自动扫描结果事件，触发前端刷新
        mainWindow?.webContents.send('auto-scan-result', {
          categoryId: targetVideo.categoryId,
          action: 'update',
          reason: '回退操作完成'
        });
        console.log('✅ 已发送回退操作后的视频列表更新事件到前端');
      } else {
        console.warn('⚠️ 无法确定视频分类ID，跳过回退事件发送');
      }
    } catch (eventError) {
      console.error('💥 发送回退更新事件失败:', eventError);
    }
    
    return { success: true, message: '回退成功' };
  } catch (error) {
    console.error('回退重命名失败:', error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
});

// 获取预设模板
ipcMain.handle('get-preset-templates', async () => {
  return [
    {
      name: '电影标准格式',
      template: '{title} ({year}) [{quality}].{ext}',
      description: '示例: 复仇者联盟 (2012) [1080P].mp4',
      applyTo: 'movie'
    },
    {
      name: '剧集标准格式', 
      template: '{title} S{season}E{episode}.{ext}',
      description: '示例: 权力的游戏 S01E01.mkv',
      applyTo: 'tvshow'
    },
    {
      name: '高清收藏格式',
      template: '{title} ({year}) [{quality}] [{codec}].{ext}',
      description: '示例: 阿凡达 (2009) [4K] [x265].mkv',
      applyTo: 'movie'
    },
    {
      name: '制作组标注格式',
      template: '[{group}] {title} ({year}) [{quality}].{ext}',
      description: '示例: [制作组] 电影名 (2023) [1080P].mp4',
      applyTo: 'all'
    },
    {
      name: '简洁格式',
      template: '{title} ({year}).{ext}',
      description: '示例: 电影名 (2023).mp4',
      applyTo: 'all'
    }
  ];
});

// 清理规则缓存
let cleaningRulesCache: any[] | null = null;
let cacheLastUpdated: number = 0;
const CACHE_EXPIRY_TIME = 30000; // 30秒过期

// 获取缓存的清理规则
async function getCachedCleaningRules(): Promise<any[]> {
  const now = Date.now();
  
  // 如果缓存存在且未过期，直接返回
  if (cleaningRulesCache && (now - cacheLastUpdated) < CACHE_EXPIRY_TIME) {
    return cleaningRulesCache;
  }
  
  // 重新加载规则并更新缓存
  console.log('🔄 刷新清理规则缓存...');
  cleaningRulesCache = await database.getEnabledCleaningRules();
  cacheLastUpdated = now;
  
  return cleaningRulesCache;
}

// 手动刷新缓存（在规则变更时调用）
function refreshCleaningRulesCache(): void {
  console.log('🔄 手动刷新清理规则缓存...');
  cleaningRulesCache = null;
  cacheLastUpdated = 0;
}

// 智能路径名解析辅助函数 - 修复目录名中.com被误认为扩展名的问题
function getPathNameWithoutExt(fullPath: string): string {
  const path = require('path');
  
  // 对于目录路径，直接使用 basename，不移除扩展名
  // 因为目录名中的 .com 等不是真正的文件扩展名
  let nameWithoutExt = path.basename(fullPath);
  
  // 如果是文件路径（有真正的视频文件扩展名），才移除扩展名
  const videoExts = ['.mp4', '.mkv', '.avi', '.mov', '.wmv', '.flv', '.webm', '.m4v', '.3gp', '.ts', '.m2ts'];
  const ext = path.extname(fullPath);
  if (videoExts.includes(ext.toLowerCase())) {
    nameWithoutExt = path.basename(fullPath, ext);
  }
  
  return nameWithoutExt;
}

// 智能的文件名解析辅助函数
async function extractTitle(fileName: string): Promise<string> {
  let title = fileName;
  console.log('🔍 原始文件名:', title);
  
  try {
    // 获取缓存的清理规则
    const cleaningRules = await getCachedCleaningRules();
    console.log('📋 应用清理规则数量:', cleaningRules.length);
    
    // 按优先级顺序应用清理规则
    for (const rule of cleaningRules) {
      try {
        const originalTitle = title;
        
        if (rule.type === 'regex') {
          // 正则表达式规则
          const regex = new RegExp(rule.pattern, 'gi');
          title = title.replace(regex, rule.replacement);
        } else {
          // 字符串替换规则
          const regex = new RegExp(rule.pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
          title = title.replace(regex, rule.replacement);
        }
        
        if (originalTitle !== title) {
          console.log(`✨ 规则 "${rule.name}" 生效:`, originalTitle, '->', title);
        }
      } catch (error) {
        console.warn(`⚠️ 清理规则 "${rule.name}" 执行失败:`, error);
      }
    }
    
    // 基础清理：移除多余空格和符号
    title = title.replace(/[_\-\+~=\|\\\/]+/g, ' '); // 分隔符变空格
    title = title.replace(/\s+/g, ' '); // 多空格变单空格
    title = title.trim(); // 去除首尾空格
    
    // 移除开头结尾的垃圾字符
    title = title.replace(/^[\s\-_.【】\[\]()（）]+|[\s\-_.【】\[\]()（）]+$/g, '');
    
    // 最终验证 - 如果结果太短，尝试提取中文部分
    if (title.length < 2) {
      console.log('⚠️ 结果太短，尝试提取中文部分...');
      
      // 从原文件名中找到所有中文片段
      const chineseMatches = fileName.match(/([\u4e00-\u9fff]+)/g);
      if (chineseMatches) {
        // 过滤掉垃圾中文词汇，找到最可能是标题的部分
        const cleanChineseWords = chineseMatches.filter(word => 
          word.length >= 2 && 
          !['高清', '我去', '夏灿芳', '灿芳', '影视', '电影', '资源', '网站', '下载', '发布', '在线', '观看'].includes(word)
        );
        
        if (cleanChineseWords.length > 0) {
          // 选择最长的中文词汇作为标题
          title = cleanChineseWords.reduce((longest, current) => 
            current.length > longest.length ? current : longest
          );
        }
      }
    }
    
    // 最终保险
    if (title.length < 1) {
      console.log('❌ 清理后结果为空，使用备用方案');
      // 直接移除所有括号，保留剩余内容
      title = fileName.replace(/[【\[（\(][^】\]）\)]*[】\]）\)]/g, '').trim();
      // 如果还是为空，使用完整文件名
      if (title.length < 1) {
        title = fileName; // ✅ 使用完整文件名，不再截断
      }
    }
    
    console.log('✨ 最终结果:', title);
    return title;
  } catch (error) {
    console.error('❌ extractTitle 执行失败，使用备用逻辑:', error);
    
    // 备用逻辑：简单的括号移除
    title = fileName.replace(/[【\[（\(][^】\]）\)]*[】\]）\)]/g, '').trim();
    if (title.length < 1) {
      title = fileName; // ✅ 使用完整文件名，不再截断
    }
    
    return title;
  }
}

function extractYear(fileName: string): number | undefined {
  const match = fileName.match(/\b(19|20)\d{2}\b/);
  return match ? parseInt(match[0]) : undefined;
}

function extractQuality(fileName: string): string | undefined {
  // 优先级从高到低匹配清晰度
  const patterns = [
    /\b(8K|4320p)\b/i,
    /\b(4K|UHD|2160p)\b/i,
    /\b(2K|1440p)\b/i,
    /\b(1080p|FHD)\b/i,
    /\b(720p|HD)\b/i,
    /\b(480p|SD)\b/i,
    /\b(360p)\b/i
  ];
  
  for (const pattern of patterns) {
    const match = fileName.match(pattern);
    if (match) {
      const quality = match[1].toUpperCase();
      // 标准化清晰度标识
      if (/8K|4320P/i.test(quality)) return '8K';
      if (/4K|UHD|2160P/i.test(quality)) return '4K';
      if (/2K|1440P/i.test(quality)) return '2K';
      if (/1080P|FHD/i.test(quality)) return '1080P';
      if (/720P|HD/i.test(quality)) return '720P';
      if (/480P|SD/i.test(quality)) return '480P';
      if (/360P/i.test(quality)) return '360P';
      return quality;
    }
  }
  
  return undefined;
}

function extractSource(fileName: string): string | undefined {
  const patterns = [
    /\b(WEB-DL|WEBDL)\b/i,
    /\b(WEBRip|WEB-Rip)\b/i,
    /\b(BluRay|Blu-ray|BDRip|BD)\b/i,
    /\b(DVDRip|DVD)\b/i,
    /\b(HDTV|TV)\b/i,
    /\b(CAM|TS|TC|SCR|R5|DVDSCR)\b/i,
    /\b(Netflix|Amazon|Hulu|Disney)\b/i
  ];
  
  for (const pattern of patterns) {
    const match = fileName.match(pattern);
    if (match) {
      const source = match[1].toUpperCase();
      // 标准化来源标识
      if (/WEB-DL|WEBDL/i.test(source)) return 'WEB-DL';
      if (/WEBRip|WEB-Rip/i.test(source)) return 'WEBRip';
      if (/BluRay|Blu-ray|BD/i.test(source)) return 'BluRay';
      if (/BDRip/i.test(source)) return 'BDRip';
      if (/DVDRip|DVD/i.test(source)) return 'DVDRip';
      if (/HDTV|TV/i.test(source)) return 'HDTV';
      if (/Netflix/i.test(source)) return 'Netflix';
      if (/Amazon/i.test(source)) return 'Amazon';
      return source;
    }
  }
  
  return undefined;
}

function extractCodec(fileName: string): string | undefined {
  const match = fileName.match(/\b(x264|x265|H\.?265|H\.?264)\b/i);
  return match ? match[1].toUpperCase() : undefined;
}

function extractLanguage(fileName: string): string | undefined {
  // 更全面的语言识别
  const patterns = [
    /\b(中英双语|中英|双语|国英双语)\b/i,
    /\b(中文字幕|中字|简体中文|繁体中文|中文)\b/i,
    /\b(英文字幕|英字|英语|English)\b/i,
    /\b(日语|日文|Japanese)\b/i,
    /\b(韩语|韩文|Korean)\b/i,
    /\b(粤语|国语|普通话|Mandarin|Cantonese)\b/i
  ];
  
  for (const pattern of patterns) {
    const match = fileName.match(pattern);
    if (match) {
      const lang = match[1];
      // 标准化语言标识
      if (/中英|双语/i.test(lang)) return '中英双语';
      if (/中文|中字|简体|繁体|国语|普通话/i.test(lang)) return '中文';
      if (/英文|英字|英语|English/i.test(lang)) return '英文';
      if (/日语|日文|Japanese/i.test(lang)) return '日语';
      if (/韩语|韩文|Korean/i.test(lang)) return '韩语';
      if (/粤语|Cantonese/i.test(lang)) return '粤语';
      return lang;
    }
  }
  
  return undefined;
}

function extractGroup(fileName: string): string | undefined {
  const matches = fileName.match(/\[([^\]]+)\]/g);
  if (!matches) return undefined;
  
  // 查找最可能是制作组的方括号内容
  for (const match of matches) {
    const content = match.slice(1, -1); // 移除方括号
    
    // 排除网站信息
    if (/(?:www\.|http|\.com|\.cn|\.net|\.org|发布|下载|字幕|影视|电影|资源|论坛|网站|站点)/i.test(content)) {
      continue;
    }
    
    // 排除技术信息
    if (/(?:1080p|720p|4K|x264|x265|BluRay|WEB|DTS|AC3|压制|重压)/i.test(content)) {
      continue;
    }
    
    // 如果内容合理长度且不包含垃圾信息，认为是制作组
    if (content.length >= 2 && content.length <= 30) {
      return content;
    }
  }
  
  return undefined;
}

function extractSeasonEpisode(fileName: string): {season?: number, episode?: number} | undefined {
  const match = fileName.match(/S(\d{1,2})E(\d{1,3})/i);
  if (match) {
    return {
      season: parseInt(match[1]),
      episode: parseInt(match[2])
    };
  }
  return undefined;
}

function findVideoById(videos: any[], videoId: string): any {
  for (const video of videos) {
    if (video.id === videoId) return video;
    if (video.episodes) {
      for (const episode of video.episodes) {
        if (episode.id === videoId) return episode;
      }
    }
  }
  return null;
}

async function parseVideoFileName(filePath: string): Promise<any> {
  const fullFileName = path.basename(filePath);
  const ext = path.extname(filePath);
  
  // 修复：对于没有真实视频扩展名的文件，使用完整文件名
  const videoExtensions = ['.mp4', '.avi', '.mkv', '.mov', '.wmv', '.flv', '.webm', '.m4v', '.ts', '.mpg', '.mpeg', '.3gp'];
  const hasVideoExt = videoExtensions.some(videoExt => filePath.toLowerCase().endsWith(videoExt));
  
  const fileName = hasVideoExt ? 
    path.basename(filePath, ext) : // 有真实视频扩展名，移除扩展名
    fullFileName;                  // 没有视频扩展名，使用完整文件名
  
  console.log(`🔧 文件解析调试:
    完整路径: ${filePath}
    完整文件名: ${fullFileName}
    检测到的扩展名: ${ext}
    是否为视频扩展名: ${hasVideoExt}
    用于解析的文件名: ${fileName}`);
  
  return {
    title: await extractTitle(fileName),
    year: extractYear(fileName),
    quality: extractQuality(fileName),
    source: extractSource(fileName),
    codec: extractCodec(fileName),
    language: extractLanguage(fileName),
    group: extractGroup(fileName),
    season: extractSeasonEpisode(fileName)?.season,
    episode: extractSeasonEpisode(fileName)?.episode,
    ext: hasVideoExt ? ext.replace('.', '') : ''
  };
}

function applyTemplate(template: string, parsed: any): string {
  let result = template;
  
  const replacements: Record<string, string> = {
    '{title}': parsed.title || 'Unknown',
    '{year}': parsed.year ? parsed.year.toString() : '',
    '{quality}': parsed.quality || '',
    '{source}': parsed.source || '',
    '{codec}': parsed.codec || '',
    '{language}': parsed.language || '',
    '{group}': parsed.group || '',
    '{season}': parsed.season ? parsed.season.toString().padStart(2, '0') : '',
    '{episode}': parsed.episode ? parsed.episode.toString().padStart(2, '0') : '',
    '{ext}': parsed.ext || 'mp4'
  };
  
  for (const [placeholder, value] of Object.entries(replacements)) {
    result = result.replace(new RegExp(placeholder.replace(/[{}]/g, '\\$&'), 'g'), value);
  }
  
  // 清理空的括号和方括号
  result = result.replace(/\(\s*\)/g, '');
  result = result.replace(/\[\s*\]/g, '');
  result = result.replace(/\s+/g, ' ').trim();
  
  return result;
}

function validateFileName(fileName: string): boolean {
  // 检查文件名是否有效（不包含非法字符）
  const invalidChars = /[<>:"/\\|?*]/;
  return !invalidChars.test(fileName) && fileName.length > 0 && fileName.length < 255;
}

// 清理规则管理
ipcMain.handle('get-cleaning-rules', async () => {
  try {
    return await database.getCleaningRules();
  } catch (error) {
    console.error('获取清理规则失败:', error);
    return [];
  }
});

ipcMain.handle('save-cleaning-rule', async (_, rule) => {
  try {
    await database.saveCleaningRule(rule);
    refreshCleaningRulesCache(); // 刷新缓存
    
    // 立即预加载新的规则缓存
    await getCachedCleaningRules();
    console.log('✅ 清理规则保存并缓存更新完成');
    
    return { success: true };
  } catch (error) {
    console.error('保存清理规则失败:', error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
});

ipcMain.handle('delete-cleaning-rule', async (_, ruleId: string) => {
  try {
    await database.deleteCleaningRule(ruleId);
    refreshCleaningRulesCache(); // 刷新缓存
    
    // 立即预加载新的规则缓存
    await getCachedCleaningRules();
    console.log('✅ 清理规则删除并缓存更新完成');
    
    return { success: true };
  } catch (error) {
    console.error('删除清理规则失败:', error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
});

ipcMain.handle('update-cleaning-rule-status', async (_, ruleId: string, enabled: boolean) => {
  try {
    await database.updateCleaningRuleStatus(ruleId, enabled);
    refreshCleaningRulesCache(); // 刷新缓存
    
    // 立即预加载新的规则缓存
    await getCachedCleaningRules();
    console.log('✅ 清理规则状态更新并缓存更新完成');
    
    return { success: true };
  } catch (error) {
    console.error('更新清理规则状态失败:', error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
});

ipcMain.handle('test-cleaning-rule', async (_, rule, testText: string) => {
  try {
    let result = testText;
    
    if (rule.type === 'regex') {
      const regex = new RegExp(rule.pattern, 'gi');
      result = result.replace(regex, rule.replacement);
    } else {
      const regex = new RegExp(rule.pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
      result = result.replace(regex, rule.replacement);
    }
    
    return { success: true, result };
  } catch (error) {
    console.error('测试清理规则失败:', error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
});

ipcMain.handle('preview-cleaning-effect', async (_, testText: string) => {
  try {
    const result = await extractTitle(testText);
    return { success: true, result };
  } catch (error) {
    console.error('预览清理效果失败:', error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
});



// 智能的文件名解析辅助函数