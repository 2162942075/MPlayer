import { FSWatcher, watch } from 'chokidar';
import { database } from './database';
import { videoScanner } from './videoScanner';
import { isVideoFile } from './utils'; // 🔥 导入统一的视频文件检测函数
import * as path from 'path';
import * as fs from 'fs';

interface AutoScanSettings {
  enabled: boolean;
  watchDepth: number;
  debounceTime: number;
  pauseOnUserAction: boolean;
}

interface WatcherInfo {
  watcher: FSWatcher;
  isReady: boolean;
  paths: string[];
}

interface PerformanceInfo {
  watchedPaths: number;
  activeWatchers: number;
  memoryUsage: number;
  lastScanTime: Date | null;
  scanCount: number;
}

class AutoScanManager {
  private settings: AutoScanSettings = {
    enabled: false,
    watchDepth: 2,
    debounceTime: 3000,
    pauseOnUserAction: true
  };

  private watchers: Map<string, WatcherInfo> = new Map();
  private scanTimeouts: Map<string, NodeJS.Timeout> = new Map();
  private isUserActionPaused: boolean = false;
  private userPauseTimeout: NodeJS.Timeout | null = null;
  private performanceInfo: PerformanceInfo = {
    watchedPaths: 0,
    activeWatchers: 0,
    memoryUsage: 0,
    lastScanTime: null,
    scanCount: 0
  };

  constructor() {
    this.loadSettings();
    // 每5分钟更新性能信息
    setInterval(() => this.updatePerformanceInfo(), 5 * 60 * 1000);
  }

  private async loadSettings(): Promise<void> {
    try {
      const settings = await database.getSetting('autoScanSettings');
      if (settings) {
        this.settings = { ...this.settings, ...JSON.parse(settings) };
        if (this.settings.enabled) {
          await this.startWatching();
        }
      }
    } catch (error) {
      console.error('加载自动扫描设置失败:', error);
    }
  }

  private async saveSettings(): Promise<void> {
    try {
      await database.saveSetting('autoScanSettings', JSON.stringify(this.settings));
    } catch (error) {
      console.error('保存自动扫描设置失败:', error);
    }
  }

  private updatePerformanceInfo(): void {
    const process = require('process');
    this.performanceInfo = {
      watchedPaths: Array.from(this.watchers.values()).reduce((sum, info) => sum + info.paths.length, 0),
      activeWatchers: this.watchers.size,
      memoryUsage: Math.round(process.memoryUsage().heapUsed / 1024 / 1024 * 100) / 100, // MB
      lastScanTime: this.performanceInfo.lastScanTime,
      scanCount: this.performanceInfo.scanCount
    };
  }

  async updateSettings(newSettings: Partial<AutoScanSettings>): Promise<void> {
    const oldEnabled = this.settings.enabled;
    this.settings = { ...this.settings, ...newSettings };
    
    await this.saveSettings();

    if (oldEnabled !== this.settings.enabled) {
      if (this.settings.enabled) {
        await this.startWatching();
      } else {
        await this.stopWatching();
      }
    } else if (this.settings.enabled) {
      // 如果设置发生变化，重新开始监听
      await this.stopWatching();
      await this.startWatching();
    }
  }

  async startWatching(): Promise<void> {
    if (!this.settings.enabled) {
      return;
    }

    try {
      const categories = await database.getCategories();
      
      for (const category of categories) {
        await this.startWatchingCategory(category.id, category.path);
      }
      
      console.log(`自动扫描已启动，监听 ${this.watchers.size} 个分类目录`);
    } catch (error) {
      console.error('启动自动扫描失败:', error);
    }
  }

  private async startWatchingCategory(categoryId: string, categoryPath: string): Promise<void> {
    try {
      // 如果已经在监听这个分类，先停止
      await this.stopWatchingCategory(categoryId);

      if (!fs.existsSync(categoryPath)) {
        console.warn(`分类路径不存在，跳过监听: ${categoryPath}`);
        return;
      }

      const watchPaths = this.getWatchPaths(categoryPath, this.settings.watchDepth);
      
      const watcher = watch(watchPaths, {
        ignored: [
          /(^|[\/\\])\../, // 忽略隐藏文件
          /node_modules/,
          /\.tmp$/,
          /\.part$/,
          /\.download$/
        ],
        persistent: true,
        depth: this.settings.watchDepth,
        awaitWriteFinish: {
          stabilityThreshold: 2000,
          pollInterval: 100
        }
      });

      const watcherInfo: WatcherInfo = {
        watcher,
        isReady: false,
        paths: watchPaths
      };

      // 监听器事件处理
      watcher.on('ready', () => {
        watcherInfo.isReady = true;
        console.log(`文件监听器就绪 - 分类: ${categoryId}, 路径: ${categoryPath}`);
      });

      watcher.on('add', (filePath) => {
        if (isVideoFile(filePath)) { // 🔥 使用统一的视频文件检测函数
          console.log(`检测到新视频文件: ${filePath}`);
          this.scheduleRescan(categoryId, '添加文件');
        }
      });

      watcher.on('unlink', (filePath) => {
        if (isVideoFile(filePath)) { // 🔥 使用统一的视频文件检测函数
          console.log(`检测到视频文件删除: ${filePath}`);
          this.scheduleRescan(categoryId, '删除文件');
        }
      });

      watcher.on('change', (filePath) => {
        if (isVideoFile(filePath)) { // 🔥 使用统一的视频文件检测函数
          console.log(`检测到视频文件变化: ${filePath}`);
          this.scheduleRescan(categoryId, '文件变化');
        }
      });

      watcher.on('error', (error) => {
        console.error(`文件监听器错误 - 分类 ${categoryId}:`, error);
      });

      this.watchers.set(categoryId, watcherInfo);
      
    } catch (error) {
      console.error(`启动分类监听失败 - ${categoryId}:`, error);
    }
  }

  private getWatchPaths(basePath: string, depth: number): string[] {
    const paths = [basePath];
    
    if (depth > 1) {
      try {
        this.addSubdirectories(basePath, depth - 1, paths);
      } catch (error) {
        console.warn(`获取子目录失败: ${basePath}`, error);
      }
    }
    
    return paths;
  }

  private addSubdirectories(currentPath: string, remainingDepth: number, paths: string[]): void {
    if (remainingDepth <= 0) {
      return;
    }

    try {
      const entries = fs.readdirSync(currentPath, { withFileTypes: true });
      
      for (const entry of entries) {
        if (entry.isDirectory() && !entry.name.startsWith('.')) {
          const subPath = path.join(currentPath, entry.name);
          paths.push(subPath);
          
          if (remainingDepth > 1) {
            this.addSubdirectories(subPath, remainingDepth - 1, paths);
          }
        }
      }
    } catch (error) {
      // 忽略权限错误等
    }
  }

  // 🔥 移除自定义的isVideoFile方法，使用utils.ts中的统一方法
  // private isVideoFile(filePath: string): boolean {
  //   const videoExtensions = ['.mp4', '.avi', '.mkv', '.mov', '.wmv', '.flv', '.webm', '.m4v', '.mpg', '.mpeg', '.3gp'];
  //   const ext = path.extname(filePath).toLowerCase();
  //   return videoExtensions.includes(ext);
  // }

  private scheduleRescan(categoryId: string, reason: string): void {
    if (!this.settings.enabled) {
      return;
    }

    // 如果用户操作时暂停功能开启，且当前处于暂停状态，则跳过
    if (this.settings.pauseOnUserAction && this.isUserActionPaused) {
      console.log(`跳过扫描 (用户操作暂停) - 分类: ${categoryId}, 原因: ${reason}`);
      return;
    }

    // 清除之前的定时器
    const existingTimeout = this.scanTimeouts.get(categoryId);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
    }

    // 设置新的防抖定时器
    const timeout = setTimeout(async () => {
      await this.performRescan(categoryId, reason);
      this.scanTimeouts.delete(categoryId);
    }, this.settings.debounceTime);

    this.scanTimeouts.set(categoryId, timeout);
    console.log(`已安排扫描 - 分类: ${categoryId}, 原因: ${reason}, 延迟: ${this.settings.debounceTime}ms`);
  }

  private async performRescan(categoryId: string, reason: string): Promise<void> {
    try {
      console.log(`开始智能增量扫描 - 分类: ${categoryId}, 原因: ${reason}`);
      
      // 获取分类信息
      const categories = await database.getCategories();
      const category = categories.find(c => c.id === categoryId);
      if (!category) {
        console.error(`分类不存在: ${categoryId}`);
        return;
      }

      // 获取现有视频数据（保留封面等用户数据）
      const existingVideos = await database.getVideosByCategory(categoryId);
      const existingPaths = new Set(existingVideos.map(v => v.path));
      
      // 执行完整扫描以获取当前实际存在的文件
      const scannedVideos = await videoScanner.scanDirectory(category.path, categoryId, this.settings.watchDepth);
      const scannedPaths = new Set(scannedVideos.map(v => v.path));
      
      console.log(`现有视频: ${existingVideos.length} 个, 扫描发现: ${scannedVideos.length} 个`);

      // 找出需要删除的视频（文件已不存在）
      const videosToDelete = existingVideos.filter(video => !scannedPaths.has(video.path));
      
      // 找出需要添加的视频（新发现的文件）
      const videosToAdd = scannedVideos.filter(video => !existingPaths.has(video.path));
      
      // 保留现有数据的视频（文件仍存在，保留封面等用户设置）
      const videosToKeep = existingVideos.filter(video => scannedPaths.has(video.path));

      console.log(`删除 ${videosToDelete.length} 个, 新增 ${videosToAdd.length} 个, 保留 ${videosToKeep.length} 个`);

      // 只有在真正有变化时才更新数据库
      if (videosToDelete.length > 0 || videosToAdd.length > 0) {
        // 删除不存在的视频
        for (const video of videosToDelete) {
          console.log(`删除不存在的视频: ${video.title}`);
          // 这里需要实现单个视频删除方法，暂时使用清空重建
        }
        
        // 添加新发现的视频
        for (const video of videosToAdd) {
          console.log(`添加新视频: ${video.title}`);
          await database.saveVideoInfo(video);
        }
        
        // 如果有视频被删除，需要重建数据（保留用户数据）
        if (videosToDelete.length > 0) {
          await database.clearVideosForCategory(categoryId);
          // 重新保存保留的视频（包含用户数据）
          for (const video of videosToKeep) {
            await database.saveVideoInfo(video);
          }
          // 保存新增的视频
          for (const video of videosToAdd) {
            await database.saveVideoInfo(video);
          }
        }
        
        console.log(`增量更新完成 - 分类: ${category.name}, 最终视频数: ${videosToKeep.length + videosToAdd.length} 个`);
      } else {
        console.log(`没有检测到视频文件变化 - 分类: ${category.name}`);
      }
      
      // 更新性能信息
      this.performanceInfo.lastScanTime = new Date();
      this.performanceInfo.scanCount++;
      
    } catch (error) {
      console.error(`自动扫描失败 - 分类: ${categoryId}:`, error);
    }
  }

  async stopWatching(): Promise<void> {
    // 清除所有扫描定时器
    for (const timeout of this.scanTimeouts.values()) {
      clearTimeout(timeout);
    }
    this.scanTimeouts.clear();

    // 停止所有监听器
    for (const [categoryId, watcherInfo] of this.watchers) {
      try {
        await watcherInfo.watcher.close();
        console.log(`已停止监听分类: ${categoryId}`);
      } catch (error) {
        console.error(`停止监听失败 - 分类 ${categoryId}:`, error);
      }
    }
    
    this.watchers.clear();
    console.log('自动扫描已停止');
  }

  private async stopWatchingCategory(categoryId: string): Promise<void> {
    const watcherInfo = this.watchers.get(categoryId);
    if (watcherInfo) {
      try {
        await watcherInfo.watcher.close();
        this.watchers.delete(categoryId);
        console.log(`已停止监听分类: ${categoryId}`);
      } catch (error) {
        console.error(`停止分类监听失败 - ${categoryId}:`, error);
      }
    }

    // 清除该分类的扫描定时器
    const timeout = this.scanTimeouts.get(categoryId);
    if (timeout) {
      clearTimeout(timeout);
      this.scanTimeouts.delete(categoryId);
    }
  }

  pauseForUserAction(): void {
    if (!this.settings.pauseOnUserAction) {
      return;
    }

    this.isUserActionPaused = true;
    
    // 清除之前的恢复定时器
    if (this.userPauseTimeout) {
      clearTimeout(this.userPauseTimeout);
    }

    // 2秒后自动恢复
    this.userPauseTimeout = setTimeout(() => {
      this.isUserActionPaused = false;
      console.log('用户操作暂停已自动恢复');
    }, 2000);

    console.log('因用户操作暂停自动扫描，2秒后恢复');
  }

  getWatchingStatus(): any {
    const status: any = {
      enabled: this.settings.enabled,
      activeCategories: this.watchers.size,
      totalWatchedPaths: this.performanceInfo.watchedPaths,
      userActionPaused: this.isUserActionPaused,
      queuedScans: this.scanTimeouts.size
    };

    if (this.settings.enabled) {
      status.categoryDetails = {};
      for (const [categoryId, watcherInfo] of this.watchers) {
        status.categoryDetails[categoryId] = {
          isReady: watcherInfo.isReady,
          pathCount: watcherInfo.paths.length,
          watching: watcherInfo.paths.slice(0, 3) // 只显示前3个路径
        };
      }
    }

    return status;
  }

  getPerformanceInfo(): PerformanceInfo {
    this.updatePerformanceInfo();
    return { ...this.performanceInfo };
  }

  getDebugInfo(): any {
    this.updatePerformanceInfo();
    
    const debugInfo: any = {
      enabled: this.settings.enabled,
      settings: { ...this.settings },
      activeWatchers: this.watchers.size,
      queuedScans: this.scanTimeouts.size,
      queuedCategories: Array.from(this.scanTimeouts.keys()),
      userActionPaused: this.isUserActionPaused,
      performance: this.performanceInfo,
      watcherDetails: {}
    };

    // 详细的监听器信息
    for (const [categoryId, watcherInfo] of this.watchers) {
      debugInfo.watcherDetails[categoryId] = {
        isReady: watcherInfo.isReady,
        pathCount: watcherInfo.paths.length,
        watched: {}
      };
      
      // 显示监听的路径（限制数量避免信息过多）
      watcherInfo.paths.slice(0, 5).forEach((p, index) => {
        debugInfo.watcherDetails[categoryId].watched[`path_${index}`] = p;
      });
    }

    return debugInfo;
  }

  // 获取当前设置
  getSettings(): AutoScanSettings {
    return { ...this.settings };
  }

  // 手动触发重新监听所有分类
  async refreshWatchers(): Promise<void> {
    if (!this.settings.enabled) {
      return;
    }

    await this.stopWatching();
    await this.startWatching();
    console.log('已刷新所有文件监听器');
  }

  // 手动触发指定分类的扫描
  async manualScanCategory(categoryId: string): Promise<void> {
    await this.performRescan(categoryId, '手动触发');
  }

  // 清理资源
  async dispose(): Promise<void> {
    await this.stopWatching();
    
    if (this.userPauseTimeout) {
      clearTimeout(this.userPauseTimeout);
    }
    
    console.log('自动扫描管理器已销毁');
  }
}

// 创建单例实例
export const autoScanManager = new AutoScanManager();

// 应用退出时清理资源
process.on('beforeExit', async () => {
  await autoScanManager.dispose();
}); 