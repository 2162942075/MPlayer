import React, { useState, useEffect } from 'react';
import { Button, Empty, List, Avatar, Typography, Space, Popconfirm, message, Tag } from 'antd';
import { PlayCircleOutlined, DeleteOutlined, ClockCircleOutlined } from '@ant-design/icons';

const { Text, Title } = Typography;

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

const PlayHistory: React.FC = () => {
  const [playHistory, setPlayHistory] = useState<PlayHistory[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadPlayHistory();
  }, []);

  const loadPlayHistory = async () => {
    setLoading(true);
    try {
      const history = await (window as any).electronAPI?.getPlayHistory(50) || [];
      setPlayHistory(history);
    } catch (error) {
      console.error('加载播放历史失败:', error);
    } finally {
      setLoading(false);
    }
  };

  const handlePlay = async (history: PlayHistory) => {
    try {
      const result = await (window as any).electronAPI?.openWithPlayer(history.videoPath);
      if (!result?.success) {
        message.error('播放失败: ' + (result?.error || '请检查播放器设置'));
      } else {
        // 更新播放历史记录
        const historyData = {
          videoId: history.videoId,
          videoTitle: history.videoTitle,
          videoPath: history.videoPath,
          categoryId: history.categoryId,
          isEpisode: history.isEpisode,
          episodeTitle: history.episodeTitle
        };
        
        await (window as any).electronAPI?.addPlayHistory(historyData);
        await loadPlayHistory(); // 重新加载历史记录
      }
    } catch (error) {
      console.error('播放失败:', error);
      message.error('播放失败');
    }
  };

  const handleClearHistory = async () => {
    try {
      const result = await (window as any).electronAPI?.clearPlayHistory();
      if (result?.success) {
        message.success('播放历史已清除');
        setPlayHistory([]);
      } else {
        message.error('清除失败');
      }
    } catch (error) {
      console.error('清除播放历史失败:', error);
      message.error('清除失败');
    }
  };

  const formatTime = (timestamp: number) => {
    const now = Date.now();
    const diff = now - timestamp;
    
    const minutes = Math.floor(diff / (1000 * 60));
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    
    if (minutes < 1) return '刚刚';
    if (minutes < 60) return `${minutes}分钟前`;
    if (hours < 24) return `${hours}小时前`;
    if (days < 30) return `${days}天前`;
    
    const date = new Date(timestamp);
    return date.toLocaleDateString();
  };

  return (
    <div>
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center', 
        marginBottom: 16 
      }}>
        <Title level={2} style={{ margin: 0 }}>播放历史</Title>
        <Space>
          <Button 
            icon={<DeleteOutlined />}
            onClick={loadPlayHistory}
          >
            刷新
          </Button>
          <Popconfirm
            title="确定要清除所有播放历史吗？"
            onConfirm={handleClearHistory}
            okText="确定"
            cancelText="取消"
          >
            <Button 
              danger
              icon={<DeleteOutlined />}
            >
              清除历史
            </Button>
          </Popconfirm>
        </Space>
      </div>

      {playHistory.length === 0 ? (
        <Empty
          description="暂无播放历史"
          image={Empty.PRESENTED_IMAGE_SIMPLE}
        />
      ) : (
        <List
          itemLayout="horizontal"
          dataSource={playHistory}
          loading={loading}
          className="history-list"
          renderItem={(item, index) => (
            <List.Item
              className="history-item"
              style={{
                animationDelay: `${index * 0.1}s`
              }}
              actions={[
                <Button
                  type="primary"
                  icon={<PlayCircleOutlined />}
                  onClick={() => handlePlay(item)}
                >
                  播放
                </Button>
              ]}
            >
              <List.Item.Meta
                avatar={
                  <Avatar 
                    icon={<ClockCircleOutlined />} 
                    style={{ backgroundColor: '#1890ff' }}
                  />
                }
                title={
                  <Space>
                    <Text strong>
                      {item.isEpisode && item.episodeTitle 
                        ? `${item.videoTitle} - ${item.episodeTitle}`
                        : item.videoTitle
                      }
                    </Text>
                    {item.isEpisode && (
                      <Tag color="blue">剧集</Tag>
                    )}
                  </Space>
                }
                description={
                  <div>
                    <Text type="secondary" style={{ fontSize: '12px' }}>
                      播放时间: {formatTime(item.playedAt)}
                    </Text>
                  </div>
                }
              />
            </List.Item>
          )}
        />
      )}
    </div>
  );
};

export default PlayHistory; 