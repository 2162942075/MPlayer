export const isDev = process.env.NODE_ENV === 'development' || process.argv.includes('--dev');

export const supportedVideoFormats = [
  '.mp4', '.avi', '.mkv', '.mov', '.wmv', '.flv', '.webm', '.m4v', '.mpg', '.mpeg', '.3gp',
  '.ts', '.mts', '.m2ts', '.vob', '.ogv', '.ogg', '.rm', '.rmvb', '.asf', '.f4v'
];

export function isVideoFile(filename: string): boolean {
  const ext = filename.toLowerCase().substring(filename.lastIndexOf('.'));
  return supportedVideoFormats.includes(ext);
}

// 日志系统 - 优化生产环境性能
export const logger = {
  // 调试信息 - 仅开发环境
  debug: (...args: any[]) => {
    if (isDev) {
      console.log('[DEBUG]', ...args);
    }
  },
  
  // 普通信息 - 仅开发环境
  info: (...args: any[]) => {
    if (isDev) {
      console.log('[INFO]', ...args);
    }
  },
  
  // 警告信息 - 开发和生产环境都输出，但生产环境简化
  warn: (...args: any[]) => {
    if (isDev) {
      console.warn('[WARN]', ...args);
    } else {
      console.warn('[WARN]', args[0]); // 生产环境只输出第一个参数
    }
  },
  
  // 错误信息 - 始终输出，用于问题排查
  error: (...args: any[]) => {
    console.error('[ERROR]', ...args);
  },
  
  // 扫描进度 - 仅开发环境的详细日志
  scan: (...args: any[]) => {
    if (isDev) {
      console.log('[SCAN]', ...args);
    }
  },
  
  // NFO解析 - 仅开发环境的详细日志
  nfo: (...args: any[]) => {
    if (isDev) {
      console.log('[NFO]', ...args);
    }
  },
  
  // 播放相关 - 仅开发环境的详细日志
  play: (...args: any[]) => {
    if (isDev) {
      console.log('[PLAY]', ...args);
    }
  }
}; 