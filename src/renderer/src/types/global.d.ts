interface VideoTag {
  id: string;
  name: string;
  color: string;
  category: 'genre' | 'quality' | 'language' | 'studio' | 'custom';
  description?: string;
  createdAt: number;
}

interface RenameRule {
  id: string;
  name: string;
  template: string;
  enabled: boolean;
  applyTo: 'all' | 'movie' | 'tvshow' | 'episode';
  mode: 'virtual' | 'physical';
  description?: string;
  createdAt: number;
  examples?: string[];
}

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
  reverted?: boolean;
  revertedAt?: number;
}

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
  ext?: string;
}

interface RenamePreviewResult {
  videoId: string;
  originalPath: string;
  originalName: string;
  newName: string;
  isValid: boolean;
}

interface NFOData {
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
}

interface ElectronAPI {
  selectDirectory: () => Promise<string | null>;
  selectFile: (options: { title: string; filters: any[] }) => Promise<string | null>;
  scanVideos: (directory: string) => Promise<any[]>;
  generateThumbnail: (videoPath: string) => Promise<string>;
  openWithPlayer: (videoPath: string, playerPath: string) => Promise<void>;
  saveCategory: (category: any) => Promise<void>;
  getCategories: () => Promise<any[]>;
  saveVideoInfo: (videoInfo: any) => Promise<void>;
  getVideosByCategory: (categoryId: string) => Promise<any[]>;
  getAllVideos: () => Promise<any[]>;
  checkFileExists: (filePath: string) => Promise<boolean>;
  hasVirtualRename: (videoId: string) => Promise<boolean>;
  
  // 标签管理
  saveTag: (tag: VideoTag) => Promise<{ success: boolean; error?: string }>;
  getTags: () => Promise<VideoTag[]>;
  deleteTag: (tagId: string) => Promise<{ success: boolean; error?: string }>;
  getVideosByTag: (tagId: string) => Promise<any[]>;
  
  // 重命名规则管理
  saveRenameRule: (rule: RenameRule) => Promise<{ success: boolean; error?: string }>;
  getRenameRules: () => Promise<RenameRule[]>;
  deleteRenameRule: (ruleId: string) => Promise<{ success: boolean; error?: string }>;
  parseFileName: (filePath: string) => Promise<ParsedFileInfo | null>;
  generateRenamePreview: (ruleId: string, videoIds: string[]) => Promise<RenamePreviewResult[]>;
  executeRename: (ruleId: string, previewResults: any[], mode: 'virtual' | 'physical') => Promise<any>;
  getRenameHistory: (limit?: number) => Promise<RenameHistory[]>;
  clearRenameHistory: () => Promise<void>;
  revertRename: (historyId: string) => Promise<any>;
  getPresetTemplates: () => Promise<any[]>;
  testFilenameCleanup: (fileName: string) => Promise<any>;
  
  // NFO文件管理
  parseNFO: (videoPath: string) => Promise<NFOData | null>;
  writeNFO: (nfoPath: string, nfoData: NFOData, type?: 'movie' | 'tvshow') => Promise<boolean>;
  createNFOPath: (videoPath: string) => Promise<string | null>;
  hasNFOFile: (videoPath: string) => Promise<boolean>;
  
  // 事件监听
  onScanProgress: (callback: (progress: { current: number; total: number; currentPath: string; percentage: number }) => void) => () => void;
  onAutoScanResult: (callback: (result: { categoryId: string; action: string; data: any }) => void) => () => void;
  
  // 🔥 新增：重命名进度监听
  onRenameProgress: (callback: (progressData: any) => void) => () => void;
  removeRenameProgressListener: (callback: any) => void;
}

interface Window {
  electronAPI: ElectronAPI;
} 