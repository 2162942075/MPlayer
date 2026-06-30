import fs from 'fs';
import path from 'path';
import { app } from 'electron';

interface Category {
  id: string;
  name: string;
  path: string;
  description?: string;
  color: string;
}

interface VideoInfo {
  id: string;
  title: string;
  path: string;
  thumbnail?: string;
  isDirectory: boolean;
  episodes?: VideoInfo[];
  categoryId: string;
  createdAt: number;
  // NFO 相关元数据
  nfoData?: {
    originalTitle?: string;
    year?: number;
    genre?: string[];
    director?: string[];
    actors?: string[];
    plot?: string;
    rating?: number;
    runtime?: number;
    studio?: string;
    tagline?: string;
    country?: string;
    language?: string;
    imdbId?: string;
    tmdbId?: string;
    tvdbId?: string;
    premiered?: string;
    status?: string;
  };
  // 标签系统
  tags?: string[];
  // 用户评分和备注
  userRating?: number;
  userNotes?: string;
  // 观看状态
  watchStatus?: 'unwatched' | 'watching' | 'watched';
  lastWatchedAt?: number;
  watchProgress?: number; // 观看进度百分比
}

interface PlayHistory {
  id: string;
  videoId: string;
  videoTitle: string;
  videoPath: string;
  categoryId: string;
  playedAt: number;
  duration?: number;
  isEpisode?: boolean;
  episodeTitle?: string;
}

interface ThemeConfig {
  id: string;
  name: string;
  type: 'preset' | 'custom';
  colors: {
    primary: string;
    background: string;
    cardBackground: string;
    siderBackground: string;
    headerBackground: string;
    textPrimary: string;
    textSecondary: string;
    siderText: string;
    border: string;
    accent: string;
    menuItemBackground: string;
    menuItemHover: string;
    menuItemActive: string;
  };
  backgroundType?: 'color' | 'gradient';
}

// 标签系统
interface VideoTag {
  id: string;
  name: string;
  color: string;
  category: 'genre' | 'quality' | 'language' | 'studio' | 'custom';
  description?: string;
  createdAt: number;
}

// 重命名规则
interface RenameRule {
  id: string;
  name: string;
  template: string; // 命名模板，如 "{title} ({year}) [{quality}].{ext}"
  enabled: boolean;
  applyTo: 'all' | 'movie' | 'tvshow' | 'episode';
  mode: 'virtual' | 'physical'; // 虚拟重命名或物理重命名
  description?: string;
  createdAt: number;
  examples?: string[]; // 示例结果
}

// 重命名历史记录
interface RenameHistory {
  id: string;
  ruleId: string;
  ruleName: string;
  videoId: string;
  originalPath: string;
  newPath: string;
  mode: 'virtual' | 'physical';
  timestamp: number;
  canRevert: boolean;
  reverted?: boolean; // 是否已回退
  revertedAt?: number; // 回退时间
}

// 解析出的文件信息
interface ParsedFileInfo {
  title?: string;
  year?: number;
  quality?: string;
  source?: string;
  codec?: string;
  language?: string;
  studio?: string;
  group?: string;
  season?: number;
  episode?: number;
  episodeTitle?: string;
}

export interface CleaningRule {
  id: string;
  name: string;
  description?: string;
  pattern: string;        // 正则表达式或字符串模式
  replacement: string;    // 替换内容（通常是空字符串）
  type: 'regex' | 'string';
  enabled: boolean;
  priority: number;       // 执行优先级，数字越小优先级越高
  category: 'brackets' | 'garbage' | 'website' | 'custom';
  createdAt: number;
  updatedAt: number;
}

export interface DatabaseData {
  categories: Category[];
  videos: VideoInfo[];
  tags: VideoTag[];
  settings: Record<string, any>;
  renameRules: RenameRule[];
  renameHistory: RenameHistory[];
  playHistory: PlayHistory[];
  themes: ThemeConfig[];
  activeTheme: string;
  cleaningRules: CleaningRule[];  // 新增清理规则
}

const defaultData: DatabaseData = {
  categories: [],
  videos: [],
  settings: {},
  playHistory: [],
  themes: [],
  activeTheme: 'default',
  tags: [],
  renameRules: [],
  renameHistory: [],
  cleaningRules: []
};

class Database {
  private dbPath: string;
  private data: DatabaseData;
  private writeTimer: NodeJS.Timeout | null = null;
  private pendingWrites: boolean = false;

  constructor() {
    const userDataPath = app.getPath('userData');
    this.dbPath = path.join(userDataPath, 'video-manager.json');
    this.data = defaultData;
  }

  async init() {
    try {
      // 确保用户数据目录存在
      const userDataPath = app.getPath('userData');
      if (!fs.existsSync(userDataPath)) {
        fs.mkdirSync(userDataPath, { recursive: true });
      }

      // 读取现有数据或创建新文件
      if (fs.existsSync(this.dbPath)) {
        const fileContent = fs.readFileSync(this.dbPath, 'utf-8');
        try {
          const parsedData = JSON.parse(fileContent);
          // 确保数据库结构完整
          this.data = {
            categories: parsedData.categories || [],
            videos: parsedData.videos || [],
            settings: parsedData.settings || {},
            playHistory: parsedData.playHistory || [],
            themes: parsedData.themes || [],
            activeTheme: parsedData.activeTheme || 'default',
            tags: parsedData.tags || [],
            renameRules: parsedData.renameRules || [],
            renameHistory: parsedData.renameHistory || [],
            cleaningRules: parsedData.cleaningRules || []
          };
          console.log('数据库加载成功:', this.dbPath);
        } catch (parseError) {
          console.warn('数据文件损坏，使用默认数据:', parseError);
          this.data = defaultData;
          await this.write();
        }
      } else {
        console.log('创建新数据库文件:', this.dbPath);
        await this.write();
      }

      // 初始化默认清理规则
      await this.initDefaultCleaningRules();
    } catch (error) {
      console.error('数据库初始化失败:', error);
      this.data = defaultData;
    }
  }

  private async write(): Promise<void> {
    try {
      const jsonData = JSON.stringify(this.data, null, 2);
      await fs.promises.writeFile(this.dbPath, jsonData, 'utf-8');
    } catch (error) {
      console.error('写入数据失败:', error);
      throw error;
    }
  }
  
  // 延迟写入机制，避免频繁磁盘操作
  private async deferredWrite(): Promise<void> {
    return new Promise((resolve) => {
      this.pendingWrites = true;
      
      // 清除之前的定时器
      if (this.writeTimer) {
        clearTimeout(this.writeTimer);
      }
      
      // 设置新的延迟写入定时器
      this.writeTimer = setTimeout(async () => {
        try {
          await this.write();
          this.pendingWrites = false;
          resolve();
        } catch (error) {
          console.error('延迟写入失败:', error);
          this.pendingWrites = false;
          resolve();
        }
      }, 500); // 500ms延迟
    });
  }
  
  // 🔥 新增：强制立即写入（用于批量操作结束后统一保存）
  async forceWrite(): Promise<void> {
    // 清除延迟写入定时器
    if (this.writeTimer) {
      clearTimeout(this.writeTimer);
      this.writeTimer = null;
    }
    
    // 如果有待写入的数据，立即写入
    if (this.pendingWrites) {
      console.log('🔥 强制写入：检测到待写入数据，立即保存...');
      await this.write();
      this.pendingWrites = false;
      console.log('💾 强制写入完成');
    } else {
      console.log('ℹ️ 强制写入：无待写入数据，跳过保存');
    }
  }

  // 分类管理
  async saveCategory(category: Category): Promise<void> {
    const existingIndex = this.data.categories.findIndex(c => c.id === category.id);
    if (existingIndex >= 0) {
      this.data.categories[existingIndex] = category;
    } else {
      this.data.categories.push(category);
    }
    await this.write();
  }

  async getCategories(): Promise<Category[]> {
    return [...this.data.categories];
  }

  async deleteCategory(categoryId: string): Promise<void> {
    this.data.categories = this.data.categories.filter(c => c.id !== categoryId);
    this.data.videos = this.data.videos.filter(v => v.categoryId !== categoryId);
    await this.write();
  }

  // 🔥 智能合并标签逻辑
  private mergeTagsIntelligently(newTags: string[] | undefined, existingTags: string[] | undefined): string[] {
    // 1. 如果新标签存在且不为空，使用新标签（用户主动设置的情况）
    if (newTags && newTags.length > 0) {
      return newTags;
    }
    
    // 2. 如果新标签为空但现有标签不为空，保留现有标签（扫描器覆盖的情况）
    if (existingTags && existingTags.length > 0) {
      return existingTags;
    }
    
    // 3. 都为空的情况，返回空数组
    return [];
  }

  // 视频管理
  async saveVideoInfo(videoInfo: VideoInfo): Promise<void> {
    const existingIndex = this.data.videos.findIndex(v => v.id === videoInfo.id);
    if (existingIndex >= 0) {
      // 🔥 智能合并：保留用户可能已经修改的字段（如虚拟重命名的标题）
      const existingVideo = this.data.videos[existingIndex];
      
      // 检查该视频是否做过虚拟重命名（且未回退）
      const hasVirtualRename = await this.hasVirtualRename(videoInfo.id);
      
      const mergedVideo = {
        ...videoInfo, // 新扫描的信息
        title: hasVirtualRename ? existingVideo.title : videoInfo.title, // 优先保留虚拟重命名的标题
        tags: this.mergeTagsIntelligently(videoInfo.tags, existingVideo.tags), // 🔥 修复：智能合并标签（用户设置 > 现有标签 > 空数组）
        watchStatus: existingVideo.watchStatus || videoInfo.watchStatus, // 保留观看状态
        userRating: existingVideo.userRating, // 保留用户评分
        userNotes: existingVideo.userNotes, // 保留用户备注
        lastWatchedAt: existingVideo.lastWatchedAt, // 保留观看时间
        watchProgress: existingVideo.watchProgress, // 保留观看进度
        nfoData: existingVideo.nfoData || videoInfo.nfoData, // 🔥 保留NFO数据
        thumbnail: existingVideo.thumbnail || videoInfo.thumbnail, // 🔥 保留封面信息
        
        // 🔥 修复：保护剧集的标签信息
        episodes: videoInfo.episodes ? videoInfo.episodes.map(newEpisode => {
          // 在现有剧集中查找对应的剧集
          const existingEpisode = existingVideo.episodes?.find(e => e.id === newEpisode.id);
          if (existingEpisode) {
            return {
              ...newEpisode,
              tags: this.mergeTagsIntelligently(newEpisode.tags, existingEpisode.tags), // 智能合并剧集标签
              watchStatus: existingEpisode.watchStatus || newEpisode.watchStatus,
              userRating: existingEpisode.userRating,
              userNotes: existingEpisode.userNotes,
              lastWatchedAt: existingEpisode.lastWatchedAt,
              watchProgress: existingEpisode.watchProgress,
              nfoData: existingEpisode.nfoData || newEpisode.nfoData, // 🔥 保留剧集NFO数据
              thumbnail: existingEpisode.thumbnail || newEpisode.thumbnail // 🔥 保留剧集封面信息
            };
          }
          return newEpisode;
        }) : videoInfo.episodes
      };
      
      this.data.videos[existingIndex] = mergedVideo;
    } else {
      this.data.videos.push(videoInfo);
    }
    // 使用延迟写入，减少频繁磁盘操作
    await this.deferredWrite();
  }

  async getVideosByCategory(categoryId: string): Promise<VideoInfo[]> {
    return this.data.videos.filter(v => v.categoryId === categoryId);
  }

  async getAllVideos(): Promise<VideoInfo[]> {
    return [...this.data.videos];
  }

  async clearVideosForCategory(categoryId: string): Promise<void> {
    this.data.videos = this.data.videos.filter(v => v.categoryId !== categoryId);
    await this.write();
  }

  // 删除单个视频记录
  async deleteVideoById(videoId: string): Promise<void> {
    this.data.videos = this.data.videos.filter(v => v.id !== videoId);
    await this.write();
  }

  // 设置管理
  async saveSetting(key: string, value: any): Promise<void> {
    this.data.settings[key] = value;
    await this.write();
  }

  async getSetting(key: string, defaultValue: any = null): Promise<any> {
    return this.data.settings[key] !== undefined ? this.data.settings[key] : defaultValue;
  }

  // 播放历史管理
  async addPlayHistory(history: Omit<PlayHistory, 'id' | 'playedAt'>): Promise<void> {
    const newHistory: PlayHistory = {
      id: Date.now().toString(),
      playedAt: Date.now(),
      ...history
    };

    // 检查是否已存在相同视频的记录，如果是则更新时间
    const existingIndex = this.data.playHistory.findIndex(h => 
      h.videoPath === history.videoPath
    );

    if (existingIndex >= 0) {
      this.data.playHistory[existingIndex] = newHistory;
    } else {
      this.data.playHistory.unshift(newHistory);
    }

    // 只保留最近50条记录
    if (this.data.playHistory.length > 50) {
      this.data.playHistory = this.data.playHistory.slice(0, 50);
    }

    await this.write();
  }

  async getPlayHistory(limit: number = 20): Promise<PlayHistory[]> {
    return this.data.playHistory
      .sort((a, b) => b.playedAt - a.playedAt)
      .slice(0, limit);
  }

  async clearPlayHistory(): Promise<void> {
    this.data.playHistory = [];
    await this.write();
  }

  // 主题管理
  async initThemes(): Promise<void> {
    console.log('开始初始化主题，当前主题数量:', this.data.themes.length);
    
    // 定义所有预设主题
    const presetThemes: ThemeConfig[] = [
        {
          id: 'default',
          name: '经典蓝白',
          type: 'preset',
          backgroundType: 'color',
          colors: {
            primary: '#1890ff',
            background: '#f0f2f5',
            cardBackground: '#ffffff',
            siderBackground: '#ffffff',
            headerBackground: '#ffffff',
            textPrimary: '#262626',
            textSecondary: '#8c8c8c',
            siderText: '#262626',
            border: '#d9d9d9',
            accent: '#52c41a',
            menuItemBackground: 'rgba(24, 144, 255, 0.06)',
            menuItemHover: 'rgba(24, 144, 255, 0.12)',
            menuItemActive: '#1890ff'
          }
        },
        {
          id: 'elegant-purple',
          name: '优雅紫罗兰',
          type: 'preset',
          backgroundType: 'gradient',
          colors: {
            primary: '#722ed1',
            background: 'linear-gradient(135deg, #f6f3ff 0%, #e6d7ff 50%, #d3adf7 100%)',
            cardBackground: 'rgba(255, 255, 255, 0.8)',
            siderBackground: 'rgba(114, 46, 209, 0.95)',
            headerBackground: 'rgba(255, 255, 255, 0.9)',
            textPrimary: '#262626',
            textSecondary: '#722ed1',
            siderText: '#ffffff',
            border: 'rgba(114, 46, 209, 0.2)',
            accent: '#eb2f96',
            menuItemBackground: 'rgba(255, 255, 255, 0.1)',
            menuItemHover: 'rgba(255, 255, 255, 0.2)',
            menuItemActive: '#eb2f96'
          }
        },
        {
          id: 'sakura-pink',
          name: '樱花粉恋',
          type: 'preset',
          backgroundType: 'gradient',
          colors: {
            primary: '#eb2f96',
            background: 'linear-gradient(135deg, #fff0f6 0%, #ffd6e7 30%, #ffadd2 70%, #ff85c0 100%)',
            cardBackground: 'rgba(255, 255, 255, 0.85)',
            siderBackground: 'rgba(235, 47, 150, 0.9)',
            headerBackground: 'rgba(255, 255, 255, 0.9)',
            textPrimary: '#722ed1',
            textSecondary: '#c41d7f',
            siderText: '#ffffff',
            border: 'rgba(235, 47, 150, 0.3)',
            accent: '#722ed1',
            menuItemBackground: 'rgba(255, 255, 255, 0.15)',
            menuItemHover: 'rgba(255, 255, 255, 0.25)',
            menuItemActive: '#722ed1'
          }
        },
        {
          id: 'ocean-blue',
          name: '深海蓝调',
          type: 'preset',
          backgroundType: 'gradient',
          colors: {
            primary: '#1890ff',
            background: 'linear-gradient(135deg, #001529 0%, #002140 30%, #003a8c 70%, #096dd9 100%)',
            cardBackground: 'rgba(255, 255, 255, 0.9)',
            siderBackground: 'rgba(0, 21, 41, 0.95)',
            headerBackground: 'rgba(24, 144, 255, 0.1)',
            textPrimary: '#ffffff',
            textSecondary: '#91d5ff',
            siderText: '#ffffff',
            border: 'rgba(24, 144, 255, 0.3)',
            accent: '#52c41a',
            menuItemBackground: 'rgba(24, 144, 255, 0.1)',
            menuItemHover: 'rgba(24, 144, 255, 0.2)',
            menuItemActive: '#1890ff'
          }
        },
        {
          id: 'forest-green',
          name: '森林绿意',
          type: 'preset',
          backgroundType: 'gradient',
          colors: {
            primary: '#52c41a',
            background: 'linear-gradient(135deg, #f6ffed 0%, #d9f7be 30%, #95de64 70%, #73d13d 100%)',
            cardBackground: 'rgba(255, 255, 255, 0.9)',
            siderBackground: 'rgba(82, 196, 26, 0.9)',
            headerBackground: 'rgba(255, 255, 255, 0.9)',
            textPrimary: '#135200',
            textSecondary: '#389e0d',
            siderText: '#ffffff',
            border: 'rgba(82, 196, 26, 0.3)',
            accent: '#fa541c',
            menuItemBackground: 'rgba(255, 255, 255, 0.15)',
            menuItemHover: 'rgba(255, 255, 255, 0.25)',
            menuItemActive: '#fa541c'
          }
        },
        {
          id: 'sunset-orange',
          name: '夕阳橙韵',
          type: 'preset',
          backgroundType: 'gradient',
          colors: {
            primary: '#fa541c',
            background: 'linear-gradient(135deg, #fff7e6 0%, #ffe7ba 30%, #ffd591 70%, #ff7a45 100%)',
            cardBackground: 'rgba(255, 255, 255, 0.85)',
            siderBackground: 'rgba(250, 84, 28, 0.9)',
            headerBackground: 'rgba(255, 255, 255, 0.9)',
            textPrimary: '#ad2102',
            textSecondary: '#d4380d',
            siderText: '#ffffff',
            border: 'rgba(250, 84, 28, 0.3)',
            accent: '#1890ff',
            menuItemBackground: 'rgba(255, 255, 255, 0.15)',
            menuItemHover: 'rgba(255, 255, 255, 0.25)',
            menuItemActive: '#1890ff'
          }
        },
        {
          id: 'dark-night',
          name: '暗夜精灵',
          type: 'preset',
          backgroundType: 'gradient',
          colors: {
            primary: '#722ed1',
            background: 'linear-gradient(135deg, #000000 0%, #1a1a1a 30%, #2a2a2a 70%, #3a3a3a 100%)',
            cardBackground: 'rgba(255, 255, 255, 0.05)',
            siderBackground: 'rgba(0, 0, 0, 0.9)',
            headerBackground: 'rgba(0, 0, 0, 0.7)',
            textPrimary: '#ffffff',
            textSecondary: '#a0a0a0',
            siderText: '#ffffff',
            border: 'rgba(255, 255, 255, 0.1)',
            accent: '#eb2f96',
            menuItemBackground: 'rgba(114, 46, 209, 0.1)',
            menuItemHover: 'rgba(114, 46, 209, 0.2)',
            menuItemActive: '#722ed1'
          }
        }
      ];

    // 检查并添加缺失的预设主题
    let needsUpdate = false;
    
    for (const presetTheme of presetThemes) {
      const existingTheme = this.data.themes.find(t => t.id === presetTheme.id);
      if (!existingTheme) {
        console.log('添加缺失的预设主题:', presetTheme.name);
        this.data.themes.push(presetTheme);
        needsUpdate = true;
      }
    }

    if (needsUpdate) {
      await this.write();
      console.log('预设主题更新完成，当前主题总数:', this.data.themes.length);
    } else {
      console.log('所有预设主题已存在，无需更新');
    }
  }

  async getThemes(): Promise<ThemeConfig[]> {
    return [...this.data.themes];
  }

  async setActiveTheme(themeId: string): Promise<void> {
    this.data.activeTheme = themeId;
    await this.write();
  }

  async getActiveTheme(): Promise<string> {
    return this.data.activeTheme;
  }

  async saveTheme(theme: ThemeConfig): Promise<void> {
    try {
      console.log('保存主题到数据库:', theme.name, '类型:', theme.type);
      const existingIndex = this.data.themes.findIndex(t => t.id === theme.id);
      if (existingIndex >= 0) {
        console.log('更新现有主题，索引:', existingIndex);
        this.data.themes[existingIndex] = theme;
      } else {
        console.log('添加新主题');
        this.data.themes.push(theme);
      }
      await this.write();
      console.log('主题保存成功');
    } catch (error) {
      console.error('保存主题失败:', error);
      throw error;
    }
  }

  async deleteTheme(themeId: string): Promise<void> {
    if (themeId === 'default') return; // 不能删除默认主题
    this.data.themes = this.data.themes.filter(t => t.id !== themeId);
    if (this.data.activeTheme === themeId) {
      this.data.activeTheme = 'default';
    }
    await this.write();
  }

  // 获取数据文件路径（用于备份等）
  getDataPath(): string {
    return this.dbPath;
  }
  
  // 标签管理
  async saveTag(tag: VideoTag): Promise<void> {
    const existingIndex = this.data.tags.findIndex(t => t.id === tag.id);
    if (existingIndex >= 0) {
      this.data.tags[existingIndex] = tag;
    } else {
      this.data.tags.push(tag);
    }
    await this.write();
  }

  async getTags(): Promise<VideoTag[]> {
    return [...this.data.tags];
  }

  async deleteTag(tagId: string): Promise<void> {
    this.data.tags = this.data.tags.filter(t => t.id !== tagId);
    // 从视频中移除该标签
    this.data.videos.forEach(video => {
      if (video.tags) {
        video.tags = video.tags.filter(t => t !== tagId);
      }
      if (video.episodes) {
        video.episodes.forEach(episode => {
          if (episode.tags) {
            episode.tags = episode.tags.filter(t => t !== tagId);
          }
        });
      }
    });
    await this.write();
  }

  async getVideosByTag(tagId: string): Promise<VideoInfo[]> {
    return this.data.videos.filter(video => 
      video.tags?.includes(tagId) || 
      video.episodes?.some(episode => episode.tags?.includes(tagId))
    );
  }

  // 重命名规则管理
  async saveRenameRule(rule: RenameRule): Promise<void> {
    const existingIndex = this.data.renameRules.findIndex(r => r.id === rule.id);
    if (existingIndex >= 0) {
      this.data.renameRules[existingIndex] = rule;
    } else {
      this.data.renameRules.push(rule);
    }
    await this.write();
  }

  async getRenameRules(): Promise<RenameRule[]> {
    return [...this.data.renameRules];
  }

  async deleteRenameRule(ruleId: string): Promise<void> {
    this.data.renameRules = this.data.renameRules.filter(r => r.id !== ruleId);
    await this.write();
  }

  async getEnabledRenameRules(): Promise<RenameRule[]> {
    return this.data.renameRules.filter(r => r.enabled);
  }

  // 重命名历史记录管理
  async saveRenameHistory(history: RenameHistory, immediate: boolean = false): Promise<void> {
    const existingIndex = this.data.renameHistory.findIndex(h => h.id === history.id);
    if (existingIndex >= 0) {
      this.data.renameHistory[existingIndex] = history;
    } else {
      this.data.renameHistory.push(history);
    }
    
    if (immediate) {
      await this.write(); // 立即写入，确保重要的重命名历史立即保存
    } else {
      await this.deferredWrite(); // 延迟写入
    }
  }

  async getRenameHistory(limit: number = 50): Promise<RenameHistory[]> {
    return this.data.renameHistory
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, limit);
  }

  async clearRenameHistory(): Promise<void> {
    this.data.renameHistory = [];
    await this.deferredWrite();
  }

  async deleteRenameHistory(historyId: string): Promise<void> {
    this.data.renameHistory = this.data.renameHistory.filter(h => h.id !== historyId);
    await this.deferredWrite();
  }

  // 标记重命名历史为已回退
  async markRenameHistoryReverted(historyId: string): Promise<void> {
    const history = this.data.renameHistory.find(h => h.id === historyId);
    if (history) {
      history.reverted = true;
      history.revertedAt = Date.now();
      history.canRevert = false; // 已回退的记录不能再次回退
      await this.write(); // 使用立即写入，确保回退标记立即生效
    }
  }

  // 检查视频是否做过虚拟重命名（且未回退）
  async hasVirtualRename(videoId: string): Promise<boolean> {
    return this.data.renameHistory.some(h => 
      h.videoId === videoId && 
      h.mode === 'virtual' && 
      !h.reverted
    );
  }

  // 更新视频的显示名称（虚拟重命名）
  async updateVideoDisplayName(videoId: string, displayName: string, immediate: boolean = true): Promise<void> {
    console.log('🔧 updateVideoDisplayName 开始执行:');
    console.log('  🆔 videoId:', videoId);
    console.log('  📝 displayName:', displayName);
    console.log('  ⚡ immediate:', immediate);
    
    const updateVideoInList = (videos: VideoInfo[]): boolean => {
      for (const video of videos) {
        if (video.id === videoId) {
          console.log('  ✅ 找到匹配的视频！');
          console.log('    🏷️ 旧标题:', video.title);
          console.log('    🏷️ 新标题:', displayName);
          video.title = displayName;
          console.log('    🔄 标题已更新');
          return true;
        }
        // 检查剧集
        if (video.episodes) {
          for (const episode of video.episodes) {
            if (episode.id === videoId) {
              console.log('  ✅ 找到匹配的剧集！');
              console.log('    🏷️ 旧标题:', episode.title);
              console.log('    🏷️ 新标题:', displayName);
              episode.title = displayName;
              console.log('    🔄 标题已更新');
              return true;
            }
          }
        }
      }
      return false;
    };

    const updated = updateVideoInList(this.data.videos);
    
    if (updated) {
      if (immediate) {
        console.log('  ✅ 视频标题更新成功，立即保存到磁盘...');
        await this.write(); // 立即写入
        console.log('  💾 数据已立即保存到磁盘');
      } else {
        console.log('  ✅ 视频标题更新成功，延迟保存到磁盘...');
        await this.deferredWrite(); // 延迟写入
        console.log('  📝 数据已标记为延迟保存');
      }
    } else {
      console.error('  ❌ 未找到匹配的视频ID:', videoId);
      throw new Error(`未找到ID为 ${videoId} 的视频`);
    }
  }

  // 更新视频文件路径（物理重命名）
  async updateVideoPath(videoId: string, newPath: string): Promise<string> {
    console.log('🔧 updateVideoPath 开始执行:');
    console.log('  🆔 videoId:', videoId);
    console.log('  📁 newPath:', newPath);
    console.log('  📊 当前视频总数:', this.data.videos.length);
    
    // 🔥 关键修复：生成新的视频ID基于新路径
    const path = require('path');
    console.log('  🔍 调试 path.basename 过程:');
    console.log('    📂 输入 newPath:', JSON.stringify(newPath));
    console.log('    📏 newPath 长度:', newPath.length);
    
    // 🔥 修复：对于目录路径，直接使用 basename，不移除扩展名
    // 因为目录名中的 .com 等不是真正的文件扩展名
    let fileNameWithoutExt = path.basename(newPath);
    
    // 如果是文件路径（有真正的视频文件扩展名），才移除扩展名
    const videoExts = ['.mp4', '.mkv', '.avi', '.mov', '.wmv', '.flv', '.webm', '.m4v', '.3gp', '.ts', '.m2ts'];
    const ext = path.extname(newPath);
    if (videoExts.includes(ext.toLowerCase())) {
      fileNameWithoutExt = path.basename(newPath, ext);
      console.log('    📹 检测到视频文件，移除扩展名:', ext);
    } else {
      console.log('    📁 检测到目录路径，保留完整名称');
    }
    
    console.log('    ✂️ 最终文件名:', JSON.stringify(fileNameWithoutExt));
    console.log('    📏 最终文件名长度:', fileNameWithoutExt.length);
    const normalizedPath = newPath.replace(/\\/g, '/');
    
    // 使用相同的ID生成逻辑
    let hash = 0;
    for (let i = 0; i < normalizedPath.length; i++) {
      const char = normalizedPath.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    
    // 先找到视频的分类ID
    let categoryId = '';
    let targetVideo: VideoInfo | null = null;
    let isEpisode = false;
    
    // 在主视频中查找
    for (const video of this.data.videos) {
      if (video.id === videoId) {
        categoryId = video.categoryId;
        targetVideo = video;
        break;
      }
      // 在剧集中查找
      if (video.episodes) {
        for (const episode of video.episodes) {
          if (episode.id === videoId) {
            categoryId = video.categoryId; // 剧集使用主视频的分类ID
            targetVideo = episode;
            isEpisode = true;
            break;
          }
        }
        if (targetVideo) break;
      }
    }
    
    if (!targetVideo) {
      console.error('  ❌ 未找到匹配的视频ID:', videoId);
      console.error('  📋 所有视频IDs:', this.data.videos.map(v => v.id));
      console.error('  📋 所有剧集IDs:', this.data.videos.flatMap(v => v.episodes?.map(e => e.id) || []));
      throw new Error(`未找到ID为 ${videoId} 的视频`);
    }
    
    const newVideoId = `${categoryId}_${fileNameWithoutExt}_${Math.abs(hash)}`;
    
    console.log('  🆔 旧ID:', videoId);
    console.log('  🆔 新ID:', newVideoId);
    console.log('  📏 新ID长度:', newVideoId.length);
    console.log('  📝 文件名:', fileNameWithoutExt);
    console.log('  📏 文件名长度:', fileNameWithoutExt.length);
    console.log('  📺 是否为剧集:', isEpisode);
    
    // 🔥 防止重复：检查新ID是否已存在
    const existingVideoWithNewId = this.data.videos.find(v => 
      v.id === newVideoId || 
      (v.episodes && v.episodes.some(e => e.id === newVideoId))
    );
    
    if (existingVideoWithNewId && existingVideoWithNewId.id !== videoId) {
      console.warn('⚠️ 检测到新ID已存在，删除重复记录...');
      console.warn('  🔍 重复记录ID:', existingVideoWithNewId.id);
      
      // 删除重复的视频记录
      this.data.videos = this.data.videos.filter(v => v.id !== existingVideoWithNewId.id);
      console.log('  🗑️ 已删除重复的主视频记录');
    }
    
    const updateVideoInList = (videos: VideoInfo[]): boolean => {
      for (let i = 0; i < videos.length; i++) {
        const video = videos[i];
        
        if (video.id === videoId) {
          console.log('  ✅ 找到匹配的主视频！');
          console.log('    📂 旧路径:', video.path);
          console.log('    📁 新路径:', newPath);
          video.path = newPath;
          video.id = newVideoId; // 🔥 同时更新ID
          console.log('    🔄 主视频路径和ID已更新');
          return true;
        }
        
        // 检查剧集
        if (video.episodes && video.episodes.length > 0) {
          for (let j = 0; j < video.episodes.length; j++) {
            const episode = video.episodes[j];
            
            if (episode.id === videoId) {
              console.log('      ✅ 找到匹配的剧集！');
              console.log('        📂 旧路径:', episode.path);
              console.log('        📁 新路径:', newPath);
              episode.path = newPath;
              episode.id = newVideoId; // 🔥 同时更新ID
              console.log('        🔄 剧集路径和ID已更新');
              return true;
            }
          }
        }
      }
      return false;
    };

    const updated = updateVideoInList(this.data.videos);
    
    if (updated) {
      // 🔥 重要：同时更新重命名历史记录中的videoId
      let historyUpdated = 0;
      for (const history of this.data.renameHistory) {
        if (history.videoId === videoId) {
          console.log('  🔄 更新重命名历史记录中的videoId:');
          console.log('    📜 旧ID:', videoId);
          console.log('    🆕 新ID:', newVideoId);
          console.log('    📏 新ID长度:', newVideoId.length);
          console.log('    🎯 实际赋值前 newVideoId =', JSON.stringify(newVideoId));
          history.videoId = newVideoId;
          console.log('    ✅ 赋值后 history.videoId =', JSON.stringify(history.videoId));
          historyUpdated++;
        }
      }
      console.log(`  📝 已更新 ${historyUpdated} 条重命名历史记录`);
      
      console.log('  ✅ 视频路径更新成功，立即保存到磁盘...');
      await this.write(); // 使用立即写入，确保数据同步
      console.log('  💾 数据已立即保存到磁盘');
      return newVideoId; // 🔥 返回新的videoId
    } else {
      throw new Error(`未找到ID为 ${videoId} 的视频`);
    }
  }

  // 清理规则管理
  async saveCleaningRule(rule: CleaningRule): Promise<void> {
    const existingIndex = this.data.cleaningRules.findIndex(r => r.id === rule.id);
    if (existingIndex >= 0) {
      // 更新现有规则
      rule.updatedAt = Date.now();
      this.data.cleaningRules[existingIndex] = rule;
    } else {
      // 添加新规则
      rule.createdAt = Date.now();
      rule.updatedAt = Date.now();
      this.data.cleaningRules.push(rule);
    }
    await this.deferredWrite();
  }

  async getCleaningRules(): Promise<CleaningRule[]> {
    return [...this.data.cleaningRules];
  }

  async getEnabledCleaningRules(): Promise<CleaningRule[]> {
    return this.data.cleaningRules
      .filter(rule => rule.enabled)
      .sort((a, b) => a.priority - b.priority); // 按优先级排序
  }

  async deleteCleaningRule(ruleId: string): Promise<void> {
    this.data.cleaningRules = this.data.cleaningRules.filter(rule => rule.id !== ruleId);
    await this.deferredWrite();
  }

  async updateCleaningRuleStatus(ruleId: string, enabled: boolean): Promise<void> {
    const rule = this.data.cleaningRules.find(r => r.id === ruleId);
    if (rule) {
      rule.enabled = enabled;
      rule.updatedAt = Date.now();
      await this.deferredWrite();
    }
  }

  async initDefaultCleaningRules(): Promise<void> {
    // 如果没有清理规则，初始化默认规则
    if (this.data.cleaningRules.length === 0) {
      const defaultRules: CleaningRule[] = [
        {
          id: 'brackets-websites',
          name: '移除括号内的网站信息',
          description: '移除【】[]()等括号内包含网站域名的内容',
          pattern: '[【\\[（\\(][^】\\]）\\)]*(?:www\\.|http|\\.com|\\.cn|\\.net|\\.org|\\.tv|\\.cc|\\.me|\\.io|\\.top|\\.xyz|HD81HD|发布|下载|字幕组|影视网|在线观看)[^】\\]）\\)]*[】\\]）\\)]',
          replacement: '',
          type: 'regex',
          enabled: true,
          priority: 1,
          category: 'brackets',
          createdAt: Date.now(),
          updatedAt: Date.now()
        },
        {
          id: 'website-domains',
          name: '移除网站域名',
          description: '移除常见的网站域名',
          pattern: '(?:www\\.)?[a-zA-Z0-9]+\\.(?:com|cn|net|org|tv|cc|me|io|top|xyz)(?:[^\\w\\u4e00-\\u9fff]|$)',
          replacement: '',
          type: 'regex',
          enabled: true,
          priority: 2,
          category: 'website',
          createdAt: Date.now(),
          updatedAt: Date.now()
        },
        {
          id: 'garbage-keywords',
          name: '移除垃圾关键词',
          description: '移除常见的垃圾宣传词汇',
          pattern: '\\b(?:发布|下载|字幕组|影视网|电影网|资源网|论坛|网站|站点|更新|最新|热门|推荐|精选|首发|抢先|限时|免费|在线观看|在线播放|bt|magnet|torrent|种子|磁力|链接|迅雷|电驴|网盘|云盘)\\b',
          replacement: '',
          type: 'regex',
          enabled: true,
          priority: 3,
          category: 'garbage',
          createdAt: Date.now(),
          updatedAt: Date.now()
        },
        {
          id: 'hd81hd-specific',
          name: 'HD81HD特定清理',
          description: '专门清理HD81HD网站的垃圾信息',
          pattern: '(?:高清.*?我去.*?夏灿芳.*?www\\.HD81HD\\.com|高清.*?我去.*?夏灿芳|我去.*?夏灿芳|夏灿芳|灿芳|我去)',
          replacement: '',
          type: 'regex',
          enabled: true,
          priority: 0,
          category: 'website',
          createdAt: Date.now(),
          updatedAt: Date.now()
        }
      ];

      for (const rule of defaultRules) {
        await this.saveCleaningRule(rule);
      }
    }
  }
}

export const database = new Database(); 
export { VideoInfo, Category, PlayHistory, ThemeConfig, VideoTag, RenameRule, RenameHistory, ParsedFileInfo }; 