import React, { useState, useEffect } from 'react';
import { Layout, Menu, Button, message } from 'antd';
import { PlaySquareOutlined, SettingOutlined, FolderOutlined, HistoryOutlined, BgColorsOutlined } from '@ant-design/icons';
import CategoryManager from './components/CategoryManager';
import VideoLibrary from './components/VideoLibrary';
import Settings from './components/Settings';
import PlayHistory from './components/PlayHistory';
import ThemeSettings from './components/ThemeSettings';
import './App.css';

const { Header, Sider, Content } = Layout;

type MenuKey = 'library' | 'categories' | 'settings' | 'history' | 'themes';

// 页面切换动画组件
const AnimatedContent: React.FC<{ 
  children: React.ReactNode; 
  key: string;
}> = ({ children }) => {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // 延迟显示以触发动画
    const timer = setTimeout(() => {
      setIsVisible(true);
    }, 50);

    return () => clearTimeout(timer);
  }, []);

  return (
    <div 
      className={`page-transition ${isVisible ? 'page-transition-enter-active' : 'page-transition-enter'}`}
      style={{
        transition: 'all 0.4s cubic-bezier(0.23, 1, 0.32, 1)',
        opacity: isVisible ? 1 : 0,
        transform: isVisible ? 'translateY(0)' : 'translateY(20px)'
      }}
    >
      {children}
    </div>
  );
};

const App: React.FC = () => {
  const [selectedKey, setSelectedKey] = useState<MenuKey>('library');
  const [collapsed, setCollapsed] = useState(false);
  const [pageKey, setPageKey] = useState<string>('library');
  const [autoScanSettings, setAutoScanSettings] = useState<{
    enabled: boolean;
    pauseOnUserAction: boolean;
  }>({
    enabled: false,
    pauseOnUserAction: false
  });

  const menuItems = [
    {
      key: 'library',
      icon: <PlaySquareOutlined />,
      label: '视频库',
    },
    {
      key: 'categories',
      icon: <FolderOutlined />,
      label: '分类管理',
    },
    {
      key: 'history',
      icon: <HistoryOutlined />,
      label: '播放历史',
    },
    {
      key: 'themes',
      icon: <BgColorsOutlined />,
      label: '主题设置',
    },
    {
      key: 'settings',
      icon: <SettingOutlined />,
      label: '设置',
    },
  ];

  const handleMenuClick = ({ key }: { key: string }) => {
    // 页面切换时触发用户操作暂停
    handleUserAction('页面切换');
    
    // 添加切换延迟以实现丝滑过渡
    setSelectedKey(key as MenuKey);
    setPageKey(`${key}-${Date.now()}`); // 强制重新渲染以触发动画
  };

  const renderContent = () => {
    const content = (() => {
      switch (selectedKey) {
        case 'library':
          return <VideoLibrary />;
        case 'categories':
          return <CategoryManager />;
        case 'history':
          return <PlayHistory />;
        case 'themes':
          return <ThemeSettings />;
        case 'settings':
          return <Settings />;
        default:
          return <VideoLibrary />;
      }
    })();

    return (
      <AnimatedContent key={pageKey}>
        {content}
      </AnimatedContent>
    );
  };

  // 用户操作暂停函数
  const handleUserAction = async (actionType: string) => {
    if (!autoScanSettings.enabled || !autoScanSettings.pauseOnUserAction) {
      return;
    }
    
    try {
      console.log(`检测到用户操作: ${actionType}, 暂停自动扫描`);
      await (window as any).electronAPI?.pauseAutoScan();
    } catch (error) {
      console.error('暂停自动扫描失败:', error);
    }
  };

  // 初始化主题
  useEffect(() => {
    const initTheme = async () => {
      try {
        const activeThemeId = await (window as any).electronAPI?.getActiveTheme();
        if (activeThemeId) {
          const themes = await (window as any).electronAPI?.getThemes();
          const activeTheme = themes?.find((theme: any) => theme.id === activeThemeId);
          if (activeTheme) {
            applyTheme(activeTheme);
          }
        }
      } catch (error) {
        console.error('初始化主题失败:', error);
      }
    };
    
    initTheme();
  }, []);

  // 加载自动扫描设置
  useEffect(() => {
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
    
    loadAutoScanSettings();
  }, []);

  // 监听自动扫描设置更新
  useEffect(() => {
    const handleSettingsUpdate = (event: any) => {
      console.log('App: 自动扫描设置已更新:', event.detail);
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

  // 全局用户操作检测（防抖优化）
  useEffect(() => {
    if (!autoScanSettings.enabled || !autoScanSettings.pauseOnUserAction) {
      return;
    }

    let debounceTimer: NodeJS.Timeout | null = null;
    
    const debouncedUserAction = (actionType: string) => {
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }
      debounceTimer = setTimeout(() => {
        handleUserAction(actionType);
      }, 200); // 200ms防抖，快速响应但避免过于频繁的调用
    };

    const handleClick = () => debouncedUserAction('点击');
    const handleKeyPress = () => debouncedUserAction('键盘操作');
    const handleScroll = () => debouncedUserAction('滚动');
    const handleInput = () => debouncedUserAction('输入操作');

    // 添加事件监听器（移除鼠标移动，太敏感）
    document.addEventListener('click', handleClick);
    document.addEventListener('keypress', handleKeyPress);
    document.addEventListener('scroll', handleScroll, true);
    document.addEventListener('input', handleInput, true);

    console.log('已启用全局用户操作检测（防抖优化）');

    return () => {
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }
      document.removeEventListener('click', handleClick);
      document.removeEventListener('keypress', handleKeyPress);
      document.removeEventListener('scroll', handleScroll, true);
      document.removeEventListener('input', handleInput, true);
      console.log('已移除全局用户操作检测');
    };
  }, [autoScanSettings.enabled, autoScanSettings.pauseOnUserAction]);

  // 应用主题到页面
  const applyTheme = (theme: any) => {
    if (!theme) return;
    
    const root = document.documentElement;
    
    // 设置CSS变量
    root.style.setProperty('--primary-color', theme.colors.primary);
    root.style.setProperty('--background-color', theme.colors.background);
    root.style.setProperty('--card-background', theme.colors.cardBackground);
    root.style.setProperty('--text-primary', theme.colors.textPrimary);
    root.style.setProperty('--text-secondary', theme.colors.textSecondary);
    root.style.setProperty('--border-color', theme.colors.border);
    root.style.setProperty('--accent-color', theme.colors.accent);
    
    // 设置背景
    if (theme.backgroundType === 'image' && theme.backgroundImage) {
      // 设置背景图片
      document.body.style.backgroundImage = `url("${theme.backgroundImage}")`;
      document.body.style.backgroundSize = 'cover';
      document.body.style.backgroundPosition = 'center';
      document.body.style.backgroundAttachment = 'fixed';
      
      // 完全移除遮罩层，让背景图片完全显示
      document.body.style.setProperty('--bg-overlay', 'rgba(0, 0, 0, 0)');
      
      // 添加背景图片模式标识
      document.body.classList.add('has-background-image');
      
      // 设置极高透明度背景，让背景图片清晰显示
      root.style.setProperty('--layout-background', 'rgba(255, 255, 255, 0.35)');
      root.style.setProperty('--sider-background', 'rgba(255, 255, 255, 0.45)');
      root.style.setProperty('--content-background', 'rgba(255, 255, 255, 0.25)');
      root.style.setProperty('--header-background', 'rgba(255, 255, 255, 0.4)');
      
      // 调整文字颜色以确保在背景图片上可读
      root.style.setProperty('--text-on-bg', '#1a1a1a');
      root.style.setProperty('--text-secondary-on-bg', '#4a4a4a');
    } else {
      document.body.style.backgroundImage = 'none';
      document.body.style.background = theme.colors.background;
      document.body.style.removeProperty('--bg-overlay');
      document.body.classList.remove('has-background-image');
      
      // 恢复正常背景色
      root.style.setProperty('--layout-background', theme.colors.cardBackground);
      root.style.setProperty('--sider-background', theme.colors.cardBackground);
      root.style.setProperty('--content-background', theme.colors.cardBackground);
      root.style.setProperty('--header-background', theme.colors.cardBackground);
      root.style.setProperty('--text-on-bg', theme.colors.textPrimary);
      root.style.setProperty('--text-secondary-on-bg', theme.colors.textSecondary);
    }
  };

  return (
    <Layout style={{ height: '100vh' }}>
      <Sider trigger={null} collapsible collapsed={collapsed} theme="light">
        <div className="logo-container">
          <h3>{collapsed ? 'VM' : '视频管理'}</h3>
        </div>
        <Menu
          mode="inline"
          selectedKeys={[selectedKey]}
          items={menuItems}
          onClick={handleMenuClick}
        />
      </Sider>
      <Layout>
        <Header style={{ padding: '0 16px', background: '#fff', display: 'flex', alignItems: 'center' }}>
          <Button
            type="text"
            onClick={() => setCollapsed(!collapsed)}
            style={{ fontSize: '16px', width: 64, height: 64 }}
          >
            {collapsed ? '▶' : '◀'}
          </Button>
          <h2 style={{ margin: 0, marginLeft: 16 }}>
            {menuItems.find(item => item.key === selectedKey)?.label}
          </h2>
        </Header>
        <Content style={{ margin: '16px', background: '#fff', borderRadius: '8px' }}>
          {renderContent()}
        </Content>
      </Layout>
    </Layout>
  );
};

export default App; 