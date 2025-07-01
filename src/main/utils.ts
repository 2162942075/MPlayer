export const isDev = process.env.NODE_ENV === 'development' || process.argv.includes('--dev');

export const supportedVideoFormats = [
  '.mp4', '.avi', '.mkv', '.mov', '.wmv', '.flv', '.webm', '.m4v', '.mpg', '.mpeg', '.3gp',
  '.ts', '.mts', '.m2ts', '.vob', '.ogv', '.ogg', '.rm', '.rmvb', '.asf', '.f4v'
];

export function isVideoFile(filename: string): boolean {
  const ext = filename.toLowerCase().substring(filename.lastIndexOf('.'));
  return supportedVideoFormats.includes(ext);
} 