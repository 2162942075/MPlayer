import * as fs from 'fs';
import * as path from 'path';
import * as xml2js from 'xml2js';

export interface NFOData {
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

export class NFOParser {
  
  /**
   * 根据视频文件或文件夹路径查找对应的NFO文件
   */
  static findNFOFile(videoPath: string): string | null {
    try {
      const stats = fs.statSync(videoPath);
      
      if (stats.isDirectory()) {
      // 如果是文件夹（剧集），查找剧集NFO文件
      const nfoPatterns = [
        'tvshow.nfo',
        'series.nfo',
        'folder.nfo'
      ];
      
      for (const pattern of nfoPatterns) {
        const nfoPath = path.join(videoPath, pattern);
        if (fs.existsSync(nfoPath)) {
          return nfoPath;
        }
      }
    } else {
      // 如果是文件（单个视频），查找视频文件对应的NFO文件
      const videoDir = path.dirname(videoPath);
      const videoName = path.basename(videoPath, path.extname(videoPath));
      
      const nfoPatterns = [
        `${videoName}.nfo`,
        'movie.nfo',
        'tvshow.nfo',
        'series.nfo',
        'folder.nfo'
      ];
      
      for (const pattern of nfoPatterns) {
        const nfoPath = path.join(videoDir, pattern);
        if (fs.existsSync(nfoPath)) {
          return nfoPath;
        }
      }
    }
    
    return null;
    } catch (error) {
      // 如果路径不存在或无法访问，返回null
      console.error('查找NFO文件时出错:', error);
      return null;
    }
  }

  /**
   * 解析NFO文件内容
   */
  static async parseNFO(nfoPath: string): Promise<NFOData | null> {
    try {
      if (!fs.existsSync(nfoPath)) {
        return null;
      }

      const xmlContent = fs.readFileSync(nfoPath, 'utf-8');
      const parser = new xml2js.Parser({ 
        explicitArray: false,
        ignoreAttrs: false,
        trim: true 
      });
      
      const result = await parser.parseStringPromise(xmlContent);
      
      // 支持多种NFO格式（电影、电视剧等）
      const movieData = result.movie || result.tvshow || result.episodedetails || {};
      
      const nfoData: NFOData = {};
      
      // 基本信息
      if (movieData.title) nfoData.originalTitle = String(movieData.title);
      if (movieData.originaltitle) nfoData.originalTitle = String(movieData.originaltitle);
      if (movieData.year) nfoData.year = parseInt(String(movieData.year));
      if (movieData.plot) nfoData.plot = String(movieData.plot);
      if (movieData.tagline) nfoData.tagline = String(movieData.tagline);
      if (movieData.runtime) nfoData.runtime = parseInt(String(movieData.runtime));
      if (movieData.studio) nfoData.studio = String(movieData.studio);
      if (movieData.country) nfoData.country = String(movieData.country);
      if (movieData.language) nfoData.language = String(movieData.language);
      if (movieData.premiered) nfoData.premiered = String(movieData.premiered);
      if (movieData.status) nfoData.status = String(movieData.status);
      
      // 评分
      if (movieData.rating) {
        const rating = parseFloat(String(movieData.rating));
        if (!isNaN(rating)) nfoData.rating = rating;
      }
      
      // 处理数组字段
      if (movieData.genre) {
        nfoData.genre = this.parseArrayField(movieData.genre);
      }
      
      if (movieData.director) {
        nfoData.director = this.parseArrayField(movieData.director);
      }
      
      // 演员信息
      if (movieData.actor) {
        const actors = Array.isArray(movieData.actor) ? movieData.actor : [movieData.actor];
        nfoData.actors = actors.map((actor: any) => {
          if (typeof actor === 'string') return actor;
          return actor.name || actor._;
        }).filter(Boolean);
      }
      
      // ID信息
      if (movieData.id) {
        const id = String(movieData.id);
        if (id.startsWith('tt')) {
          nfoData.imdbId = id;
        } else if (/^\d+$/.test(id)) {
          nfoData.tmdbId = id;
        }
      }
      
      if (movieData.imdbid) nfoData.imdbId = String(movieData.imdbid);
      if (movieData.tmdbid) nfoData.tmdbId = String(movieData.tmdbid);
      if (movieData.tvdbid) nfoData.tvdbId = String(movieData.tvdbid);
      
      return nfoData;
      
    } catch (error) {
      console.error('解析NFO文件失败:', error);
      return null;
    }
  }

  /**
   * 将NFO数据写入文件
   */
  static async writeNFO(nfoPath: string, nfoData: NFOData, type: 'movie' | 'tvshow' = 'movie'): Promise<boolean> {
    try {
      const builder = new xml2js.Builder({
        rootName: type,
        headless: false,
        renderOpts: { 'pretty': true, 'indent': '  ' }
      });
      
      const xmlData: any = {};
      
      // 基本信息
      if (nfoData.originalTitle) xmlData.title = nfoData.originalTitle;
      if (nfoData.year) xmlData.year = nfoData.year;
      if (nfoData.plot) xmlData.plot = nfoData.plot;
      if (nfoData.tagline) xmlData.tagline = nfoData.tagline;
      if (nfoData.runtime) xmlData.runtime = nfoData.runtime;
      if (nfoData.studio) xmlData.studio = nfoData.studio;
      if (nfoData.country) xmlData.country = nfoData.country;
      if (nfoData.language) xmlData.language = nfoData.language;
      if (nfoData.premiered) xmlData.premiered = nfoData.premiered;
      if (nfoData.status) xmlData.status = nfoData.status;
      if (nfoData.rating) xmlData.rating = nfoData.rating;
      
      // 数组字段
      if (nfoData.genre?.length) xmlData.genre = nfoData.genre;
      if (nfoData.director?.length) xmlData.director = nfoData.director;
      
      // 演员
      if (nfoData.actors?.length) {
        xmlData.actor = nfoData.actors.map(actor => ({ name: actor }));
      }
      
      // ID信息
      if (nfoData.imdbId) xmlData.imdbid = nfoData.imdbId;
      if (nfoData.tmdbId) xmlData.tmdbid = nfoData.tmdbId;
      if (nfoData.tvdbId) xmlData.tvdbid = nfoData.tvdbId;
      
      const xml = builder.buildObject(xmlData);
      fs.writeFileSync(nfoPath, xml, 'utf-8');
      
      return true;
    } catch (error) {
      console.error('写入NFO文件失败:', error);
      return false;
    }
  }

  /**
   * 为视频文件或文件夹创建NFO文件路径
   */
  static createNFOPath(videoPath: string): string {
    try {
      const stats = fs.statSync(videoPath);
      
      if (stats.isDirectory()) {
        // 如果是文件夹（剧集），使用tvshow.nfo
        return path.join(videoPath, 'tvshow.nfo');
      } else {
        // 如果是文件（单个视频），使用视频文件名.nfo
        const videoDir = path.dirname(videoPath);
        const videoName = path.basename(videoPath, path.extname(videoPath));
        return path.join(videoDir, `${videoName}.nfo`);
      }
    } catch (error) {
      // 如果文件/文件夹不存在，默认处理为文件
      const videoDir = path.dirname(videoPath);
      const videoName = path.basename(videoPath, path.extname(videoPath));
      return path.join(videoDir, `${videoName}.nfo`);
    }
  }

  /**
   * 解析可能为数组或字符串的字段
   */
  private static parseArrayField(field: any): string[] {
    if (Array.isArray(field)) {
      return field.map(item => String(item)).filter(Boolean);
    } else if (field) {
      // 处理用分隔符分隔的字符串
      const str = String(field);
      if (str.includes(',')) {
        return str.split(',').map(item => item.trim()).filter(Boolean);
      } else if (str.includes('|')) {
        return str.split('|').map(item => item.trim()).filter(Boolean);
      } else if (str.includes('/')) {
        return str.split('/').map(item => item.trim()).filter(Boolean);
      }
      return [str];
    }
    return [];
  }

  /**
   * 检查是否存在NFO文件
   */
  static hasNFOFile(videoPath: string): boolean {
    return this.findNFOFile(videoPath) !== null;
  }
} 