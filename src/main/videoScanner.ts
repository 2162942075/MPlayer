import * as fs from 'fs';
import * as path from 'path';
import { isVideoFile, logger } from './utils';
import { database } from './database';
import { NFOParser, NFOData } from './nfoParser';

// 扫描进度回调类型
export type ScanProgressCallback = (current: number, total: number, currentPath: string) => void;

interface VideoInfo {
  id: string;
  title: string;
  path: string;
  thumbnail?: string;
  isDirectory: boolean;
  episodes?: VideoInfo[];
  categoryId: string;
  createdAt: number;
  parentDir?: string; // 添加父目录信息用于搜索
  nfoData?: NFOData;
  tags?: string[];
  watchStatus?: 'unwatched' | 'watching' | 'watched';
}

export class VideoScanner {
  private scanProgressCallback?: ScanProgressCallback;
  private scannedCount = 0;
  private totalEstimate = 0;
  
  setProgressCallback(callback?: ScanProgressCallback) {
    this.scanProgressCallback = callback;
  }
  
  async scanDirectory(dirPath: string, categoryId: string, maxDepth: number = 6): Promise<VideoInfo[]> {
    try {
      // 检查目录存在性（使用异步方式）
      try {
        await fs.promises.access(dirPath);
      } catch {
        logger.warn('目录不存在', dirPath);
        return [];
      }

      logger.scan(`开始扫描目录 ${dirPath}, 最大深度 ${maxDepth}`);
      
      // 重置计数
      this.scannedCount = 0;
      this.totalEstimate = await this.estimateDirectoryCount(dirPath, maxDepth);
      
      // 报告开始扫描
      this.reportProgress(dirPath);
      
      const results: VideoInfo[] = [];
      await this.scanRecursive(dirPath, categoryId, results, 0, maxDepth);
      logger.scan(`扫描完成，共找到 ${results.length} 个视频项目`);
      
      // 扫描完成，发送完成信号清理进度条
      if (this.scanProgressCallback) {
        this.scanProgressCallback(this.totalEstimate, this.totalEstimate, '扫描完成');
        // 延迟清理进度条显示
        setTimeout(() => {
          if (this.scanProgressCallback) {
            this.scanProgressCallback(0, 0, '');
          }
        }, 1000);
      }
      
      return results;
    } catch (error) {
      logger.error('扫描目录失败:', error);
      
      // 扫描失败也要清理进度条
      if (this.scanProgressCallback) {
        this.scanProgressCallback(0, 0, '扫描失败');
        setTimeout(() => {
          if (this.scanProgressCallback) {
            this.scanProgressCallback(0, 0, '');
          }
        }, 2000);
      }
      
      return [];
    }
  }

  private async estimateDirectoryCount(dirPath: string, maxDepth: number): Promise<number> {
    let count = 0;
    try {
      const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
      
      // 智能估算：优先考虑有视频的目录
      const dirs = entries.filter(entry => entry.isDirectory());
      const files = entries.filter(entry => entry.isFile());
      const videoFiles = files.filter(file => isVideoFile(file.name));
      
      // 当前层级的文件数（只计算视频文件相关）
      count += videoFiles.length;
      
      // 智能估算子目录：基于目录名和结构特征
      if (maxDepth > 0 && dirs.length > 0) {
        let relevantDirs = 0;
        
        for (const dir of dirs) {
          // 只跳过非常明确的系统目录
          const dirName = dir.name.toLowerCase();
          if (dirName === 'system32' || 
              dirName === 'windows' || 
              dirName === 'program files' ||
              dirName === 'program files (x86)' ||
              dirName.startsWith('$recycle')) {
            continue;
          }
          relevantDirs++;
        }
        
        // 保守估算：每个相关子目录平均3个条目
        count += relevantDirs * 3;
      }
    } catch {
      // 估算失败，返回默认值
      count = 20;
    }
    return Math.min(count, 1000); // 大幅降低最大估算值
  }
  
  private reportProgress(currentPath: string) {
    this.scannedCount++;
    if (this.scanProgressCallback) {
      this.scanProgressCallback(this.scannedCount, this.totalEstimate, currentPath);
    }
  }

  private async scanRecursive(
    dirPath: string, 
    categoryId: string, 
    results: VideoInfo[], 
    currentDepth: number, 
    maxDepth: number
  ): Promise<void> {
    if (currentDepth > maxDepth) return;

    try {
      logger.scan(`扫描目录 [深度${currentDepth}]: ${dirPath}`);
      
      // 报告进度
      this.reportProgress(dirPath);
      
      // 只对极端情况进行限制，保持文件完整性
      if (dirPath.length > 300) {
        logger.warn(`跳过路径过长的目录 ${dirPath.substring(0, 100)}...`);
        return;
      }

      // 使用超时保护的异步读取目录，但保持较长的超时时间
      const timeout = new Promise<never>((_, reject) => 
        setTimeout(() => reject(new Error('目录读取超时')), 20000) // 20秒超时，给复杂目录足够时间
      );
      
      const readDirPromise = fs.promises.readdir(dirPath, { withFileTypes: true });
      let entries: fs.Dirent[];
      
      try {
        entries = await Promise.race([readDirPromise, timeout]);
      } catch (error) {
        logger.warn(`跳过有问题的目录: ${dirPath} - ${error instanceof Error ? error.message : String(error)}`);
        return;
      }
      
      // 只跳过明显异常的大目录，保留大部分正常目录
      if (entries.length > 2000) {
        logger.warn(`跳过包含过多文件的目录 ${dirPath} (${entries.length}个条目)`);
        return;
      }
      
      // 添加小延迟，避免阻塞主线程
      if (entries.length > 50) {
        await new Promise(resolve => setImmediate(resolve));
      }
      
      // 收集当前目录的视频文件
      const videoFiles: string[] = [];
      const subdirs: string[] = [];

      // 先快速收集所有文件和目录
      const files: string[] = [];
      const dirs: string[] = [];

      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        
        if (entry.isDirectory()) {
          // 保守过滤：只跳过非常明确的系统目录
          const dirName = entry.name.toLowerCase();
          if (dirName === 'system32' || 
              dirName === 'windows' || 
              dirName === 'program files' ||
              dirName === 'program files (x86)' ||
              dirName.startsWith('$recycle') ||
              dirName === 'pagefile.sys' ||
              dirName === 'hiberfil.sys') {
            console.log(`  跳过系统目录: ${entry.name}`);
            continue;
          }
          dirs.push(fullPath);
        } else if (entry.isFile() && isVideoFile(entry.name)) {
          files.push(fullPath);
          console.log(`  发现视频文件: ${entry.name}`);
        }
      }

      // 批量处理视频文件
      videoFiles.push(...files);

      // 智能检查目录：小批量并行处理，保持完整性
      const batchSize = 3; // 小批量并行，平衡性能和稳定性
      for (let i = 0; i < dirs.length; i += batchSize) {
        const batch = dirs.slice(i, i + batchSize);
        
        // 并行检查这一小批目录
        const checkPromises = batch.map(async (checkDir) => {
          try {
            // 单个目录超时保护，但给足够时间
            const timeout = new Promise<boolean>((_, reject) => 
              setTimeout(() => reject(new Error('hasVideoFiles超时')), 10000) // 10秒超时
            );
            
            const checkPromise = this.hasVideoFiles(checkDir);
            const hasVideos = await Promise.race([checkPromise, timeout]);
            
            if (hasVideos) {
              console.log(`  发现包含视频的子目录: ${path.basename(checkDir)}`);
              return checkDir;
            }
            return null;
          } catch (error) {
            console.warn(`  跳过检查失败的目录: ${path.basename(checkDir)} - ${error instanceof Error ? error.message : String(error)}`);
            return null;
          }
        });

        const results = await Promise.all(checkPromises);
        
        // 收集有视频的目录
        for (const result of results) {
          if (result) {
            subdirs.push(result);
          }
        }

        // 进度报告
        this.reportProgress(`检查子目录 ${Math.min(i + batchSize, dirs.length)}/${dirs.length}: ${dirPath}`);
        
        // 适当的异步断行
        if (i > 0) {
          await new Promise(resolve => setImmediate(resolve));
        }
      }

      // 处理当前目录的视频文件
      if (videoFiles.length > 0) {
        const dirName = path.basename(dirPath);
        
        // 关键逻辑：如果当前目录是分类根目录（currentDepth === 0）
        // 且该目录下同时有视频文件和子文件夹，则视频文件单独添加，子文件夹单独处理
        if (currentDepth === 0 && subdirs.length > 0) {
          // 分类根目录下的直接视频文件，作为独立视频
          console.log(`  分类根目录包含${videoFiles.length}个直接视频文件，单独添加`);
          for (const filePath of videoFiles) {
            const fileName = path.basename(filePath, path.extname(filePath));
            const parentDirName = path.basename(path.dirname(filePath));
            console.log(`    添加独立视频: ${fileName}`);
            
            // 修复：解析独立视频文件的NFO
            const nfoData = await this.parseNFOForVideo(filePath);
            
            results.push({
              id: this.generateStableId(filePath, categoryId),
              title: fileName,
              path: filePath,
              isDirectory: false,
              categoryId,
              createdAt: Date.now(),
              parentDir: parentDirName,
              // 修复：添加NFO数据和标签
              nfoData,
              tags: [], // 直接从NFO中提取
              watchStatus: 'unwatched' as const
            });
          }
        } else if (currentDepth === 0 && subdirs.length === 0) {
          // 分类根目录下只有视频文件，没有子文件夹
          if (videoFiles.length > 1) {
            // 多个视频文件，作为剧集处理
            console.log(`  分类根目录包含${videoFiles.length}个视频文件，作为剧集处理`);
            
            const sortedVideoFiles = this.sortVideoFiles(videoFiles);
            
            // 修复：解析剧集目录的NFO文件
            const seriesNfoData = await this.parseNFOForVideo(dirPath);
            console.log(`解析分类根目录剧集NFO: ${dirPath}`, seriesNfoData);
            
            const episodes = sortedVideoFiles.map((filePath, index) => ({
              id: this.generateStableId(filePath, categoryId),
              title: path.basename(filePath, path.extname(filePath)),
              path: filePath,
              isDirectory: false,
              categoryId,
              createdAt: Date.now(),
              parentDir: path.basename(path.dirname(filePath)),
              // 初始化为空标签，让用户自己添加
              tags: [],
              watchStatus: 'unwatched' as const
            }));

            results.push({
              id: this.generateStableId(dirPath, categoryId),
              title: dirName,
              path: dirPath,
              isDirectory: true,
              episodes,
              categoryId,
              createdAt: Date.now(),
              parentDir: path.basename(path.dirname(dirPath)),
              // 修复：添加剧集级别的NFO数据
              nfoData: seriesNfoData,
              tags: [], // 初始化为空标签，让用户自己添加
              watchStatus: 'unwatched' as const
            });
          } else {
            // 单个视频文件，作为独立视频
            const filePath = videoFiles[0];
            const fileName = path.basename(filePath, path.extname(filePath));
            
            // 修复：解析独立视频文件的NFO
            const nfoData = await this.parseNFOForVideo(filePath);
            
            results.push({
              id: this.generateStableId(filePath, categoryId),
              title: fileName,
              path: filePath,
              isDirectory: false,
              categoryId,
              createdAt: Date.now(),
              parentDir: path.basename(path.dirname(filePath)),
              // 修复：添加NFO数据和标签
              nfoData,
              tags: [], // 直接从NFO中提取
              watchStatus: 'unwatched' as const
            });
          }
        } else {
          // 子目录中的视频文件，统一作为剧集处理
          console.log(`  子目录${dirName} 包含${videoFiles.length}个视频文件，作为剧集处理`);
          
          if (videoFiles.length > 1) {
            // 多个视频文件，作为剧集
            const sortedVideoFiles = this.sortVideoFiles(videoFiles);
            
            // 修复：解析剧集目录的NFO文件（tvshow.nfo）
            const seriesNfoData = await this.parseNFOForVideo(dirPath);
            console.log(`解析剧集目录NFO: ${dirPath}`, seriesNfoData);
            
            const episodes = sortedVideoFiles.map((filePath, index) => {
              // 对于剧集中的每一集，可以使用剧集级别的NFO数据作为默认值
              return {
                id: this.generateStableId(filePath, categoryId),
                title: path.basename(filePath, path.extname(filePath)),
                path: filePath,
                isDirectory: false,
                categoryId,
                createdAt: Date.now(),
                parentDir: path.basename(path.dirname(filePath)),
                // 初始化为空标签，让用户自己添加
                tags: [],
                watchStatus: 'unwatched' as const
              };
            });

            results.push({
              id: this.generateStableId(dirPath, categoryId),
              title: dirName,
              path: dirPath,
              isDirectory: true,
              episodes,
              categoryId,
              createdAt: Date.now(),
              parentDir: path.basename(path.dirname(dirPath)),
              // 修复：添加剧集级别的NFO数据
              nfoData: seriesNfoData,
              tags: [], // 初始化为空标签，让用户自己添加
              watchStatus: 'unwatched' as const,
            });
          } else {
            // 单个视频文件，也作为剧集（保持一致性）
            const filePath = videoFiles[0];
            const fileName = path.basename(filePath, path.extname(filePath));
            
            // 尝试解析NFO文件
            const nfoData = await this.parseNFOForVideo(filePath);
            
            const episodes = [{
              id: this.generateStableId(filePath, categoryId),
              title: fileName,
              path: filePath,
              isDirectory: false,
              categoryId,
              createdAt: Date.now(),
              parentDir: path.basename(path.dirname(filePath)),
              nfoData,
              // 从NFO中提取标签
              tags: [], // 直接从NFO中提取
              // 设置默认观看状态
              watchStatus: 'unwatched' as const
            }];

            results.push({
              id: this.generateStableId(dirPath, categoryId),
              title: dirName,
              path: dirPath,
              isDirectory: true,
              episodes,
              categoryId,
              createdAt: Date.now(),
              parentDir: path.basename(path.dirname(dirPath)),
              nfoData,
              tags: [], // 直接从NFO中提取
              watchStatus: 'unwatched' as const
            });
          }
        }
      }

      // 递归扫描子目录
      for (const subdir of subdirs) {
        await this.scanRecursive(subdir, categoryId, results, currentDepth + 1, maxDepth);
      }

    } catch (error) {
      console.error(`扫描目录失败 [深度${currentDepth}]: ${dirPath}`, error instanceof Error ? error.message : String(error));
    }
  }

  private async hasVideoFiles(dirPath: string, depth: number = 0, maxDepth: number = 3): Promise<boolean> {
    try {
      if (depth > maxDepth) return false;
      
      // 保守路径过滤：只过滤非常明确的系统目录
      const dirName = path.basename(dirPath).toLowerCase();
      if (dirName === 'system32' || 
          dirName === 'windows' || 
          dirName === 'program files' ||
          dirName === 'program files (x86)' ||
          dirName.startsWith('$recycle')) {
        return false;
      }
      
      // 路径长度限制
      if (dirPath.length > 250) {
        return false;
      }
      
      // 缩短超时时间，提高效率
      const timeout = new Promise<never>((_, reject) => 
        setTimeout(() => reject(new Error('hasVideoFiles读取超时')), 5000) // 5秒超时
      );
      
      const readDirPromise = fs.promises.readdir(dirPath, { withFileTypes: true });
      let entries: fs.Dirent[];
      
      try {
        entries = await Promise.race([readDirPromise, timeout]);
      } catch {
        return false; // 超时或错误直接返回false
      }
      
      // 限制检查的条目数量，提高效率
      if (entries.length > 200) {
        entries = entries.slice(0, 200); // 只检查前200个条目
      }
      
      // 首先快速检查当前目录是否有视频文件
      for (const entry of entries) {
        if (entry.isFile() && isVideoFile(entry.name)) {
          return true;
        }
      }
      
      // 如果当前目录没有视频文件，保守检查子目录
      const subDirs = entries
        .filter(entry => entry.isDirectory())
        .filter(entry => {
          const subDirName = entry.name.toLowerCase();
          // 只过滤非常明确的系统目录
          return subDirName !== 'system32' && 
                 subDirName !== 'windows' && 
                 subDirName !== 'program files' &&
                 subDirName !== 'program files (x86)' &&
                 !subDirName.startsWith('$recycle');
        })
        .slice(0, 15); // 恢复15个子目录
      
      for (let i = 0; i < subDirs.length; i++) {
        const entry = subDirs[i];
        const fullPath = path.join(dirPath, entry.name);
        
        try {
          const hasVideosInSubdir = await this.hasVideoFiles(fullPath, depth + 1, maxDepth);
          if (hasVideosInSubdir) {
            return true;
          }
        } catch {
          continue;
        }
        
        // 每个子目录检查后让出控制行
        if (i % 2 === 0 && i > 0) {
          await new Promise(resolve => setImmediate(resolve));
        }
      }
      
      return false;
    } catch (error) {
      return false; // 简化错误处理，直接返回false
    }
  }

  // 生成稳定的视频ID，基于文件路径而不是时间戳
  private generateStableId(filePath: string, categoryId: string): string {
    // 使用文件路径的相对路径部分来生成稳定的ID
    const normalizedPath = filePath.replace(/\\/g, '/');
    
    // 🔥 修复：使用与database.ts中一致的路径处理逻辑
    let fileNameWithoutExt = path.basename(filePath);
    
    // 如果是文件路径（有真正的视频文件扩展名），才移除扩展名
    const videoExts = ['.mp4', '.mkv', '.avi', '.mov', '.wmv', '.flv', '.webm', '.m4v', '.3gp', '.ts', '.m2ts'];
    const ext = path.extname(filePath);
    if (videoExts.includes(ext.toLowerCase())) {
      fileNameWithoutExt = path.basename(filePath, ext);
    }
    
    // 创建一个基于路径的简单哈希
    let hash = 0;
    const str = normalizedPath;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // 转换为32位整数
    }
    
    return `${categoryId}_${fileNameWithoutExt}_${Math.abs(hash)}`;
  }

  // 智能排序视频文件，考虑文件名中的数字
  private sortVideoFiles(videoFiles: string[]): string[] {
    return videoFiles.sort((a, b) => {
      const nameA = path.basename(a, path.extname(a));
      const nameB = path.basename(b, path.extname(b));
      
      // 使用自然排序，正确处理文件名中的数字
      return this.naturalSort(nameA, nameB);
    });
  }

  // 自然排序算法，正确处理数字
  private naturalSort(a: string, b: string): number {
    // 将字符串分割为文本和数字部分
    const splitA = a.split(/(\d+)/);
    const splitB = b.split(/(\d+)/);
    
    const maxLength = Math.max(splitA.length, splitB.length);
    
    for (let i = 0; i < maxLength; i++) {
      const partA = splitA[i] || '';
      const partB = splitB[i] || '';
      
      // 如果两个部分都是数字，按数值比较
      if (/^\d+$/.test(partA) && /^\d+$/.test(partB)) {
        const numA = parseInt(partA, 10);
        const numB = parseInt(partB, 10);
        if (numA !== numB) {
          return numA - numB;
        }
      } else {
        // 否则按字符串比较
        const result = partA.localeCompare(partB);
        if (result !== 0) {
          return result;
        }
      }
    }
    
    return 0;
  }

  // 生成简单的缩略图（使用默认图标）
  generateThumbnail(videoPath: string): string {
    // 这里可以后续集成FFmpeg来生成真实的缩略图
    // 现在返回一个基于文件扩展名的默认图标
    const ext = path.extname(videoPath).toLowerCase();
    return `default-${ext}`;
  }

  // 安全的NFO解析方法，确保任何错误都不会中断扫描
  private async safeParseNFOForVideo(filePath: string): Promise<NFOData | undefined> {
    try {
      // 查找对应的NFO文件
      const nfoPath = NFOParser.findNFOFile(filePath);
      if (!nfoPath) {
        console.log(`🔍 [视频扫描] 未找到NFO文件: ${path.basename(filePath)}`);
        return undefined;
      }
      
      console.log(`🔍 [视频扫描] 找到NFO文件: ${path.basename(nfoPath)} (对应视频: ${path.basename(filePath)})`);
      
      // 解析NFO文件
      const nfoData = await NFOParser.parseNFO(nfoPath);
      if (nfoData) {
        console.log(`✅ [视频扫描] 成功解析NFO文件: ${path.basename(nfoPath)}`);
        console.log(`🎬 [视频扫描] 标题: ${nfoData.originalTitle || '无'}`);
        console.log(`🎬 [视频扫描] 制作公司: ${nfoData.studio || '无'}`);
        console.log(`🎭 [视频扫描] 演员: ${nfoData.actors?.length || 0}人`);
        return nfoData;
      } else {
        console.warn(`⚠️ [视频扫描] NFO文件存在但解析失败: ${path.basename(nfoPath)}`);
        return undefined;
      }
    } catch (error) {
      console.error(`❌ [视频扫描] NFO解析异常，但继续扫描 [${path.basename(filePath)}]:`, error instanceof Error ? error.message : String(error));
      return undefined;
    }
  }

  // 旧方法保持兼容性
  private async parseNFOForVideo(filePath: string): Promise<NFOData | undefined> {
    return this.safeParseNFOForVideo(filePath);
  }
}

export const videoScanner = new VideoScanner(); 
