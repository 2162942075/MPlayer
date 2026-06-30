import React, { useState, useEffect } from 'react';
import { Card, Button, Select, Empty, Spin, Image, Modal, Tag, Space, message, Dropdown, Input, Tooltip, Progress, Descriptions, Row, Col, Slider, Checkbox } from 'antd';
import { PlayCircleOutlined, FolderOutlined, PictureOutlined, InfoCircleOutlined, SortAscendingOutlined, SearchOutlined, FileTextOutlined, ClockCircleOutlined, DesktopOutlined, SoundOutlined, CameraOutlined, TagOutlined, DownOutlined, ClearOutlined, EditOutlined, ReloadOutlined, FilterOutlined } from '@ant-design/icons';
import TagManager from './TagManager';
import NFOEditor from './NFOEditor';
import RenameManager from './RenameManager';


const { Search } = Input;

interface Category {
  id: string;
  name: string;
  path: string;
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
  parentDir?: string; // 添加父目录信息用于搜索
  tags?: string[]; // 视频标签ID数组
  nfoData?: any; // NFO数据
  watchStatus?: 'unwatched' | 'watching' | 'watched'; // 观看状态
}

interface VideoMetadata {
  fileName: string;
  filePath: string;
  fileSize: string;
  fileSizeBytes: number;
  extension: string;
  createTime: string;
  modifyTime: string;
  duration: string;
  resolution: string;
  codec: string;
  bitrate: string;
  frameRate: string;
  audioCodec: string;
  channels: string;
}

interface VideoTag {
  id: string;
  name: string;
  color: string;
  category: 'genre' | 'quality' | 'language' | 'studio' | 'custom';
  description?: string;
  createdAt: number;
}

const VideoLibrary: React.FC = () => {
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [videos, setVideos] = useState<VideoInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedVideo, setSelectedVideo] = useState<VideoInfo | null>(null);
  const [sortType, setSortType] = useState<'episode' | 'name' | 'original'>('episode');
  const [searchKeyword, setSearchKeyword] = useState<string>('');
  const [episodeCovers, setEpisodeCovers] = useState<{[key: string]: 'horizontal' | 'vertical' | 'square'}>({});
  
  // 扫描进度状态
  const [scanProgress, setScanProgress] = useState<{
    visible: boolean;
    current: number;
    total: number;
    percentage: number;
    currentPath: string;
  }>({
    visible: false,
    current: 0,
    total: 0,
    percentage: 0,
    currentPath: ''
  });

  // 视频信息面板状态
  const [videoMetadata, setVideoMetadata] = useState<VideoMetadata | null>(null);
  const [loadingMetadata, setLoadingMetadata] = useState<boolean>(false);

  
  // 自动扫描设置状态
  const [autoScanSettings, setAutoScanSettings] = useState<{
    enabled: boolean;
    pauseOnUserAction: boolean;
  }>({
    enabled: false,
    pauseOnUserAction: true
  });
  
  // 时间轴预览状态
  // 预览功能已移除

  // 标签管理和NFO编辑状态
  const [tagManagerVisible, setTagManagerVisible] = useState(false);
  const [nfoEditorVisible, setNfoEditorVisible] = useState(false);
  const [selectedVideoForNFO, setSelectedVideoForNFO] = useState<{ path: string; title: string } | null>(null);
  
  // 重命名管理状态
  const [renameManagerVisible, setRenameManagerVisible] = useState(false);
  
  // 标签相关状态
  const [allTags, setAllTags] = useState<VideoTag[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [videoTagsModalVisible, setVideoTagsModalVisible] = useState(false);
  const [currentVideoForTags, setCurrentVideoForTags] = useState<VideoInfo | null>(null);

  // 标记当前元数据是否为单个文件的（而非文件夹的）
  const [isMetadataForSingleFile, setIsMetadataForSingleFile] = useState<boolean>(false);

  // NFO数据状态
  const [nfoData, setNfoData] = useState<any>(null);
  const [loadingNfo, setLoadingNfo] = useState<boolean>(false);



  // 监听selectedVideo状态变化
  useEffect(() => {
    console.log('🎬 selectedVideo状态变化:', selectedVideo?.title || 'null');
  }, [selectedVideo]);

  // 新的标签筛选状态
  const [tagSearchKeyword, setTagSearchKeyword] = useState<string>('');
  const [tagFilterExpanded, setTagFilterExpanded] = useState<boolean>(false);

  // 高级筛选状态
  const [advancedFilterExpanded, setAdvancedFilterExpanded] = useState<boolean>(false);
  const [advancedFilters, setAdvancedFilters] = useState({
    yearRange: [1900, new Date().getFullYear() + 1] as [number, number],
    ratingRange: [0, 10] as [number, number],
    selectedGenres: [] as string[],
    selectedLanguages: [] as string[],
    selectedStudios: [] as string[],
    selectedCountries: [] as string[],
    hasNFO: false as boolean
  });

  useEffect(() => {
    loadCategories();
    loadAutoScanSettings();
    loadAllTags(); // 加载所有标签
  }, []);

  useEffect(() => {
    if (selectedCategory) {
      loadVideos(selectedCategory);
    }
  }, [selectedCategory]);
  
  // 监听扫描进度
  useEffect(() => {
    if ((window as any).electronAPI?.onScanProgress) {
      const removeListener = (window as any).electronAPI.onScanProgress((progress: any) => {
        console.log('收到扫描进度:', progress);
        
        // 处理进度清理信号
        if (progress.current === 0 && progress.total === 0 && progress.currentPath === '') {
          setScanProgress(prev => ({ ...prev, visible: false }));
          return;
        }
        
        // 正常更新进度
        setScanProgress({
          visible: true,
          current: progress.current,
          total: progress.total,
          percentage: progress.percentage,
          currentPath: progress.currentPath
        });
        
        // 扫描完成后隐藏进度条（备用逻辑）
        if (progress.current >= progress.total && progress.total > 0) {
          setTimeout(() => {
            setScanProgress(prev => ({ ...prev, visible: false }));
          }, 2000);
        }
      });
      
      return removeListener;
    }
  }, []);

  // 监听自动扫描结果
  useEffect(() => {
    if ((window as any).electronAPI?.onAutoScanResult) {
      const removeListener = (window as any).electronAPI.onAutoScanResult((result: any) => {
        console.log('收到自动扫描结果:', result);
        
        // 如果是当前显示的分类，则更新视频列表
        if (result.categoryId === selectedCategory && result.action === 'update') {
          console.log('自动扫描检测到文件变化，更新视频列表');
          loadVideos(selectedCategory);
          
          // 显示提示消息
          message.info('检测到文件变化，已自动更新视频列表', 3);
        }
      });
      
      return removeListener;
    }
  }, [selectedCategory]);

  // 监听设置更新事件
  useEffect(() => {
    const handleSettingsUpdate = (event: any) => {
      console.log('自动扫描设置已更新:', event.detail);
      setAutoScanSettings({
        enabled: event.detail.enabled,
        pauseOnUserAction: event.detail.pauseOnUserAction
      });
    };

    window.addEventListener('autoScanSettingsUpdated', handleSettingsUpdate);
    
    return () => {
      window.removeEventListener('autoScanSettingsUpdated', handleSettingsUpdate);
    };
  }, []);

  const loadCategories = async () => {
    try {
      const savedCategories = await (window as any).electronAPI?.getCategories() || [];
      setCategories(savedCategories);
      if (savedCategories.length > 0 && !selectedCategory) {
        setSelectedCategory(savedCategories[0].id);
      }
    } catch (error) {
      console.error('加载分类失败:', error);
    }
  };

  const loadAutoScanSettings = async () => {
    try {
      const settings = await (window as any).electronAPI?.getAutoScanSettings();
      if (settings) {
        setAutoScanSettings({
          enabled: settings.enabled,
          pauseOnUserAction: settings.pauseOnUserAction
        });
      }
    } catch (error) {
      console.error('加载自动扫描设置失败:', error);
    }
  };

  const loadVideos = async (categoryId: string) => {
    setLoading(true);
    try {
      const categoryVideos = await (window as any).electronAPI?.getVideosByCategory(categoryId) || [];
      setVideos(categoryVideos);
    } catch (error) {
      console.error('加载视频失败:', error);
      setVideos([]);
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    if (selectedCategory) {
      // 获取最新的自动扫描设置，确保使用最新状态
      const currentSettings = await (window as any).electronAPI?.getAutoScanSettings();
      if (currentSettings?.pauseOnUserAction) {
        console.log('用户操作暂停已启用，暂停自动扫描');
        (window as any).electronAPI?.pauseAutoScan();
      } else {
        console.log('用户操作暂停已禁用，不暂停自动扫描');
      }
      
      setLoading(true);
      setScanProgress(prev => ({ ...prev, visible: true }));
      
      try {
        // 先重新扫描，再加载视频列表
        await (window as any).electronAPI?.scanVideos(selectedCategory);
        await loadVideos(selectedCategory);
        
        message.success('视频库刷新完成');
      } catch (error) {
        console.error('重新扫描失败:', error);
        message.error('刷新失败：' + (error instanceof Error ? error.message : String(error)));
      } finally {
        setLoading(false);
        // 延迟隐藏进度条，确保用户能看到完成状态
        setTimeout(() => {
          setScanProgress(prev => ({ ...prev, visible: false }));
        }, 1000);
      }
    }
  };

  const handlePlay = async (videoPath: string, videoInfo?: VideoInfo, isEpisode?: boolean, seriesTitle?: string) => {
    try {
      console.log('🎮🎮🎮 handlePlay 被调用！🎮🎮🎮');
      console.log('  📂 传入的videoPath:', videoPath, '(将被忽略，强制从数据库获取最新路径)');
      console.log('  🎥 传入的videoInfo:', videoInfo?.title, videoInfo?.id);
      
      // 定义视频查找函数
      const findVideoById = (videoList: VideoInfo[], videoId: string): VideoInfo | null => {
        for (const video of videoList) {
          if (video.id === videoId) {
            return video;
          }
          if (video.episodes) {
            for (const episode of video.episodes) {
              if (episode.id === videoId) {
                return episode;
              }
            }
          }
        }
        return null;
      };
      
      // 获取最新的播放路径 - 强制从数据库获取
      let finalVideoPath: string;
      let foundVideo: VideoInfo | null = null;
      
      if (videoInfo?.id) {
        console.log('🔍 强制从数据库获取最新路径（忽略前端缓存）...');
        
        try {
          // 直接从数据库API获取最新数据，不使用前端缓存
          console.log('📡 调用数据库API获取最新数据...');
          const dbVideos = await (window as any).electronAPI?.getAllVideos() || [];
          console.log('📥 从数据库获取到视频总数:', dbVideos.length);
          
          foundVideo = findVideoById(dbVideos, videoInfo.id);
          console.log('🔍 数据库查找结果:', foundVideo ? `找到：${foundVideo.path}` : '未找到');
          
          if (foundVideo) {
            finalVideoPath = foundVideo.path;
            console.log('🎯 确定最终播放路径（来自数据库）:', finalVideoPath);
            
            // 如果路径与传入路径不同，说明发生了重命名
            if (finalVideoPath !== videoPath) {
              console.log('🔄 检测到路径变化（数据库 vs 传入）:');
              console.log('  📂 传入路径:', videoPath);
              console.log('  📁 数据库路径:', finalVideoPath);
            } else {
              console.log('✅ 路径一致，无需更新');
            }
          } else {
            console.warn('⚠️ 在数据库中未找到视频记录');
            console.warn('  🆔 查找的视频ID:', videoInfo.id);
            console.warn('  📋 数据库中所有视频IDs:', dbVideos.map((v: VideoInfo) => v.id).slice(0, 10));
            
            // 作为备选，使用传入路径
            console.log('🔧 使用传入路径作为备选');
            finalVideoPath = videoPath;
          }
        } catch (error) {
          console.error('💥 从数据库获取数据失败:', error);
          console.log('🔧 使用传入路径作为备选');
          finalVideoPath = videoPath;
        }
      } else {
        console.log('🔧 没有videoInfo.id，直接使用传入路径');
        finalVideoPath = videoPath;
      }
      
      console.log('🎬 最终播放路径:', finalVideoPath);
      
      // 检查最终路径的文件是否存在
      try {
        const fileExists = await (window as any).electronAPI?.checkFileExists(finalVideoPath);
        console.log('📋 最终路径文件存在性检查:', fileExists);
        
        if (!fileExists) {
          console.error('❌ 最终路径文件不存在:', finalVideoPath);
          
          // 如果文件不存在，尝试强制刷新数据库
          if (foundVideo && finalVideoPath === foundVideo.path) {
            message.error(`视频文件不存在：${finalVideoPath}\n数据可能不同步，请尝试重新扫描或检查文件`);
            return;
          } else {
            message.error(`视频文件不存在：${finalVideoPath}\n请检查文件是否被移动或删除`);
            return;
          }
        } else {
          console.log('✅ 文件存在性检查通过');
        }
      } catch (error) {
        console.error('💥 文件存在性检查失败:', error);
        console.log('🎬 跳过文件检查，直接尝试播放...');
      }
      
      // 获取最新的自动扫描设置，确保使用最新状态
      const currentSettings = await (window as any).electronAPI?.getAutoScanSettings();
      if (currentSettings?.pauseOnUserAction) {
        console.log('用户操作暂停已启用，暂停自动扫描');
        (window as any).electronAPI?.pauseAutoScan();
      } else {
        console.log('用户操作暂停已禁用，不暂停自动扫描');
      }
      
      console.log('调用openWithPlayer API...');
      console.log('🎬 传给openWithPlayer的最终路径:', finalVideoPath);
      console.log('🔍 再次验证文件存在性:', await (window as any).electronAPI?.checkFileExists(finalVideoPath));
      
      const result = await (window as any).electronAPI?.openWithPlayer(finalVideoPath);
      console.log('🎯 openWithPlayer API调用结果:', result);
      console.log('🎯 结果详情 - success:', result?.success);
      console.log('🎯 结果详情 - error:', result?.error);
      console.log('🎯 结果详情 - playerType:', result?.playerType);
      
      if (!result?.success) {
        console.error('❌ 播放失败，详细错误信息:', result?.error || '未知错误');
        const errorMsg = result?.error || '请检查播放器设置';
        if (errorMsg.includes('不存在')) {
          message.error(`播放失败: ${errorMsg}\n建议刷新视频列表后重试`);
        } else {
          message.error('播放失败: ' + errorMsg);
        }
      } else {
        console.log('✅ 播放器启动成功！');
        message.success('正在启动播放器...');
        
        // 如果使用内置播放器，显示快捷键提醒
        if (result?.playerType === 'built-in') {
          showFFplayKeyboardShortcuts();
        }
        
        // 🔥 如果检测到路径变化，播放成功后自动刷新前端列表
        if (foundVideo && foundVideo.path !== videoPath) {
          console.log('🔄 检测到路径变化，播放成功后自动刷新前端列表...');
          console.log('  📂 传入路径:', videoPath);
          console.log('  📁 数据库路径:', foundVideo.path);
          
          // 延迟刷新，避免干扰播放启动
          setTimeout(async () => {
            if (selectedCategory) {
              console.log('📱 执行自动刷新视频列表...');
              await loadVideos(selectedCategory);
              message.success('已自动同步最新文件信息', 2);
              
              // 如果当前有选中的视频，也更新它
              if (selectedVideo && selectedVideo.id === videoInfo?.id) {
                console.log('🔄 同时更新当前选中视频的信息');
                const updatedVideos = await (window as any).electronAPI?.getVideosByCategory(selectedCategory) || [];
                const updatedVideo = updatedVideos.find((v: VideoInfo) => v.id === selectedVideo.id);
                if (updatedVideo) {
                  setSelectedVideo(updatedVideo);
                  console.log('✅ 当前选中视频信息已更新');
                }
              }
            }
          }, 2000); // 延迟2秒刷新
        }
        
        // 记录播放历史
        if (videoInfo) {
          const historyData = {
            videoId: videoInfo.id,
            videoTitle: isEpisode && seriesTitle ? seriesTitle : videoInfo.title,
            videoPath: finalVideoPath, // 使用最新路径
            categoryId: videoInfo.categoryId || selectedCategory,
            isEpisode: isEpisode || false,
            episodeTitle: isEpisode ? videoInfo.title : undefined
          };
          
          try {
            await (window as any).electronAPI?.addPlayHistory(historyData);
            console.log('播放历史记录成功');
          } catch (historyError) {
            console.error('记录播放历史失败:', historyError);
          }
        }
      }
    } catch (error) {
      console.error('播放失败:', error);
      message.error('播放失败，请检查文件是否存在或尝试刷新视频列表');
    }
  };

  const handleVideoClick = (video: VideoInfo) => {
    setSelectedVideo(video);
    // 清空之前的视频元数据，避免显示旧数据
    setVideoMetadata(null);
    setIsMetadataForSingleFile(false);
    setNfoData(null);
    
    // 自动加载NFO数据
    if (video.isDirectory) {
      // 对于剧集，加载剧集文件夹的NFO数据
      loadNFOData(video.path);
    } else {
      // 对于单个视频文件，直接加载NFO数据
      loadNFOData(video.path);
    }
  };

  // 监听videoMetadata变化
  useEffect(() => {
    if (videoMetadata) {
      console.log('🔍 videoMetadata状态已更新:', videoMetadata);
      console.log('🎯 显示数据检查:', {
        duration: videoMetadata.duration,
        resolution: videoMetadata.resolution,
        codec: videoMetadata.codec,
        frameRate: videoMetadata.frameRate,
        bitrate: videoMetadata.bitrate
      });
    } else {
      console.log('📄 videoMetadata已清空');
    }
  }, [videoMetadata]);

  // 获取视频信息
  const loadVideoInfo = async (videoPath: string) => {
    try {
      // 立即清空当前的元数据状态，避免显示旧数据
      setVideoMetadata(null);
      setIsMetadataForSingleFile(false);
      setLoadingMetadata(true);
      
      // 判断当前获取的是否为单个文件信息
      // 如果路径与selectedVideo的路径不同，说明是获取剧集中单个文件的信息
      const isSingleFile = selectedVideo ? videoPath !== selectedVideo.path : false;
      setIsMetadataForSingleFile(isSingleFile);
      
      const result = await (window as any).electronAPI?.getVideoInfo(videoPath);
      if (result?.success && result.info) {
        setVideoMetadata(result.info);
      } else {
        console.error('获取视频元数据失败:', result?.error);
      }
    } catch (error) {
      console.error('获取视频元数据时出错:', error);
    } finally {
      setLoadingMetadata(false);
    }
  };

  // 加载NFO数据
  const loadNFOData = async (videoPath: string) => {
    try {
      console.log('🔍 开始加载NFO数据，路径:', videoPath);
      setLoadingNfo(true);
      const result = await (window as any).electronAPI?.parseNFO(videoPath);
      console.log('🔍 parseNFO API返回结果:', result);
      if (result) {
        setNfoData(result);
        console.log('✅ NFO数据加载成功:', result);
      } else {
        setNfoData(null);
        console.log('❌ 未找到NFO文件或解析失败');
      }
    } catch (error) {
      console.error('❌ 加载NFO数据失败:', error);
      setNfoData(null);
    } finally {
      setLoadingNfo(false);
    }
  };

  // 预览功能已移除

  // 格式化文件大小
  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // 格式化日期
  const formatDate = (dateString: string): string => {
    try {
      const date = new Date(dateString);
      return date.toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return '未知';
    }
  };

  // 显示FFplay快捷键提醒
  const showFFplayKeyboardShortcuts = () => {
    // 检查用户是否已经看过提醒
    const hasShownBefore = localStorage.getItem('ffplay-shortcuts-shown');
    
    if (hasShownBefore) {
      // 如果已经显示过，只显示简单提醒
      message.info('内置播放器已启动，按空格键暂停/播放，按F全屏，按Q退出');
      return;
    }

    // 首次使用，显示详细的快捷键对话框
    Modal.info({
      title: '🎮 首次使用内置播放器',
      icon: null,
      width: 520,
      content: (
        <div style={{ fontSize: 14 }}>
          <div style={{ marginBottom: 16, color: '#666' }}>
            内置 FFplay 播放器已启动！由于没有可视化按钮，请使用以下快捷键控制：
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 20px', marginBottom: 16 }}>
            <div><strong>空格键</strong> - 暂停/播放</div>
            <div><strong>Q 或 ESC</strong> - 退出播放器</div>
            <div><strong>F</strong> - 全屏切换</div>
            <div><strong>M</strong> - 静音切换</div>
            <div><strong>← →</strong> - 快退/快进10秒</div>
            <div><strong>↓ ↑</strong> - 快退/快进1分钟</div>
            <div><strong>9 / 0</strong> - 降低/提高音量</div>
            <div><strong>S</strong> - 单帧播放</div>
          </div>
          <div style={{ 
            padding: 12, 
            backgroundColor: '#fff7e6', 
            border: '1px solid #ffd591', 
            borderRadius: 6,
            fontSize: 13
          }}>
            <div style={{ marginBottom: 8, fontWeight: 500 }}>🔄 切换播放器选项：</div>
            <div style={{ color: '#666', fontSize: 12 }}>
              • 如需可视化控制界面，可在"设置"中配置外部播放器<br/>
              • 此提醒只显示一次，快捷键说明可在设置页面查看
            </div>
          </div>
        </div>
      ),
      okText: '我知道了',
      onOk: () => {
        // 标记用户已经看过详细提醒
        localStorage.setItem('ffplay-shortcuts-shown', 'true');
      }
    });
  };

  const handleSetCover = async (videoId: string) => {
    try {
      console.log('开始设置封面 - 视频ID:', videoId);
      const imagePath = await (window as any).electronAPI?.selectImage();
      if (imagePath) {
        console.log('选择的图片路径:', imagePath);
        const result = await (window as any).electronAPI?.saveCoverImage(imagePath, videoId);
        console.log('保存封面结果:', result);
        if (result?.success) {
          console.log('保存封面成功，开始更新数据库...');
          const updateResult = await (window as any).electronAPI?.updateVideoCover(videoId, result.coverPath);
          console.log('数据库更新结果:', updateResult);
          if (updateResult?.success) {
            message.success('封面设置成功');
            // 刷新视频列表
            await loadVideos(selectedCategory);
            
            // 如果当前有打开的详情弹窗，更新selectedVideo数据
            if (selectedVideo) {
              try {
                // 重新获取当前选中视频的最新数据
                const updatedVideos = await (window as any).electronAPI?.getVideosByCategory(selectedCategory) || [];
                const updatedSelectedVideo = updatedVideos.find((v: VideoInfo) => v.id === selectedVideo.id);
                if (updatedSelectedVideo) {
                  setSelectedVideo(updatedSelectedVideo);
                  console.log('详情页数据已更新');
                }
              } catch (error) {
                console.error('更新详情页数据失败:', error);
              }
            }
            
            // 清空图片缓存，确保新封面能够重新加载
            setImageCache({});
          } else {
            message.error('封面更新失败: ' + updateResult?.error);
          }
        } else {
          message.error('封面保存失败: ' + result?.error);
        }
      }
    } catch (error) {
      console.error('设置封面失败:', error);
      message.error('设置封面失败');
    }
  };

  const showCoversDirectory = async () => {
    try {
      const coversDir = await (window as any).electronAPI?.getCoversDirectory();
      message.info(`封面保存目录: ${coversDir}`, 10);
      console.log('封面保存目录:', coversDir);
    } catch (error) {
      console.error('获取封面目录失败:', error);
    }
  };

  // 图片数据URL缓存（带限制机制）
  const [imageCache, setImageCache] = useState<Record<string, string>>({});
  const MAX_CACHE_SIZE = 50; // 最大缓存50张图片

  // 从文件名中提取集数信息
  const extractEpisodeNumber = (fileName: string, fallbackIndex: number): number => {
    // 常见的集数匹配模式
    const patterns = [
      /第(\d+)集/,           // 第01集、第1集
      /第(\d+)话/,           // 第01话、第1话
      /第(\d+)回/,           // 第01回、第1回
      /\b(\d+)集/,           // 01集、1集
      /\b(\d+)话/,           // 01话、1话
      /\b(\d+)回/,           // 01回、1回
      /EP(\d+)/i,            // EP01、ep01
      /E(\d+)/i,             // E01、e01
      /S\d+E(\d+)/i,         // S01E01格式
      /\b(\d+)\b/,           // 任何独立的数字
    ];

    for (const pattern of patterns) {
      const match = fileName.match(pattern);
      if (match) {
        const num = parseInt(match[1], 10);
        if (num > 0 && num <= 9999) { // 合理的集数范围
          return num;
        }
      }
    }

    // 如果都匹配不到，返回数组索引+1作为默认值
    return fallbackIndex;
  };

  // 排序剧集列表
  const sortEpisodes = (episodes: VideoInfo[]): VideoInfo[] => {
    const episodesCopy = [...episodes];
    
    switch (sortType) {
      case 'episode':
        // 按集数排序
        return episodesCopy.sort((a, b) => {
          const episodeA = extractEpisodeNumber(a.title, 0);
          const episodeB = extractEpisodeNumber(b.title, 0);
          return episodeA - episodeB;
        });
      
      case 'name':
        // 按文件名字母排序
        return episodesCopy.sort((a, b) => a.title.localeCompare(b.title));
      
      case 'original':
        // 保持原始顺序
        return episodesCopy;
      
      default:
        return episodesCopy;
    }
  };

  // 检查是否有激活的高级筛选条件
  const isAdvancedFilterActive = (): boolean => {
    const defaultYearRange = [1900, new Date().getFullYear() + 1];
    const defaultRatingRange = [0, 10];
    
    return (
      advancedFilters.yearRange[0] !== defaultYearRange[0] ||
      advancedFilters.yearRange[1] !== defaultYearRange[1] ||
      advancedFilters.ratingRange[0] !== defaultRatingRange[0] ||
      advancedFilters.ratingRange[1] !== defaultRatingRange[1] ||
      advancedFilters.selectedGenres.length > 0 ||
      advancedFilters.selectedLanguages.length > 0 ||
      advancedFilters.selectedStudios.length > 0 ||
      advancedFilters.selectedCountries.length > 0 ||
      advancedFilters.hasNFO
    );
  };

  // 从视频列表中提取所有实际使用的选项（与NFO编辑器保持完全一致）
  const getFilterOptions = (videoList: VideoInfo[]) => {
    const genres = new Set<string>();
    const languages = new Set<string>();
    const studios = new Set<string>();
    const countries = new Set<string>();
    
    // 从所有视频的NFO数据中提取实际使用的选项
    videoList.forEach(video => {
      const nfoData = (video as any).nfoData;
      if (nfoData) {
        // 提取所有类型
        nfoData.genre?.forEach((genre: string) => {
          if (genre && genre.trim()) genres.add(genre.trim());
        });
        // 提取所有语言
        if (nfoData.language && nfoData.language.trim()) {
          languages.add(nfoData.language.trim());
        }
        // 提取所有制作公司
        if (nfoData.studio && nfoData.studio.trim()) {
          studios.add(nfoData.studio.trim());
        }
        // 提取所有国家
        if (nfoData.country && nfoData.country.trim()) {
          countries.add(nfoData.country.trim());
        }
      }
    });
    
    return {
      genres: Array.from(genres).sort(),
      languages: Array.from(languages).sort(),
      studios: Array.from(studios).sort(),
      countries: Array.from(countries).sort()
    };
  };

  // 搜索过滤视频列表
  const filterVideos = (videoList: VideoInfo[]): VideoInfo[] => {
    let filtered = videoList;

    // 按搜索关键词过滤
    if (searchKeyword) {
      const keyword = searchKeyword.toLowerCase();
      filtered = filtered.filter(video => {
      const titleMatch = video.title.toLowerCase().includes(keyword);
        const pathMatch = video.path.toLowerCase().includes(keyword);
        const parentDirMatch = video.parentDir?.toLowerCase().includes(keyword);
        
        // 检查剧集中是否有匹配的
        const episodeMatch = video.episodes?.some(episode => 
          episode.title.toLowerCase().includes(keyword) ||
          episode.path.toLowerCase().includes(keyword)
        );

        return titleMatch || pathMatch || parentDirMatch || episodeMatch;
      });
    }

    // 按选中的标签过滤
    if (selectedTags.length > 0) {
      filtered = filtered.filter(video => {
        const videoTags = video.tags || [];
        const episodeTags = video.episodes?.flatMap(episode => episode.tags || []) || [];
        const allVideoTags = [...videoTags, ...episodeTags];
        
        // 检查是否包含任一选中的标签
        return selectedTags.some(tagId => allVideoTags.includes(tagId));
      });
    }

    // 高级筛选
    if (isAdvancedFilterActive()) {
      filtered = filtered.filter(video => {
        const nfoData = (video as any).nfoData;
        
        // 年份筛选
        if (nfoData?.year) {
          const [minYear, maxYear] = advancedFilters.yearRange;
          if (nfoData.year < minYear || nfoData.year > maxYear) {
            return false;
          }
        }
        
        // 评分筛选
        if (nfoData?.rating) {
          const [minRating, maxRating] = advancedFilters.ratingRange;
          if (nfoData.rating < minRating || nfoData.rating > maxRating) {
            return false;
          }
        }
        
        // 类型筛选
        if (advancedFilters.selectedGenres.length > 0) {
          const videoGenres = nfoData?.genre || [];
          const hasMatchingGenre = advancedFilters.selectedGenres.some(selectedGenre =>
            videoGenres.some((genre: string) => genre.toLowerCase().includes(selectedGenre.toLowerCase()))
          );
          if (!hasMatchingGenre) return false;
        }
        
        // 语言筛选
        if (advancedFilters.selectedLanguages.length > 0) {
          const videoLanguage = nfoData?.language || '';
          const hasMatchingLanguage = advancedFilters.selectedLanguages.some(selectedLang =>
            videoLanguage.toLowerCase().includes(selectedLang.toLowerCase())
          );
          if (!hasMatchingLanguage) return false;
        }
        
        // 制作公司筛选
        if (advancedFilters.selectedStudios.length > 0) {
          const videoStudio = nfoData?.studio || '';
          const hasMatchingStudio = advancedFilters.selectedStudios.some(selectedStudio =>
            videoStudio.toLowerCase().includes(selectedStudio.toLowerCase())
          );
          if (!hasMatchingStudio) return false;
        }
        
        // 国家/地区筛选
        if (advancedFilters.selectedCountries.length > 0) {
          const videoCountry = nfoData?.country || '';
          const hasMatchingCountry = advancedFilters.selectedCountries.some(selectedCountry =>
            videoCountry.toLowerCase().includes(selectedCountry.toLowerCase())
          );
          if (!hasMatchingCountry) return false;
        }
        
        // NFO文件存在性筛选
        if (advancedFilters.hasNFO && !nfoData) {
          return false;
        }
        
        return true;
      });
    }

    return filtered;
  };

  // 获取标签显示名称
  const getTagDisplayName = (tagId: string): { name: string; color: string } => {
    const tag = allTags.find(t => t.id === tagId);
    return tag ? { name: tag.name, color: tag.color } : { name: tagId, color: '#666' };
  };

  // 获取视频的所有标签（包括剧集标签）
  const getVideoAllTags = (video: VideoInfo): string[] => {
    const videoTags = video.tags || [];
    const episodeTags = video.episodes?.flatMap(episode => episode.tags || []) || [];
    return [...new Set([...videoTags, ...episodeTags])]; // 去重
  };

  // 处理封面图片路径，确保能正确显示
  const getCoverImageSrc = (thumbnail?: string): string | null => {
    if (!thumbnail || thumbnail === 'default-.mp4' || thumbnail === 'default-.avi') {
      return null;
    }
    
    // 如果已经是数据URL，直接返回
    if (thumbnail.startsWith('data:')) {
      return thumbnail;
    }
    
    // 检查缓存
    if (imageCache[thumbnail]) {
      return imageCache[thumbnail];
    }
    
    // 如果是本地文件路径，异步转换为数据URL
    if (thumbnail.includes('\\') || thumbnail.includes('/')) {
      // 启动异步转换
      (async () => {
        try {
          const dataUrl = await (window as any).electronAPI?.getImageAsDataUrl(thumbnail);
          if (dataUrl) {
            console.log('成功转换为数据URL:', thumbnail);
            setImageCache(prev => {
              const newCache = { ...prev };
              
              // 如果缓存超过限制，删除最旧的条目
              const cacheKeys = Object.keys(newCache);
              if (cacheKeys.length >= MAX_CACHE_SIZE) {
                // 删除前10个条目
                for (let i = 0; i < 10; i++) {
                  if (cacheKeys[i]) {
                    delete newCache[cacheKeys[i]];
                  }
                }
                console.log('清理图片缓存，保持在限制内');
              }
              
              newCache[thumbnail] = dataUrl;
              return newCache;
            });
          } else {
            console.error('转换数据URL失败:', thumbnail);
          }
        } catch (error) {
          console.error('获取图片数据URL时出错:', error);
        }
      })();
      
      // 返回null，等待异步转换完成
      return null;
    }
    
    return thumbnail;
  };

  // 检测剧集封面图片比例
  const detectEpisodeImageAspectRatio = (imageUrl: string, episodeId: string) => {
    if (!imageUrl) return;
    
    const img = new window.Image();
    img.onload = () => {
      const aspectRatio = img.width / img.height;
      let orientation: 'horizontal' | 'vertical' | 'square';
      
      if (aspectRatio > 1.3) {
        orientation = 'horizontal'; // 横版，如16:9
      } else if (aspectRatio < 0.8) {
        orientation = 'vertical'; // 竖版，如2:3
      } else {
        orientation = 'square'; // 方形，如1:1
      }
      
      setEpisodeCovers(prev => ({
        ...prev,
        [episodeId]: orientation
      }));
    };
    img.src = imageUrl;
  };

  const renderVideoCard = (video: VideoInfo) => {
    const coverSrc = getCoverImageSrc(video.thumbnail);
    const videoTags = getVideoAllTags(video);
    
    return (
      <Card
        key={video.id}
        hoverable
        className="video-card"
        style={{
          border: selectedVideo?.id === video.id ? '2px solid #1890ff' : '1px solid #d9d9d9'
        }}
        cover={
          <div style={{ position: 'relative', height: '360px', overflow: 'hidden' }}>
            {coverSrc ? (
              <Image
                src={coverSrc}
                alt={video.title}
                className="video-thumbnail"
                preview={false}
                style={{
                  width: '100%',
                  height: '360px',
                  objectFit: 'cover',
                  objectPosition: 'center',
                  display: 'block'
                }}
                fallback="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAMIAAADDCAYAAADQvc6UAAABRWlDQ1BJQ0MgUHJvZmlsZQAAKJFjYGASSSwoyGFhYGDIzSspCnJ3UoiIjFJgf8LAwSDCIMogwMCcmFxc4BgQ4ANUwgCjUcG3awyMIPqyLsis7PPOq3QdDFcvjV3jOD1boQVTPQrgSkktTgbSf4A4LbmgqISBgTEFyFYuLykAsTuAbJEioKOA7DkgdjqEvQHEToKwj4DVhAQ5A9k3gGyB5IxEoBmML4BsnSQk8XQkNtReEOBxcfXxUQg1Mjc0dyHgXNJBSWpFCYh2zi+oLMpMzyhRcASGUqqCZ16yno6CkYGRAQMDKMwhqj/fAIcloxgHQqxAjIHBEugw5sUIsSQpBobtQPdLciLEVJYzMPBHMDBsayhILEqEO4DxG0txmrERhM29nYGBddr//5/DGRjYNRkY/l7////39v///y4Dmn+LgeHANwDrkl1AuO+pmgAAADhlWElmTU0AKgAAAAgAAYdpAAQAAAABAAAAGgAAAAAAAqACAAQAAAABAAAAwqADAAQAAAABAAAAwwAAAAD9b/HnAAAHlklEQVR4Ae3dP3Ik1RUG8G+ECB0IHfMKYdRi25EQbZEQ7ZEQ7ZEQ7ZEQ7ZEQ7ZEQ7ZEQ7ZEQ7ZEQ7ZEQ7ZEQ7ZEQ7ZEQy6Eh4NuqefT+c///cz/f5Nla6v7pno2bfVvpfgKA/pRLhgAABAAAAIABAIDAAABAYCAAADAAAQCAgYAAgQAAw0AAKYCAAABhgAAAgQAAwEAAICAAQBgIAAgEAAACAAQBgIAAQCAAABAAADAAABBYCAAQCAAABAAADAAABAYCAAEBAAICAAQBgIAAQEAAACAAABAACAAABAAADBIABAEBAAACAAAABAAABAAADAQAAhYAAAICAAEBAACAAABAACAAABBYCAAQBgIAAQEAAACAAEBAACAAABAACAAABBYCAAQCAAABAAADAAABAYCAAEBAAACAAEBAACAAABAACAAABAYCAAQCAAABAAADAAABAYCAAEBAAICAAQBgIAAQEAAACAAABAACAAABAAAC/8v7j+x8vLy8v"
              />
            ) : (
              <div 
                className="video-thumbnail-placeholder"
                data-text="暂无封面"
              >
                {video.isDirectory ? 
                  <FolderOutlined style={{ fontSize: 42, color: '#6c757d' }} /> : 
                  <PlayCircleOutlined style={{ fontSize: 42, color: '#6c757d' }} />
                }
              </div>
            )}
            {video.isDirectory && (
              <div 
                style={{ 
                  position: 'absolute', 
                  top: 8, 
                  right: 8,
                  background: '#1890ff',
                  color: '#fff',
                  padding: '3px 8px',
                  borderRadius: '12px',
                  fontSize: '11px',
                  fontWeight: '500',
                  zIndex: 10,
                  boxShadow: '0 1px 3px rgba(0, 0, 0, 0.3)',
                  lineHeight: '1.2'
                }}
              >
                {video.episodes?.length || 0} 集
              </div>
            )}
          </div>
        }
        onClick={() => {
          // 调用handleVideoClick来选中视频并自动加载NFO数据
          handleVideoClick(video);
        }}
        onDoubleClick={() => {
          // 双击也调用同样的逻辑
          handleVideoClick(video);
        }}
      >
        <Card.Meta
          title={
            <Tooltip title={video.title} placement="top">
              <div 
                className="video-title" 
                style={{
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap'
                }}
              >
                {video.title}
              </div>
            </Tooltip>
          }
          description={
            <div>
              {/* 显示标签 */}
              <div style={{ marginTop: 8 }}>
                {videoTags.slice(0, 3).map(tagId => {
                  const { name, color } = getTagDisplayName(tagId);
                  return (
                    <Tag 
                      key={tagId}
                      color={color}
                      style={{ marginBottom: 4, fontSize: '12px' }}
                    >
                      {name}
                    </Tag>
                  );
                })}
                {videoTags.length > 3 && (
                  <Tag style={{ marginBottom: 4, fontSize: '12px' }}>
                    +{videoTags.length - 3}
                  </Tag>
                )}
              </div>
            </div>
          }
        />
      </Card>
    );
  };

  const videoActionsItems = [
    {
      key: 'manage-tags',
      label: '标签管理',
      icon: <TagOutlined />,
      onClick: () => setTagManagerVisible(true)
    },
    {
      key: 'add-video-tags',
      label: '为视频添加标签',
      icon: <TagOutlined />,
      onClick: () => {
        if (selectedVideo) {
          handleAddTagsToVideo(selectedVideo);
        }
      },
      disabled: !selectedVideo
    },
    { type: 'divider' },
    {
      key: 'rename-manager',
      label: '重命名管理',
      icon: <EditOutlined />,
      onClick: () => setRenameManagerVisible(true)
    },
    { type: 'divider' },
    {
      key: 'edit-nfo',
      label: '编辑NFO信息',
      icon: <FileTextOutlined />,
      onClick: () => {
        if (selectedVideo) {
          // 如果是剧集，编辑第一个剧集的NFO
          const videoPath = selectedVideo.episodes && selectedVideo.episodes.length > 0 
            ? selectedVideo.episodes[0].path 
            : selectedVideo.path;
          const videoTitle = selectedVideo.episodes && selectedVideo.episodes.length > 0
            ? selectedVideo.episodes[0].title
            : selectedVideo.title;
          
          setSelectedVideoForNFO({ path: videoPath, title: videoTitle });
          setNfoEditorVisible(true);
        }
      },
      disabled: !selectedVideo
    },
    { type: 'divider' },
    {
      key: 'cover',
      label: '设为封面',
      icon: <PictureOutlined />,
      onClick: () => {
        if (selectedVideo) {
          handleSetCover(selectedVideo.id);
        }
      },
      disabled: !selectedVideo
    },
    {
      key: 'covers-folder',
      label: '打开封面文件夹',
      icon: <FolderOutlined />,
      onClick: showCoversDirectory
    },
    { type: 'divider' },
    {
      key: 'shortcuts',
      label: 'FFplay 快捷键',
      icon: <InfoCircleOutlined />,
      onClick: showFFplayKeyboardShortcuts
    }
  ] as any;

  const loadAllTags = async () => {
    try {
      const tags = await (window as any).electronAPI?.getTags() || [];
      setAllTags(tags);
    } catch (error) {
      console.error('加载标签失败:', error);
    }
  };

  // 为视频添加标签
  const handleAddTagsToVideo = (video: VideoInfo) => {
    setCurrentVideoForTags(video);
    setVideoTagsModalVisible(true);
  };

  // 保存视频标签
  const handleSaveVideoTags = async (videoId: string, tagIds: string[]) => {
    try {
      // 找到对应的视频并更新标签
      const updatedVideos = videos.map(video => {
        if (video.id === videoId) {
          return { ...video, tags: tagIds };
        }
        if (video.episodes) {
          const updatedEpisodes = video.episodes.map(episode => 
            episode.id === videoId ? { ...episode, tags: tagIds } : episode
          );
          return { ...video, episodes: updatedEpisodes };
        }
        return video;
      });
      
      setVideos(updatedVideos);
      
      // 保存到数据库
      const videoToUpdate = updatedVideos.find(v => v.id === videoId) || 
        updatedVideos.find(v => v.episodes?.some(e => e.id === videoId))?.episodes?.find(e => e.id === videoId);
      
      if (videoToUpdate) {
        await (window as any).electronAPI?.saveVideoInfo(videoToUpdate);
        message.success('视频标签已更新');
      }
    } catch (error) {
      console.error('保存视频标签失败:', error);
      message.error('保存视频标签失败');
    }
  };

  return (
    <div>
      {/* 第一行：主要操作区域 */}
      <div style={{ marginBottom: 16 }}>
        <Row gutter={[16, 8]} align="middle">
          <Col flex="none">
            <h2 style={{ margin: 0 }}>视频库</h2>
          </Col>
          <Col flex="none">
          <Select
            placeholder="选择分类"
              style={{ width: 180 }}
            value={selectedCategory}
            onChange={setSelectedCategory}
            options={categories.map(cat => ({
              label: cat.name,
              value: cat.id
            }))}
          />
          </Col>
          <Col flex="auto">
            <Search
              placeholder="搜索视频文件..."
            value={searchKeyword}
            onChange={(e) => setSearchKeyword(e.target.value)}
            allowClear
              style={{ maxWidth: 400 }}
          />
          </Col>
          <Col flex="none">
        <Space>
              <Button type="primary" onClick={handleRefresh} loading={loading}>
                重新扫描
          </Button>
              
              
              
              <Dropdown menu={{ items: videoActionsItems }} placement="bottomRight">
                <Button>
                  更多操作 <DownOutlined />
                </Button>
              </Dropdown>
            </Space>
          </Col>
        </Row>
      </div>

            {/* 第二行：标签筛选区域 */}
      <div style={{ marginBottom: 16 }}>
        {/* 紧凑型标签筛选栏 */}
        <div style={{
          background: '#fff',
          borderRadius: '8px',
          border: '1px solid #e8e8e8',
          overflow: 'hidden',
          boxShadow: '0 2px 8px rgba(0,0,0,0.02)'
        }}>
          {/* 紧凑型标题栏 */}
          <div style={{ 
            padding: '12px 16px',
            background: '#fafafa',
            borderBottom: tagFilterExpanded ? '1px solid #e8e8e8' : 'none',
            cursor: 'pointer',
            transition: 'all 0.2s ease'
          }}
          onClick={() => setTagFilterExpanded(!tagFilterExpanded)}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <TagOutlined style={{ color: '#1890ff', fontSize: '14px' }} />
                <span style={{ 
                  fontSize: '14px', 
                  fontWeight: 500,
                  color: '#262626'
                }}>
                  标签筛选
                </span>
                {selectedTags.length > 0 && (
                  <div style={{
                    background: '#1890ff',
                    color: '#fff',
                    borderRadius: '10px',
                    padding: '2px 6px',
                    fontSize: '10px',
                    fontWeight: 500
                  }}>
                    {selectedTags.length}
                  </div>
                )}
                {selectedTags.length > 0 && (
                  <div style={{ display: 'flex', gap: '4px', marginLeft: '8px' }}>
                    {selectedTags.slice(0, 3).map(tagId => {
                      const { name, color } = getTagDisplayName(tagId);
                      return (
                        <div
                          key={tagId}
                          style={{
                            background: color,
                            color: '#fff',
                            padding: '2px 6px',
                            borderRadius: '8px',
                            fontSize: '10px',
                            fontWeight: 500
                          }}
                        >
                          {name}
                        </div>
                      );
                    })}
                    {selectedTags.length > 3 && (
                      <div style={{
                        background: '#999',
                        color: '#fff',
                        padding: '2px 6px',
                        borderRadius: '8px',
                        fontSize: '10px',
                        fontWeight: 500
                      }}>
                        +{selectedTags.length - 3}
                      </div>
                    )}
                  </div>
                )}
              </div>
            
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Button 
                  type="text"
                  size="small"
                  icon={tagFilterExpanded ? <DownOutlined style={{ transform: 'rotate(180deg)', transition: 'transform 0.2s' }} /> : <DownOutlined style={{ transition: 'transform 0.2s' }} />}
                  style={{ color: '#666', fontSize: '12px' }}
                />
                {selectedTags.length > 0 && (
                  <Button 
                    type="text" 
                    size="small" 
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedTags([]);
                    }}
                    style={{ 
                      color: '#ff4d4f',
                      fontSize: '12px',
                      padding: '0 8px'
                    }}
                    icon={<ClearOutlined />}
                  >
                    清除
          </Button>
                )}
              </div>
            </div>
          </div>

          {/* 展开的筛选内容 */}
          {tagFilterExpanded && (
            <div style={{
              padding: '16px',
              background: '#fff'
            }}>
              {/* 搜索框 */}
              <div style={{ marginBottom: '16px' }}>
                <Input
                  placeholder="搜索标签..."
                  prefix={<SearchOutlined />}
                  style={{ width: '100%', maxWidth: '300px' }}
                  value={tagSearchKeyword}
                  onChange={(e) => setTagSearchKeyword(e.target.value)}
                  allowClear
                />
              </div>

              {/* 按分类分组显示标签 */}
              {(() => {
                const tagCategories = [
                  { key: 'genre', label: '类型', color: '#6366f1', icon: '🎭' },
                  { key: 'quality', label: '质量', color: '#10b981', icon: '💎' },
                  { key: 'language', label: '语言', color: '#f59e0b', icon: '🌍' },
                  { key: 'studio', label: '制作方', color: '#8b5cf6', icon: '🎬' },
                  { key: 'custom', label: '自定义', color: '#6b7280', icon: '🏷️' }
                ];

                const groupedTags = allTags.reduce((groups, tag) => {
                  const category = tag.category || 'custom';
                  if (!groups[category]) {
                    groups[category] = [];
                  }
                  groups[category].push(tag);
                  return groups;
                }, {} as Record<string, typeof allTags>);

                // 过滤搜索结果
                const filteredGroupedTags = Object.entries(groupedTags).reduce((filtered, [category, tags]) => {
                  const matchedTags = tags.filter(tag => 
                    !tagSearchKeyword || tag.name.toLowerCase().includes(tagSearchKeyword.toLowerCase())
                  );
                  if (matchedTags.length > 0) {
                    filtered[category] = matchedTags;
                  }
                  return filtered;
                }, {} as Record<string, typeof allTags>);

                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {tagCategories
                      .filter(category => filteredGroupedTags[category.key])
                      .map(category => {
                        const categoryTags = filteredGroupedTags[category.key] || [];
                        
                        return (
                          <div key={category.key}>
                            <div style={{ 
                              fontSize: '13px',
                              fontWeight: 600,
                              color: '#666',
                              marginBottom: '6px',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px'
                            }}>
                              <span>{category.icon}</span>
                              {category.label}
                              <span style={{ color: '#999', fontWeight: 400 }}>({categoryTags.length})</span>
                            </div>
                            
                            <div style={{ 
                              display: 'flex', 
                              flexWrap: 'wrap', 
                              gap: '6px'
                            }}>
                              {categoryTags.map(tag => (
                                <div
                                  key={tag.id}
                                  onClick={() => {
                                    if (selectedTags.includes(tag.id)) {
                                      setSelectedTags(selectedTags.filter(id => id !== tag.id));
                                    } else {
                                      setSelectedTags([...selectedTags, tag.id]);
                                    }
                                  }}
                                  style={{
                                    padding: '4px 10px',
                                    borderRadius: '12px',
                                    fontSize: '12px',
                                    fontWeight: 500,
                                    cursor: 'pointer',
                                    transition: 'all 0.2s ease',
                                    border: `1px solid ${tag.color}`,
                                    background: selectedTags.includes(tag.id) ? tag.color : '#fff',
                                    color: selectedTags.includes(tag.id) ? '#fff' : tag.color,
                                    userSelect: 'none'
                                  }}
                                >
                                  {tag.name}
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                  </div>
                );
              })()}

              {/* 当前筛选条件 */}
              {selectedTags.length > 0 && (
                <div style={{
                  marginTop: '12px',
                  padding: '8px',
                  background: '#f0f9ff',
                  borderRadius: '6px',
                  border: '1px solid #bae6fd'
                }}>
                  <div style={{ 
                    fontSize: '12px', 
                    color: '#0369a1', 
                    marginBottom: '6px', 
                    fontWeight: 500
                  }}>
                    当前筛选条件
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                    {selectedTags.map(tagId => {
                      const { name, color } = getTagDisplayName(tagId);
                      return (
                        <div
                          key={tagId}
                          style={{
                            background: color,
                            color: '#fff',
                            padding: '2px 8px',
                            borderRadius: '10px',
                            fontSize: '11px',
                            fontWeight: 500,
                            display: 'flex',
                            alignItems: 'center',
                            gap: '2px'
                          }}
                        >
                          {name}
                          <span
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedTags(selectedTags.filter(id => id !== tagId));
                            }}
                            style={{
                              cursor: 'pointer',
                              opacity: 0.8,
                              fontSize: '10px',
                              fontWeight: 'bold',
                              marginLeft: '2px'
                            }}
                          >
                            ×
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* 第三行：高级筛选区域 */}
      <div style={{ marginBottom: 16 }}>
        <div style={{
          background: '#fff',
          borderRadius: '8px',
          border: '1px solid #e8e8e8',
          overflow: 'hidden',
          boxShadow: '0 2px 8px rgba(0,0,0,0.02)'
        }}>
          {/* 高级筛选标题栏 */}
          <div style={{ 
            padding: '12px 16px',
            background: '#fafafa',
            borderBottom: advancedFilterExpanded ? '1px solid #e8e8e8' : 'none',
            cursor: 'pointer',
            transition: 'all 0.2s ease'
          }}
          onClick={() => setAdvancedFilterExpanded(!advancedFilterExpanded)}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <FilterOutlined style={{ color: '#52c41a', fontSize: '14px' }} />
                <span style={{ 
                  fontSize: '14px', 
                  fontWeight: 500,
                  color: '#262626'
                }}>
                  高级筛选
                </span>
                {isAdvancedFilterActive() && (
                  <div style={{
                    background: '#52c41a',
                    color: '#fff',
                    borderRadius: '10px',
                    padding: '2px 6px',
                    fontSize: '10px',
                    fontWeight: 500
                  }}>
                    已启用
                  </div>
                )}
              </div>
              
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Button 
                  type="text"
                  size="small"
                  icon={advancedFilterExpanded ? <DownOutlined style={{ transform: 'rotate(180deg)', transition: 'transform 0.2s' }} /> : <DownOutlined style={{ transition: 'transform 0.2s' }} />}
                  style={{ color: '#666', fontSize: '12px' }}
                />
                {isAdvancedFilterActive() && (
                  <Button 
                    type="text" 
                    size="small" 
                    onClick={(e) => {
                      e.stopPropagation();
                      setAdvancedFilters({
                        yearRange: [1900, new Date().getFullYear() + 1],
                        ratingRange: [0, 10],
                        selectedGenres: [],
                        selectedLanguages: [],
                        selectedStudios: [],
                        selectedCountries: [],
                        hasNFO: false
                      });
                    }}
                    style={{ 
                      color: '#ff4d4f',
                      fontSize: '12px',
                      padding: '0 8px'
                    }}
                    icon={<ClearOutlined />}
                  >
                    重置
                  </Button>
                )}
              </div>
            </div>
          </div>

          {/* 展开的高级筛选内容 */}
          {advancedFilterExpanded && (
            <div style={{
              padding: '20px',
              background: '#fff'
            }}>
              {(() => {
                const filterOptions = getFilterOptions(videos);
                
                return (
                  <Row gutter={[24, 16]}>
                    {/* 年份范围 */}
                    <Col span={12}>
                      <div style={{ marginBottom: '8px' }}>
                        <span style={{ fontWeight: 500, fontSize: '14px' }}>📅 年份范围</span>
                      </div>
                      <Slider
                        range
                        min={1900}
                        max={new Date().getFullYear() + 1}
                        value={advancedFilters.yearRange}
                        onChange={(value: number | number[]) => setAdvancedFilters({
                          ...advancedFilters,
                          yearRange: value as [number, number]
                        })}
                        marks={{
                          1900: '1900',
                          1980: '1980',
                          2000: '2000',
                          2020: '2020',
                          [new Date().getFullYear()]: String(new Date().getFullYear())
                        }}
                        tooltip={{
                          formatter: (value?: number) => `${value}年`
                        }}
                        style={{ margin: '0 8px' }}
                      />
                      <div style={{ textAlign: 'center', marginTop: '8px', fontSize: '12px', color: '#666' }}>
                        {advancedFilters.yearRange[0]} - {advancedFilters.yearRange[1]}
                      </div>
                    </Col>

                    {/* 评分范围 */}
                    <Col span={12}>
                      <div style={{ marginBottom: '8px' }}>
                        <span style={{ fontWeight: 500, fontSize: '14px' }}>⭐ 评分范围</span>
                      </div>
                      <Slider
                        range
                        min={0}
                        max={10}
                        step={0.1}
                        value={advancedFilters.ratingRange}
                        onChange={(value: number | number[]) => setAdvancedFilters({
                          ...advancedFilters,
                          ratingRange: value as [number, number]
                        })}
                        marks={{
                          0: '0',
                          2.5: '2.5',
                          5: '5',
                          7.5: '7.5',
                          10: '10'
                        }}
                        tooltip={{
                          formatter: (value?: number) => `${value}分`
                        }}
                        style={{ margin: '0 8px' }}
                      />
                      <div style={{ textAlign: 'center', marginTop: '8px', fontSize: '12px', color: '#666' }}>
                        {advancedFilters.ratingRange[0]} - {advancedFilters.ratingRange[1]} 分
                      </div>
                    </Col>

                    {/* 电影类型 */}
                    <Col span={12}>
                      <div style={{ marginBottom: '8px' }}>
                        <span style={{ fontWeight: 500, fontSize: '14px' }}>🎭 电影类型</span>
                      </div>
                      <Select
                        mode="multiple"
                        placeholder="选择电影类型"
                        style={{ width: '100%' }}
                        value={advancedFilters.selectedGenres}
                        onChange={(value) => setAdvancedFilters({
                          ...advancedFilters,
                          selectedGenres: value
                        })}
                        options={filterOptions.genres.map(genre => ({
                          label: genre,
                          value: genre
                        }))}
                        maxTagCount="responsive"
                      />
                    </Col>

                    {/* 语言 */}
                    <Col span={12}>
                      <div style={{ marginBottom: '8px' }}>
                        <span style={{ fontWeight: 500, fontSize: '14px' }}>🌍 语言</span>
                      </div>
                      <Select
                        mode="multiple"
                        placeholder="选择语言"
                        style={{ width: '100%' }}
                        value={advancedFilters.selectedLanguages}
                        onChange={(value) => setAdvancedFilters({
                          ...advancedFilters,
                          selectedLanguages: value
                        })}
                        options={filterOptions.languages.map(language => ({
                          label: language,
                          value: language
                        }))}
                        maxTagCount="responsive"
                      />
                    </Col>

                    {/* 制作公司 */}
                    <Col span={12}>
                      <div style={{ marginBottom: '8px' }}>
                        <span style={{ fontWeight: 500, fontSize: '14px' }}>🎬 制作公司</span>
                      </div>
                      <Select
                        mode="multiple"
                        placeholder="选择制作公司"
                        style={{ width: '100%' }}
                        value={advancedFilters.selectedStudios}
                        onChange={(value) => setAdvancedFilters({
                          ...advancedFilters,
                          selectedStudios: value
                        })}
                        options={filterOptions.studios.map(studio => ({
                          label: studio,
                          value: studio
                        }))}
                        maxTagCount="responsive"
                      />
                    </Col>

                    {/* 国家/地区 */}
                    <Col span={12}>
                      <div style={{ marginBottom: '8px' }}>
                        <span style={{ fontWeight: 500, fontSize: '14px' }}>🗺️ 国家/地区</span>
                      </div>
                      <Select
                        mode="multiple"
                        placeholder="选择国家/地区"
                        style={{ width: '100%' }}
                        value={advancedFilters.selectedCountries}
                        onChange={(value) => setAdvancedFilters({
                          ...advancedFilters,
                          selectedCountries: value
                        })}
                        options={filterOptions.countries.map(country => ({
                          label: country,
                          value: country
                        }))}
                        maxTagCount="responsive"
                      />
                    </Col>

                                         {/* 其他选项 */}
                    <Col span={24}>
                      <div style={{ marginTop: '8px' }}>
                        <Checkbox
                          checked={advancedFilters.hasNFO}
                          onChange={(e: any) => setAdvancedFilters({
                            ...advancedFilters,
                            hasNFO: e.target.checked
                          })}
                        >
                          <span style={{ fontSize: '14px' }}>📝 仅显示有NFO信息的视频</span>
                        </Checkbox>
                      </div>
                      
                      {/* 调试按钮 */}
                      <div style={{ marginTop: '8px' }}>
                                                <Space>
                          <Button 
                            size="small" 
                            type="dashed"
                            onClick={() => {
                             const nfoVideos = videos.filter(v => (v as any).nfoData);
                             const allCountries = new Set<string>();
                             const nfoDataSummary: any[] = [];
                             
                             nfoVideos.forEach(video => {
                               const nfoData = (video as any).nfoData;
                               if (nfoData?.country) {
                                 allCountries.add(nfoData.country);
                                 nfoDataSummary.push({
                                   title: video.title,
                                   country: nfoData.country,
                                   language: nfoData.language,
                                   year: nfoData.year
                                 });
                               }
                             });
                             
                             console.log('=== NFO数据调试信息 ===');
                             console.log('有NFO数据的视频数量:', nfoVideos.length);
                             console.log('总视频数量:', videos.length);
                             console.log('所有国家/地区:', Array.from(allCountries));
                             console.log('NFO数据详情:', nfoDataSummary);
                             
                             Modal.info({
                               title: 'NFO数据调试信息',
                               width: 800,
                               content: (
                                 <div>
                                   <p><strong>有NFO数据的视频：</strong>{nfoVideos.length} / {videos.length}</p>
                                   <p><strong>检测到的国家/地区：</strong></p>
                                   <div style={{ background: '#f5f5f5', padding: '8px', borderRadius: '4px', marginBottom: '8px' }}>
                                     {Array.from(allCountries).join(', ') || '无'}
                                   </div>
                                   <p><strong>详细信息（前10条）：</strong></p>
                                   <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
                                     {nfoDataSummary.slice(0, 10).map((item, index) => (
                                       <div key={index} style={{ 
                                         padding: '4px 8px', 
                                         borderBottom: '1px solid #eee',
                                         fontSize: '12px'
                                       }}>
                                         <div><strong>{item.title}</strong></div>
                                         <div>国家: {item.country || '无'} | 语言: {item.language || '无'} | 年份: {item.year || '无'}</div>
                                       </div>
                                     ))}
                                   </div>
                                 </div>
                               )
                             });
                           }}
                           style={{ fontSize: '12px' }}
                         >
                           🔍 调试NFO数据
                         </Button>
                         
                         <Button 
                           size="small" 
                           type="primary"
                           onClick={async () => {
                             setLoading(true);
                             try {
                               message.info('正在重新扫描并刷新NFO缓存...');
                               await handleRefresh();
                               message.success('NFO缓存已刷新');
                             } catch (error) {
                               console.error('刷新NFO缓存失败:', error);
                               message.error('刷新NFO缓存失败');
                             } finally {
                               setLoading(false);
                             }
                           }}
                           style={{ fontSize: '12px' }}
                           loading={loading}
                         >
                           🔄 刷新NFO缓存
                         </Button>
                        </Space>
                       </div>
                    </Col>
                  </Row>
                );
              })()}
            </div>
          )}
        </div>
      </div>

      {/* 扫描进度条 */}
      {scanProgress.visible && (
        <div style={{ 
          margin: '16px 0', 
          padding: '16px', 
          background: '#f8f9fa', 
          borderRadius: '8px',
          border: '1px solid #e9ecef'
        }}>
          <div style={{ marginBottom: 8 }}>
            <span>正在扫描视频文件...</span>
            <span style={{ float: 'right' }}>
              {scanProgress.current} / {scanProgress.total} ({scanProgress.percentage}%)
            </span>
          </div>
          <Progress 
            percent={scanProgress.percentage} 
            status="active"
            strokeColor="#1890ff"
          />
          {scanProgress.currentPath && (
            <div style={{ 
              marginTop: 8, 
              fontSize: '12px', 
              color: '#666',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap'
            }}>
              当前: {scanProgress.currentPath}
            </div>
          )}
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: 64 }}>
          <Spin size="large" />
          <div style={{ marginTop: 16 }}>正在加载视频列表...</div>
        </div>
      ) : videos.length === 0 ? (
        <Empty
          description={selectedCategory ? "该分类下暂无视频文件" : "请先选择一个分类"}
          image={Empty.PRESENTED_IMAGE_SIMPLE}
        />
      ) : filterVideos(videos).length === 0 ? (
        <Empty
          description={`没有找到与"${searchKeyword}"相关的视频`}
          image={Empty.PRESENTED_IMAGE_SIMPLE}
        />
      ) : (
        <div className="video-grid">
          {filterVideos(videos).map(renderVideoCard)}
        </div>
      )}

      {/* 视频详情弹窗 */}
      <Modal
        title={selectedVideo?.title}
        width={1000}
        height={600}
        open={!!selectedVideo}
        onCancel={() => {
          setSelectedVideo(null);
          // 清空视频元数据，确保下次打开时不会显示旧数据
          setVideoMetadata(null);
          setIsMetadataForSingleFile(false);
          setNfoData(null);
        }}
        footer={[
          <Button key="cancel" onClick={() => {
            setSelectedVideo(null);
            // 清空视频元数据，确保下次打开时不会显示旧数据
            setVideoMetadata(null);
            setIsMetadataForSingleFile(false);
            setNfoData(null);
          }}>
            关闭
          </Button>
        ]}
        style={{ top: 20 }}
        styles={{
          body: { maxHeight: 'calc(100vh - 200px)', overflowY: 'auto' }
        }}
      >
        {selectedVideo && (
          <div>
            {/* 操作按钮区域 */}
            <div style={{ marginBottom: 16, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <Button 
                icon={<TagOutlined />}
                onClick={() => handleAddTagsToVideo(selectedVideo)}
              >
                管理标签
              </Button>
              <Button 
                icon={<FileTextOutlined />}
                onClick={() => {
                  // 对于剧集和单个视频文件，都使用主路径
                  const videoPath = selectedVideo.path;
                  const videoTitle = selectedVideo.title;
                  
                  setSelectedVideoForNFO({ path: videoPath, title: videoTitle });
                  setNfoEditorVisible(true);
                }}
              >
                编辑NFO
              </Button>
              <Button 
                icon={<InfoCircleOutlined />}
                onClick={() => loadVideoInfo(selectedVideo.path)}
              >
                查看详细信息
              </Button>
            </div>

            {/* 视频封面和播放按钮 - 移到最前面 */}
                <div 
                  style={{ 
                marginBottom: 20,
                padding: 16,
                background: '#f8f9fa',
                    borderRadius: 8,
                display: 'flex',
                alignItems: 'center',
                gap: 16,
                border: '1px solid #e8e8e8'
              }}
            >
              {/* 封面区域 */}
              <div className="video-detail-cover" style={{ flex: '0 0 150px', overflow: 'hidden', borderRadius: 8 }}>
                {getCoverImageSrc(selectedVideo.thumbnail) ? (
                      <Image
                    src={getCoverImageSrc(selectedVideo.thumbnail)!}
                    alt={selectedVideo.title}
                    style={{ 
                      width: 150, 
                      height: 200,
                      objectFit: 'cover',
                      objectPosition: 'center center',
                      borderRadius: 8,
                      display: 'block'
                    }}
                    fallback="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAMIAAADDCAYAAADQvc6UAAABRWlDQ1BJQ0MgUHJvZmlsZQAAKJFjYGASSSwoyGFhYGDIzSspCnJ3UoiIjFJgf8LAwSDCIMogwMCcmFxc4BgQ4ANUwgCjUcG3awyMIPqyLsis7PPOq3QdDFcvjV3jOD1boQVTPQrgSkktTgbSf4A4LbmgqISBgTEFyFYuLykAsTuAbJEioKOA7DkgdjqEvQHEToKwj4DVhAQ5A9k3gGyB5IxEoBmML4BsnSQk8XQkNtReEOBxcfXxUQg1Mjc0dyHgXNJBSWpFCYh2zi+oLMpMzyhRcASGUqqCZ16yno6CkYGRAQMDKMwhqj/fAIcloxgHQqxAjIHBEugw5sUIsSQpBobtQPdLciLEVJYzMPBHMDBsayhILEqEO4DxG0txmrERhM29nYGBddr//5/DGRjYNRkY/l7////39v///y4Dmn+LgeHANwDrkl1AuO+pmgAAADhlWElmTU0AKgAAAAgAAYdpAAQAAAABAAAAGgAAAAAAAqACAAQAAAABAAAAwqADAAQAAAABAAAAwwAAAAD9b/HnAAAHlklEQVR4Ae3dP3Ik1RUG8G+ECB0IHfMKYdRi25EQbZEQ7ZEQ7ZEQ7ZEQ7ZEQ7ZEQ7ZEQ7ZEQ7ZEQ7ZEQ7ZEQ7ZEQ7ZEQy6Eh4NuqefT+c///cz/f5Nla6v7pno2bfVvpfgKA/pRLhgAABAAAAIABAIDAAABAYCAAADAAAQCAgYAAgQAAw0AAKYCAAABhgAAAgQAAwEAAICAAQBgIAAgEAAACAAQBgIAAQCAAABAAADAAABBYCAAQCAAABAAADAAABAYCAAEBAAICAAQBgIAAQEAAACAAABAACAAABAAADBIABAEBAAACAAAABAAABAAADAQAAhYAAAICAAEBAACAAABAACAAABBYCAAQBgIAAQEAAACAAEBAACAAABAACAAABBYCAAQCAAABAAADAAABAYCAAEBAAACAAEBAACAAABAACAAABAYCAAQCAAABAAADAAABAYCAAEBAAICAAQBgIAAQEAAACAAABAACAAABAAAC/8v7j+x8vLy8v"
                      />
                    ) : (
                    <div 
                      className="video-thumbnail-placeholder"
                      style={{
                        width: 150,
                        height: 200,
                        borderRadius: 8
                      }}
                    >
                    {selectedVideo.isDirectory ? 
                      <FolderOutlined style={{ fontSize: 32, color: '#999' }} /> : 
                      <PlayCircleOutlined style={{ fontSize: 32, color: '#999' }} />
                    }
                    </div>
                  )}
                </div>

              {/* 信息和操作区域 */}
                <div style={{ flex: 1 }}>
                <div style={{ marginBottom: 12 }}>
                  <h3 style={{ margin: 0, marginBottom: 8, fontSize: '18px' }}>
                    {selectedVideo.title}
                  </h3>
                  <p style={{ margin: 0, color: '#666', fontSize: '13px' }}>
                    {selectedVideo.isDirectory ? '剧集文件夹' : '视频文件'}
                    {selectedVideo.episodes && ` • ${selectedVideo.episodes.length} 集`}
                  </p>
                </div>

                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <Button 
                      type="primary"
                    icon={<PlayCircleOutlined />}
                    onClick={!selectedVideo.isDirectory ? async () => {
                      console.log('🎮 单个视频播放按钮被点击');
                      console.log('🆔 视频ID:', selectedVideo.id);
                      console.log('📂 前端缓存路径:', selectedVideo.path);
                      
                      try {
                        // 🔥 强制从数据库获取最新视频信息（和剧集播放保持一致）
                        console.log('📥 强制从数据库获取最新视频信息...');
                        const dbVideos = await (window as any).electronAPI?.getAllVideos() || [];
                        
                        const findVideoById = (videoList: VideoInfo[], videoId: string): VideoInfo | null => {
                          for (const video of videoList) {
                            if (video.id === videoId) return video;
                            if (video.episodes) {
                              for (const episode of video.episodes) {
                                if (episode.id === videoId) return episode;
                              }
                            }
                          }
                          return null;
                        };
                        
                        const latestVideo = findVideoById(dbVideos, selectedVideo.id);
                        
                        if (!latestVideo) {
                          console.error('❌ 数据库中未找到视频:', selectedVideo.id);
                          message.error('视频不存在');
                          return;
                        }
                        
                        console.log('✅ 找到最新视频信息:');
                        console.log('  📁 数据库最新路径:', latestVideo.path);
                        console.log('  🏷️ 视频标题:', latestVideo.title);
                        
                        // 对比路径是否变化
                        if (selectedVideo.path !== latestVideo.path) {
                          console.log('🔄 检测到路径变化:');
                          console.log('  📂 前端缓存:', selectedVideo.path);
                          console.log('  📁 数据库最新:', latestVideo.path);
                          message.info('检测到文件路径更新，使用最新路径播放', 2);
                        }
                        
                        // 🎯 使用数据库的最新视频信息播放
                        console.log('🎬 使用最新视频信息播放...');
                        await handlePlay(latestVideo.path, latestVideo);
                        
                      } catch (error) {
                        console.error('💥 单个视频播放失败:', error);
                        message.error('播放失败：' + (error instanceof Error ? error.message : String(error)));
                      }
                    } : undefined}
                    disabled={selectedVideo.isDirectory}
                  >
                    {selectedVideo.isDirectory ? '选择剧集播放' : '播放'}
                  </Button>
                  
                  <Button 
                    icon={<CameraOutlined />}
                      onClick={() => handleSetCover(selectedVideo.id)}
                    >
                    设为封面
                    </Button>
                    
                    {/* 添加调试按钮 - 仅在开发环境显示 */}
                    {process.env.NODE_ENV === 'development' && (
                      <Button 
                        icon={<ReloadOutlined />}
                        onClick={async () => {
                          console.log('🔧 手动数据同步开始...');
                          const currentVideoId = selectedVideo?.id;
                          
                          try {
                            // 强制重新加载视频列表
                            if (selectedCategory) {
                              console.log('🔄 重新加载视频列表...');
                              await loadVideos(selectedCategory);
                              
                              // 重新获取数据库数据
                              const allVideos = await (window as any).electronAPI?.getAllVideos() || [];
                              console.log('📥 获取到最新数据库视频总数:', allVideos.length);
                              
                              // 查找并更新selectedVideo
                              if (currentVideoId) {
                                const findVideoById = (videoList: VideoInfo[], videoId: string): VideoInfo | null => {
                                  for (const video of videoList) {
                                    if (video.id === videoId) return video;
                                    if (video.episodes) {
                                      for (const episode of video.episodes) {
                                        if (episode.id === videoId) return episode;
                                      }
                                    }
                                  }
                                  return null;
                                };
                                
                                const updatedVideo = findVideoById(allVideos, currentVideoId);
                                if (updatedVideo) {
                                  console.log('🎯 找到最新视频对象，更新selectedVideo');
                                  console.log('  📁 最新路径:', updatedVideo.path);
                                  setSelectedVideo(updatedVideo);
                                  message.success('数据同步完成');
                                } else {
                                  console.warn('❌ 未找到对应的视频对象');
                                  message.warning('未找到对应的视频');
                                }
                              }
                            }
                          } catch (error) {
                            console.error('💥 手动同步失败:', error);
                            message.error('数据同步失败');
                          }
                        }}
                        type="dashed"
                        size="small"
                      >
                        🔧调试
                      </Button>
                    )}
                      </div>
              </div>
            </div>

            {/* 视频标签显示 */}
            <div style={{ marginBottom: 16 }}>
              <h4>标签：</h4>
              <div style={{ marginTop: 8 }}>
                {getVideoAllTags(selectedVideo).map(tagId => {
                  const { name, color } = getTagDisplayName(tagId);
                  return (
                    <Tag key={tagId} color={color} style={{ marginBottom: 4 }}>
                      {name}
                    </Tag>
                  );
                })}
                {getVideoAllTags(selectedVideo).length === 0 && (
                  <span style={{ color: '#999' }}>暂无标签</span>
                )}
                </div>
              </div>

            {/* NFO信息显示 */}
            {(nfoData || loadingNfo) && (
              <div style={{ marginBottom: 16 }}>
                <div style={{
                  background: '#fff',
                  borderRadius: '8px',
                  border: '1px solid #e8e8e8',
                  overflow: 'hidden'
                }}>
                  <div style={{
                    padding: '12px 16px',
                    background: 'linear-gradient(90deg, #52c41a 0%, #73d13d 100%)',
                    borderBottom: '1px solid #e8e8e8'
                  }}>
                    <h4 style={{ 
                      margin: 0, 
                      color: '#fff', 
                      display: 'flex', 
                      alignItems: 'center', 
                      gap: '8px' 
                    }}>
                      <FileTextOutlined />
                      NFO信息
                      {loadingNfo && (
                        <Spin size="small" style={{ marginLeft: 'auto' }} />
                      )}
                    </h4>
            </div>
                  <div style={{ padding: '16px' }}>
                    {loadingNfo ? (
                      <div style={{ textAlign: 'center', color: '#666' }}>
                        正在加载NFO信息...
                      </div>
                    ) : nfoData ? (
                      <div>
                        <Row gutter={[16, 8]}>
                          {nfoData.originalTitle && (
                            <Col span={24}>
                              <div><strong>标题：</strong>{nfoData.originalTitle}</div>
                            </Col>
                          )}
                          {nfoData.year && (
                            <Col span={12}>
                              <div><strong>年份：</strong>{nfoData.year}</div>
                            </Col>
                          )}
                          {nfoData.rating && (
                            <Col span={12}>
                              <div><strong>评分：</strong>{nfoData.rating}/10</div>
                            </Col>
                          )}
                          {nfoData.runtime && (
                            <Col span={12}>
                              <div><strong>时长：</strong>{nfoData.runtime} 分钟</div>
                            </Col>
                          )}
                          {nfoData.studio && (
                            <Col span={12}>
                              <div><strong>制作方：</strong>{nfoData.studio}</div>
                            </Col>
                          )}
                          {nfoData.genre && nfoData.genre.length > 0 && (
                            <Col span={24}>
                              <div style={{ marginBottom: 8 }}>
                                <strong>类型：</strong>
                                <div style={{ marginTop: 4 }}>
                                  {nfoData.genre.map((genre: string, index: number) => (
                                    <Tag key={index} color="green" style={{ marginBottom: 4 }}>
                                      {genre}
                                    </Tag>
                                  ))}
                                </div>
                              </div>
                            </Col>
                          )}
                          {nfoData.director && nfoData.director.length > 0 && (
                            <Col span={24}>
                              <div><strong>导演：</strong>{nfoData.director.join(', ')}</div>
                            </Col>
                          )}
                          {nfoData.actors && nfoData.actors.length > 0 && (
                            <Col span={24}>
                              <div>
                                <strong>演员：</strong>
                                {nfoData.actors.slice(0, 5).join(', ')}
                                {nfoData.actors.length > 5 && ' 等'}
                              </div>
                            </Col>
                          )}
                          {nfoData.plot && (
                            <Col span={24}>
                              <div style={{
                                marginTop: 8,
                                padding: 12,
                                background: '#f9f9f9',
                                borderRadius: 6,
                                borderLeft: '4px solid #52c41a'
                              }}>
                                <strong>剧情简介：</strong>
                                <div style={{ marginTop: 4, lineHeight: '1.6' }}>
                                  {nfoData.plot}
                                </div>
                              </div>
                            </Col>
                          )}
                          {(nfoData.imdbId || nfoData.tmdbId || nfoData.tvdbId) && (
                            <Col span={24}>
                              <div style={{ marginTop: 8 }}>
                                <strong>外部链接：</strong>
                                <div style={{ marginTop: 4 }}>
                                  {nfoData.imdbId && (
                                    <Tag color="orange" style={{ marginBottom: 4 }}>
                                      IMDb: {nfoData.imdbId}
                                    </Tag>
                                  )}
                                  {nfoData.tmdbId && (
                                    <Tag color="blue" style={{ marginBottom: 4 }}>
                                      TMDb: {nfoData.tmdbId}
                                    </Tag>
                                  )}
                                  {nfoData.tvdbId && (
                                    <Tag color="purple" style={{ marginBottom: 4 }}>
                                      TVDb: {nfoData.tvdbId}
                                    </Tag>
                                  )}
                                </div>
                              </div>
                            </Col>
                          )}
                        </Row>
                      </div>
                    ) : (
                      <div style={{ textAlign: 'center', color: '#999' }}>
                        暂无NFO信息
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}



            {/* 查看详细信息标签页 */}
                                    {(
              <div style={{
                background: '#fff',
                borderRadius: '8px',
                border: '1px solid #e8e8e8',
                overflow: 'hidden'
              }}>
                  <div style={{
                  padding: '12px 16px',
                  background: 'linear-gradient(90deg, #1890ff 0%, #40a9ff 100%)',
                  borderBottom: '1px solid #e8e8e8'
                }}>
                  <h4 style={{ 
                    margin: 0, 
                    color: '#fff', 
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px' 
                  }}>
                    <InfoCircleOutlined />
                    {selectedVideo.isDirectory ? '剧集信息' : '视频详细信息'}
                    <Button
                      size="small"
                      type="primary"
                      ghost
                      loading={loadingMetadata}
                      onClick={() => loadVideoInfo(selectedVideo.path)}
                      style={{ marginLeft: 'auto', borderColor: '#fff', color: '#fff' }}
                    >
                      {selectedVideo.isDirectory ? '获取剧集信息' : '获取信息'}
                    </Button>
                  </h4>
                  </div>
                <div style={{ padding: '20px' }}>
                  <Spin spinning={loadingMetadata}>
                    {videoMetadata ? (
                      <div>
                        {selectedVideo.isDirectory && !isMetadataForSingleFile ? (
                          // 剧集信息显示
                          <div>
                            <div style={{
                              background: '#f0f8ff',
                              padding: '16px',
                              borderRadius: '8px',
                              marginBottom: '16px',
                              border: '1px solid #91d5ff'
                            }}>
                              <h4 style={{ margin: '0 0 8px 0', color: '#1890ff' }}>📁 剧集文件夹信息</h4>
                              <p style={{ margin: 0, color: '#666' }}>
                                此文件夹包含 <strong>{selectedVideo.episodes?.length || 0}</strong> 个视频文件
                              </p>
                            </div>
                            
                        <Descriptions
                          bordered
                          column={2}
                          size="small"
                          styles={{
                                label: { fontWeight: 'bold', background: '#fafafa' }
                          }}
                        >
                          <Descriptions.Item 
                                label={<span><FileTextOutlined /> 文件夹名</span>} 
                            span={2}
                          >
                                {videoMetadata.fileName || selectedVideo.title}
                          </Descriptions.Item>
                          
                              <Descriptions.Item label="文件数量" span={2}>
                                <Tag color="blue">{selectedVideo.episodes?.length || 0} 集</Tag>
                          </Descriptions.Item>
                          
                          <Descriptions.Item label="创建时间" span={2}>
                                {videoMetadata.createTime ? formatDate(videoMetadata.createTime) : '未知'}
                          </Descriptions.Item>
                          
                          <Descriptions.Item label="修改时间" span={2}>
                                {videoMetadata.modifyTime ? formatDate(videoMetadata.modifyTime) : '未知'}
                          </Descriptions.Item>
                          
                              <Descriptions.Item label="文件夹路径" span={2}>
                            <div style={{ 
                              wordBreak: 'break-all', 
                              fontSize: '12px', 
                              color: '#666',
                              background: '#f5f5f5',
                              padding: '4px 8px',
                              borderRadius: '4px'
                            }}>
                                  {videoMetadata.filePath || selectedVideo.path}
                            </div>
                          </Descriptions.Item>
                        </Descriptions>
                            
                            <div style={{
                              marginTop: '16px',
                              padding: '12px',
                              background: '#fff7e6',
                              borderRadius: '6px',
                              border: '1px solid #ffd591'
                            }}>
                              <p style={{ margin: 0, fontSize: '14px', color: '#d46b08' }}>
                                💡 <strong>提示：</strong>要查看具体视频文件的详细信息，请点击下方剧集列表中的"信息"按钮
                              </p>
                            </div>
                      </div>
                    ) : (
                          // 单个视频信息显示（包括剧集中的单个文件）
                          <div>
                            {isMetadataForSingleFile && (
                      <div style={{
                                background: '#f6ffed',
                                padding: '12px',
                                borderRadius: '6px',
                                marginBottom: '16px',
                                border: '1px solid #b7eb8f'
                              }}>
                                <p style={{ margin: 0, fontSize: '14px', color: '#389e0d' }}>
                                  🎬 <strong>剧集文件信息：</strong>{videoMetadata.fileName}
                                </p>
              </div>
            )}

                  <Descriptions
                    bordered
                    column={2}
                    size="small"
                    styles={{
                      label: { fontWeight: 'bold', background: '#fafafa' }
                    }}
                  >
                    <Descriptions.Item 
                      label={<span><FileTextOutlined /> 文件名</span>} 
                      span={2}
                    >
                      {videoMetadata.fileName}
                    </Descriptions.Item>
                    
                    <Descriptions.Item 
                      label={<span><ClockCircleOutlined /> 时长</span>}
                    >
                      <Tag color="blue">{videoMetadata.duration}</Tag>
                    </Descriptions.Item>
                    
                    <Descriptions.Item 
                      label={<span><DesktopOutlined /> 分辨率</span>}
                    >
                      <Tag color="green">{videoMetadata.resolution}</Tag>
                    </Descriptions.Item>
                    
                    <Descriptions.Item label="文件大小">
                      <Tag color="orange">{videoMetadata.fileSize}</Tag>
                    </Descriptions.Item>
                    
                    <Descriptions.Item label="文件格式">
                      <Tag color="purple">{videoMetadata.extension.toUpperCase()}</Tag>
                    </Descriptions.Item>
                    
                    <Descriptions.Item label="视频编码">
                      <Tag color="cyan">{videoMetadata.codec}</Tag>
                    </Descriptions.Item>
                    
                    <Descriptions.Item label="码率">
                      <Tag color="magenta">{videoMetadata.bitrate}</Tag>
                    </Descriptions.Item>
                    
                    <Descriptions.Item label="帧率">
                      <Tag color="volcano">{videoMetadata.frameRate}</Tag>
                    </Descriptions.Item>
                    
                    <Descriptions.Item 
                      label={<span><SoundOutlined /> 音频编码</span>}
                    >
                      <Tag color="gold">{videoMetadata.audioCodec}</Tag>
                    </Descriptions.Item>
                    
                    <Descriptions.Item label="创建时间" span={2}>
                      {formatDate(videoMetadata.createTime)}
                    </Descriptions.Item>
                    
                    <Descriptions.Item label="修改时间" span={2}>
                      {formatDate(videoMetadata.modifyTime)}
                    </Descriptions.Item>
                              
                              <Descriptions.Item label="文件路径" span={2}>
                                <div style={{ 
                                  wordBreak: 'break-all', 
                                  fontSize: '12px', 
                                  color: '#666',
                                  background: '#f5f5f5',
                                  padding: '4px 8px',
                                  borderRadius: '4px'
                                }}>
                                  {videoMetadata.filePath}
                                </div>
                    </Descriptions.Item>
                  </Descriptions>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div style={{
                        textAlign: 'center',
                        padding: '30px',
                        background: '#fff',
                        borderRadius: '8px',
                        border: '2px dashed #e8e8e8'
                      }}>
                        <InfoCircleOutlined style={{ fontSize: '36px', color: '#ccc', marginBottom: '12px' }} />
                        <p style={{ color: '#999', margin: 0, fontSize: '14px' }}>
                          点击"获取信息"按钮查看{selectedVideo.isDirectory ? '剧集' : '视频'}详细信息
                        </p>
                      </div>
                    )}
                  </Spin>
                </div>
              </div>
            )}

            {/* 剧集列表 - 仅在有剧集时显示 */}
            {selectedVideo.episodes && selectedVideo.episodes.length > 0 && (
              <div style={{ 
                marginTop: 24, 
                padding: '16px 20px', 
                background: '#f8f9fa', 
                borderRadius: 8,
                border: '1px solid #e9ecef'
              }}>
                {/* 标题和排序按钮 */}
                <div style={{ 
                  display: 'flex', 
                  justifyContent: 'space-between', 
                  alignItems: 'center', 
                  marginBottom: 16
                }}>
                  <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600 }}>
                    📺 剧集列表 ({selectedVideo.episodes.length} 集) 
                  </h3>
                  <Dropdown
                    menu={{
                      items: [
                        {
                          key: 'episode',
                          label: '按集数排序',
                          onClick: () => setSortType('episode')
                        },
                        {
                          key: 'name',
                          label: '按文件名排序',
                          onClick: () => setSortType('name')
                        },
                        {
                          key: 'original',
                          label: '原始顺序',
                          onClick: () => setSortType('original')
                        }
                      ]
                    }}
                    trigger={['click']}
                  >
                    <Button icon={<SortAscendingOutlined />} size="small">
                      排序 {sortType === 'episode' ? '(集数)' : sortType === 'name' ? '(文件名)' : '(原始)'}
                    </Button>
                  </Dropdown>
                </div>
                
                {/* 剧集网格 */}
                <div style={{ 
                  display: 'grid', 
                  gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', 
                  gap: 16, 
                  maxHeight: 'calc(100vh - 400px)',
                  overflowY: 'auto',
                  padding: '8px 0'
                }}>
                  {sortEpisodes(selectedVideo.episodes).map((episode, index) => {
                // 优先使用剧集自己的封面，如果没有则使用主视频的封面作为默认
                const episodeCoverSrc = getCoverImageSrc(episode.thumbnail);
                const defaultCoverSrc = getCoverImageSrc(selectedVideo.thumbnail);
                const finalCoverSrc = episodeCoverSrc || defaultCoverSrc;
                
                return (
                  <Card
                    key={episode.id}
                    className={`episode-card ${episodeCovers[episode.id] || 'horizontal'}`}
                    size="small"
                    hoverable
                    style={{ 
                      cursor: 'pointer',
                      transition: 'all 0.2s ease'
                    }}
                    onClick={async () => {
                      console.log('🎮 剧集播放按钮被点击');
                      console.log('🆔 剧集ID:', episode.id);
                      console.log('📂 前端缓存路径:', episode.path);
                      
                      try {
                        // 🔥 强制从数据库获取最新剧集信息
                        console.log('📥 强制从数据库获取最新剧集信息...');
                        const dbVideos = await (window as any).electronAPI?.getAllVideos() || [];
                        
                        const findEpisodeById = (videoList: VideoInfo[], episodeId: string): VideoInfo | null => {
                          for (const video of videoList) {
                            if (video.episodes) {
                              for (const ep of video.episodes) {
                                if (ep.id === episodeId) return ep;
                              }
                            }
                          }
                          return null;
                        };
                        
                        const latestEpisode = findEpisodeById(dbVideos, episode.id);
                        
                        if (!latestEpisode) {
                          console.error('❌ 数据库中未找到剧集:', episode.id);
                          message.error('剧集不存在');
                          return;
                        }
                        
                        console.log('✅ 找到最新剧集信息:');
                        console.log('  📁 数据库最新路径:', latestEpisode.path);
                        console.log('  🏷️ 剧集标题:', latestEpisode.title);
                        
                        // 对比路径是否变化
                        if (episode.path !== latestEpisode.path) {
                          console.log('🔄 检测到路径变化:');
                          console.log('  📂 前端缓存:', episode.path);
                          console.log('  📁 数据库最新:', latestEpisode.path);
                          message.info('检测到文件路径更新，使用最新路径播放', 2);
                        }
                        
                        // 🎯 使用数据库的最新剧集信息播放
                        console.log('🎬 使用最新剧集信息播放...');
                        await handlePlay(latestEpisode.path, latestEpisode, true, selectedVideo.title);
                        
                      } catch (error) {
                        console.error('💥 剧集播放失败:', error);
                        message.error('播放失败：' + (error instanceof Error ? error.message : String(error)));
                      }
                    }}
                    cover={
                      <div style={{ position: 'relative' }}>
                        {finalCoverSrc ? (
                          <Image
                            src={finalCoverSrc}
                            alt={episode.title}
                            className="video-thumbnail"
                            preview={false}
                            onLoad={() => {
                              // 当图片加载完成后检测其比例
                              detectEpisodeImageAspectRatio(finalCoverSrc, episode.id);
                            }}
                            fallback="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAMIAAADDCAYAAADQvc6UAAABRWlDQ1BJQ0MgUHJvZmlsZQAAKJFjYGASSSwoyGFhYGDIzSspCnJ3UoiIjFJgf8LAwSDCIMogwMCcmFxc4BgQ4ANUwgCjUcG3awyMIPqyLsis7PPOq3QdDFcvjV3jOD1boQVTPQrgSkktTgbSf4A4LbmgqISBgTEFyFYuLykAsTuAbJEioKOA7DkgdjqEvQHEToKwj4DVhAQ5A9k3gGyB5IxEoBmML4BsnSQk8XQkNtReEOBxcfXxUQg1Mjc0dyHgXNJBSWpFCYh2zi+oLMpMzyhRcASGUqqCZ16yno6CkYGRAQMDKMwhqj/fAIcloxgHQqxAjIHBEugw5sUIsSQpBobtQPdLciLEVJYzMPBHMDBsayhILEqEO4DxG0txmrERhM29nYGBddr//5/DGRjYNRkY/l7////39v///y4Dmn+LgeHANwDrkl1AuO+pmgAAADhlWElmTU0AKgAAAAgAAYdpAAQAAAABAAAAGgAAAAAAAqACAAQAAAABAAAAwqADAAQAAAABAAAAwwAAAAD9b/HnAAAHlklEQVR4Ae3dP3Ik1RUG8G+ECB0IHfMKYdRi25EQbZEQ7ZEQ7ZEQ7ZEQ7ZEQ7ZEQ7ZEQ7ZEQ7ZEQ7ZEQ7ZEQ7ZEQ7ZEQy6Eh4NuqefT+c///cz/f5Nla6f7pno2bfVvpfgKA/pRLhgAABAAAAIABAIDAAABAYCAAADAAAQCAgYAAgQAAw0AAKYCAAABhgAAAgQAAwEAAICAAQBgIAAgEAAACAAQBgIAAQCAAABAAADAAABBYCAAQCAAABAAADAAABAYCAAEBAAICAAQBgIAAQEAAACAAABAACAAABAAADBIABAEBAAACAAAABAAABAAADAQAAhYAAAICAAEBAACAAABAACAAABBYCAAQBgIAAQEAAACAAEBAACAAABAACAAABBYCAAQCAAABAAADAAABAYCAAEBAAACAAEBAACAAABAACAAABAYCAAQCAAABAAADAAABAYCAAEBAAICAAQBgIAAQEAAACAAABAACAAABAAAC/8v7j+x8vLy8v"
                          />
                        ) : (
                          <div 
                            className="video-thumbnail-placeholder"
                            data-text="暂无封面"
                          >
                            <PlayCircleOutlined style={{ fontSize: 32, color: '#6c757d' }} />
                          </div>
                        )}
                        {/* 播放悬停提示 */}
                        <div 
                          style={{
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            right: 0,
                            bottom: 0,
                            background: 'rgba(0,0,0,0)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            transition: 'background 0.3s ease',
                            opacity: 0
                          }}
                          className="play-overlay"
                        >
                          <PlayCircleOutlined 
                            style={{ 
                              fontSize: 40, 
                              color: '#fff',
                              filter: 'drop-shadow(0 0 8px rgba(0,0,0,0.8))'
                            }} 
                          />
                        </div>
                      </div>
                    }
                    actions={[
                      <Button 
                        key="info"
                        size="small"
                        icon={<InfoCircleOutlined />}
                        onClick={(e) => {
                          e.stopPropagation();
                          loadVideoInfo(episode.path);
                        }}
                        style={{ flex: 1 }}
                      >
                        信息
                      </Button>,
                      <Button 
                        key="cover"
                        size="small"
                        icon={<CameraOutlined />}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSetCover(episode.id);
                        }}
                        style={{ flex: 1 }}
                      >
                        封面
                      </Button>
                    ]}
                  >
                    <Card.Meta
                      title={
                        <Tooltip 
                          title={(() => {
                            // 只有在剧集数量>=6且按集数排序时才显示"第X集"，避免电影等被误识别
                            if (selectedVideo.episodes && selectedVideo.episodes.length >= 6 && sortType === 'episode') {
                              const episodeNumber = extractEpisodeNumber(episode.title, index + 1);
                              return `第 ${episodeNumber} 集`;
                            } else {
                              // 其他情况显示项目编号
                              return `第 ${index + 1} 项`;
                            }
                          })()} 
                          placement="top"
                        >
                          <div style={{
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap'
                          }}>
                            {(() => {
                              // 只有在剧集数量>=6且按集数排序时才显示"第X集"，避免电影等被误识别
                              if (selectedVideo.episodes && selectedVideo.episodes.length >= 6 && sortType === 'episode') {
                                const episodeNumber = extractEpisodeNumber(episode.title, index + 1);
                                return `第 ${episodeNumber} 集`;
                              } else {
                                // 其他情况显示项目编号
                                return `第 ${index + 1} 项`;
                              }
                            })()}
                          </div>
                        </Tooltip>
                      }
                      description={
                        <Tooltip title={episode.title} placement="bottom">
                          <div style={{
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap'
                          }}>
                            {episode.title}
                          </div>
                        </Tooltip>
                      }
                    />
                  </Card>
                );
              })}
                </div>
              </div>
            )}


          </div>
                )}
      </Modal>

      
        
               {/* 原始Ant Design Modal - 备用方案 */}
        <Modal
          title="🎬 修复后的视频详情"
          open={false}
          onCancel={() => {
            setSelectedVideo(null);
            setVideoMetadata(null);
            setIsMetadataForSingleFile(false);
            setNfoData(null);
          }}
          width={1000}
          centered={true}
          destroyOnClose={true}
          maskClosable={true}
          styles={{
            body: { 
              maxHeight: 'calc(100vh - 200px)', 
              overflowY: 'auto' 
            }
          }}
        >
        {selectedVideo && (
          <div>
            {/* 简化的视频信息显示 */}
            <div style={{ marginBottom: 16 }}>
              <h3>🎬 视频详情</h3>
              <p><strong>标题：</strong>{selectedVideo.title}</p>
              <p><strong>路径：</strong>{selectedVideo.path}</p>
              <p><strong>类型：</strong>{selectedVideo.isDirectory ? '剧集文件夹' : '视频文件'}</p>
            </div>

            {/* 操作按钮 */}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <Button 
                type="primary"
                icon={<PlayCircleOutlined />}
                onClick={() => {
                  console.log('🎮 播放按钮被点击');
                  if (!selectedVideo.isDirectory) {
                    handlePlay(selectedVideo.path, selectedVideo);
                  }
                }}
                disabled={selectedVideo.isDirectory}
              >
                {selectedVideo.isDirectory ? '选择剧集播放' : '播放'}
              </Button>
              
              <Button 
                icon={<TagOutlined />}
                onClick={() => handleAddTagsToVideo(selectedVideo)}
              >
                管理标签
              </Button>
            </div>
          </div>
        )}
      </Modal>
      
      {/* 标签管理器 */}
      <TagManager
        visible={tagManagerVisible}
        onClose={() => setTagManagerVisible(false)}
        onTagsChange={() => {
          // 标签变化后重新加载标签和视频列表
          loadAllTags();
          if (selectedCategory) {
            loadVideos(selectedCategory);
          }
        }}
      />
      
      {/* 为视频添加标签的模态框 */}
      <Modal
        title={`为视频添加标签 - ${currentVideoForTags?.title}`}
        open={videoTagsModalVisible}
        onCancel={() => {
          setVideoTagsModalVisible(false);
          setCurrentVideoForTags(null);
        }}
        onOk={async () => {
          if (currentVideoForTags) {
            const selectedTagIds = allTags
              .filter(tag => (currentVideoForTags.tags || []).includes(tag.id))
              .map(tag => tag.id);
            await handleSaveVideoTags(currentVideoForTags.id, selectedTagIds);
            setVideoTagsModalVisible(false);
            setCurrentVideoForTags(null);
          }
        }}
        width={600}
      >
        {currentVideoForTags && (
          <div>
            <div style={{ marginBottom: 16 }}>
              <h4>当前标签：</h4>
              <div style={{ marginTop: 8 }}>
                {(currentVideoForTags.tags || []).map(tagId => {
                  const { name, color } = getTagDisplayName(tagId);
                  return (
                    <Tag key={tagId} color={color} style={{ marginBottom: 4 }}>
                      {name}
                    </Tag>
                  );
                })}
                {(!currentVideoForTags.tags || currentVideoForTags.tags.length === 0) && (
                  <span style={{ color: '#999' }}>暂无标签</span>
                )}
              </div>
            </div>
            
            <div>
              <h4>选择标签：</h4>
              <div style={{ marginTop: 8, maxHeight: 300, overflowY: 'auto' }}>
                {allTags.map(tag => (
                  <Tag.CheckableTag
                    key={tag.id}
                    checked={(currentVideoForTags.tags || []).includes(tag.id)}
                    onChange={(checked) => {
                      const updatedTags = checked
                        ? [...(currentVideoForTags.tags || []), tag.id]
                        : (currentVideoForTags.tags || []).filter(id => id !== tag.id);
                      setCurrentVideoForTags({
                        ...currentVideoForTags,
                        tags: updatedTags
                      });
                    }}
                    style={{ 
                      margin: '4px',
                      backgroundColor: (currentVideoForTags.tags || []).includes(tag.id) ? tag.color : undefined,
                      borderColor: tag.color,
                      color: (currentVideoForTags.tags || []).includes(tag.id) ? '#fff' : tag.color
                    }}
                  >
                    {tag.name}
                  </Tag.CheckableTag>
                ))}
              </div>
            </div>
          </div>
        )}
      </Modal>
      
      {/* NFO编辑器 */}
      {selectedVideoForNFO && (
        <NFOEditor
          visible={nfoEditorVisible}
          videoPath={selectedVideoForNFO.path}
          videoTitle={selectedVideoForNFO.title}
          onClose={() => {
            setNfoEditorVisible(false);
            setSelectedVideoForNFO(null);
          }}
          onSave={(nfoData) => {
            // NFO保存后可以刷新视频信息
            console.log('NFO数据已保存:', nfoData);
            if (selectedCategory) {
              loadVideos(selectedCategory);
            }
          }}
        />
      )}
      
      {/* 重命名管理器 */}
      <RenameManager
        visible={renameManagerVisible}
        onClose={() => setRenameManagerVisible(false)}
        videos={videos}
        onVideosUpdated={async () => {
          console.log('🔄🔄🔄 VideoLibrary onVideosUpdated 被调用！ 🔄🔄🔄');
          console.log('🕐 调用时间:', new Date().toLocaleTimeString());
          console.log('📋 当前选中分类:', selectedCategory);
          console.log('🎥 当前选中视频:', selectedVideo?.title, selectedVideo?.path);
          
          // 保存当前选中视频的ID，用于后续更新
          const currentVideoId = selectedVideo?.id;
          
          // 添加短暂延迟，确保数据库写入完成
          console.log('⏳ 等待数据库同步完成...');
          await new Promise(resolve => setTimeout(resolve, 100)); // 100ms延迟
          
          // 重命名完成后重新加载当前分类的视频
          if (selectedCategory) {
            console.log('⏳ 开始重新加载视频列表...');
            await loadVideos(selectedCategory);
            console.log('✅ 视频列表重新加载完成');
            
            // 如果之前有选中的视频，需要更新selectedVideo对象
            if (currentVideoId) {
              console.log('🔍 检查选中视频是否需要更新...');
              console.log('  🆔 查找视频ID:', currentVideoId);
              
              try {
                // 再次短暂延迟，确保前端状态同步
                await new Promise(resolve => setTimeout(resolve, 50)); 
                
                // 获取最新的所有视频数据
                console.log('📥 获取最新的所有视频数据...');
                const allVideos = await (window as any).electronAPI?.getAllVideos() || [];
                console.log('📊 获取到视频总数:', allVideos.length);
                
                const findUpdatedVideo = (videos: VideoInfo[], videoId: string): VideoInfo | null => {
                  for (const video of videos) {
                    if (video.id === videoId) {
                      return video;
                    }
                    // 检查剧集
                    if (video.episodes) {
                      for (const episode of video.episodes) {
                        if (episode.id === videoId) {
                          return episode;
                        }
                      }
                    }
                  }
                  return null;
                };
                
                const updatedVideo = findUpdatedVideo(allVideos, currentVideoId);
                if (updatedVideo) {
                  console.log('🎯 找到更新后的视频对象！');
                  console.log('  📂 旧路径:', selectedVideo?.path);
                  console.log('  📁 新路径:', updatedVideo.path);
                  console.log('  🏷️ 旧标题:', selectedVideo?.title);
                  console.log('  🏷️ 新标题:', updatedVideo.title);
                  
                  // 更新selectedVideo
                  setSelectedVideo(updatedVideo);
                  
                  // 如果路径发生了变化，清空相关缓存数据
                  if (selectedVideo && selectedVideo.path !== updatedVideo.path) {
                    console.log('🧹 路径已变化，清空缓存数据');
                    setVideoMetadata(null);
                    setNfoData(null);
                    setIsMetadataForSingleFile(false);
                  } else {
                    console.log('📍 路径未变化或首次设置，保持缓存数据');
                  }
                } else {
                  console.warn('❌ 未找到更新后的视频对象，视频可能已被删除');
                  console.warn('🔍 查找的视频ID:', currentVideoId);
                  console.warn('📋 所有视频IDs:', allVideos.map((v: VideoInfo) => v.id));
                  setSelectedVideo(null);
                }
              } catch (error) {
                console.error('💥 更新选中视频对象失败:', error);
              }
            } else {
              console.log('ℹ️ 重命名前没有选中视频，跳过更新');
            }
            
            console.log('🎉 重命名处理完成！');
            message.success('重命名完成，视频列表已更新');
          } else {
            console.warn('⚠️ 当前没有选中分类，跳过视频列表更新');
          }
        }}
      />
    </div>
  );
};

export default VideoLibrary; 