import React, { useState, useEffect } from 'react';
import { 
  Card, Button, Space, Radio, ColorPicker, Input, message, 
  Typography, Modal, Form, Row, Col, Tag, Popconfirm 
} from 'antd';
import { 
  PlusOutlined, 
  DeleteOutlined, EditOutlined, CheckOutlined 
} from '@ant-design/icons';

const { Title, Text } = Typography;


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

const ThemeSettings: React.FC = () => {
  const [themes, setThemes] = useState<ThemeConfig[]>([]);
  const [activeTheme, setActiveTheme] = useState<string>('default');
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [editingTheme, setEditingTheme] = useState<ThemeConfig | null>(null);
  const [form] = Form.useForm();

  useEffect(() => {
    const initializeThemes = async () => {
      await loadThemes();
      await loadActiveTheme();
    };
    initializeThemes();
  }, []);

  const loadThemes = async () => {
    try {
      const themeList = await (window as any).electronAPI?.getThemes() || [];
      setThemes(themeList);
    } catch (error) {
      console.error('加载主题失败:', error);
    }
  };

  const loadActiveTheme = async () => {
    try {
      const currentTheme = await (window as any).electronAPI?.getActiveTheme() || 'default';
      setActiveTheme(currentTheme);
      
      // 应用当前激活的主题
      const themesList = await (window as any).electronAPI?.getThemes() || [];
      const activeThemeConfig = themesList.find((theme: ThemeConfig) => theme.id === currentTheme);
      if (activeThemeConfig) {
        applyTheme(activeThemeConfig);
      }
    } catch (error) {
      console.error('获取当前主题失败:', error);
    }
  };

  const handleThemeChange = async (themeId: string) => {
    try {
      const result = await (window as any).electronAPI?.setActiveTheme(themeId);
      if (result?.success) {
        setActiveTheme(themeId);
        message.success('主题切换成功');
        // 应用主题到页面
        applyTheme(themes.find(t => t.id === themeId));
      } else {
        message.error('主题切换失败');
      }
    } catch (error) {
      console.error('切换主题失败:', error);
      message.error('主题切换失败');
    }
  };

  const applyTheme = (theme?: ThemeConfig) => {
    if (!theme) return;
    
    console.log('应用主题:', theme.name, '背景类型:', theme.backgroundType);
    
    const root = document.documentElement;
    
    // 辅助函数：判断颜色是否为深色
    const isDarkColor = (hexColor: string): boolean => {
      const rgb = parseInt(hexColor.slice(1), 16);
      const r = (rgb >> 16) & 0xff;
      const g = (rgb >> 8) & 0xff;
      const b = (rgb >> 0) & 0xff;
      const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      return luma < 128;
    };
    
    // 确保cardBackground不是透明或无效值
    let safeCardBackground = theme.colors.cardBackground || '#ffffff';
    
    // 检查是否是rgba透明值，如果是则提供默认背景
    if (safeCardBackground.includes('rgba') && safeCardBackground.includes('0.')) {
      const opacity = parseFloat(safeCardBackground.match(/0\.\d+/)?.[0] || '0');
      if (opacity < 0.3) {
        safeCardBackground = '#ffffff'; // 如果透明度太高，使用白色背景
      }
    }
    
    // 根据背景色选择合适的文字颜色

    const textOnBgColor = theme.colors.textPrimary;
    
    // 为视频卡片计算安全的背景色
    let videoCardBackground = theme.colors.cardBackground;
    
    // 如果是rgba值，确保有足够的不透明度
    if (videoCardBackground.includes('rgba')) {
      const matches = videoCardBackground.match(/rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)/);
      if (matches) {
        const [, r, g, b, a] = matches;
        const opacity = Math.max(parseFloat(a), 0.8); // 最小80%不透明度
        videoCardBackground = `rgba(${r}, ${g}, ${b}, ${opacity})`;
      }
    }
    
    // 设置CSS变量
    root.style.setProperty('--primary-color', theme.colors.primary);
    root.style.setProperty('--background-color', theme.colors.background);
    root.style.setProperty('--card-background', theme.colors.cardBackground);
    root.style.setProperty('--video-card-background', videoCardBackground);
    root.style.setProperty('--sider-background', theme.colors.siderBackground);
    root.style.setProperty('--header-background', theme.colors.headerBackground);
    root.style.setProperty('--text-primary', theme.colors.textPrimary);
    root.style.setProperty('--text-secondary', theme.colors.textSecondary);
    root.style.setProperty('--sider-text', theme.colors.siderText);
    root.style.setProperty('--border-color', theme.colors.border);
    root.style.setProperty('--accent-color', theme.colors.accent);
    root.style.setProperty('--menu-item-bg', theme.colors.menuItemBackground);
    root.style.setProperty('--menu-item-hover', theme.colors.menuItemHover);
    root.style.setProperty('--menu-item-active', theme.colors.menuItemActive);
    root.style.setProperty('--text-on-bg', textOnBgColor);
    root.style.setProperty('--sider-text-color', theme.colors.siderText);
    
    // 设置背景 - 只使用颜色背景
    console.log('设置背景颜色:', theme.colors.background);
    document.body.style.backgroundImage = 'none';
    document.body.style.background = theme.colors.background;
    document.body.classList.remove('has-background-image');
  };

  const handleCreateTheme = () => {
    setEditingTheme(null);
    form.resetFields();
    setIsModalVisible(true);
  };

  const handleEditTheme = (theme: ThemeConfig) => {
    setEditingTheme(theme);
    form.setFieldsValue({
      name: theme.name,
      backgroundType: theme.backgroundType,
      ...theme.colors
    });
    setIsModalVisible(true);
  };

  const handleDeleteTheme = async (themeId: string) => {
    try {
      const result = await (window as any).electronAPI?.deleteTheme(themeId);
      if (result?.success) {
        message.success('主题删除成功');
        await loadThemes();
        if (activeTheme === themeId) {
          await handleThemeChange('default');
        }
      } else {
        message.error('删除失败');
      }
    } catch (error) {
      console.error('删除主题失败:', error);
      message.error('删除失败');
    }
  };

  const handleSaveTheme = async (values: any) => {
    try {
      console.log('保存主题数据:', values);
      
      // 辅助函数：确保颜色值为字符串格式
      const getColorString = (colorValue: any): string => {
        if (typeof colorValue === 'string') {
          return colorValue;
        }
        if (colorValue && typeof colorValue === 'object') {
          return colorValue.toHexString ? colorValue.toHexString() : colorValue.hex || '#000000';
        }
        return '#000000';
      };

      const themeId = editingTheme?.id || `custom_${Date.now()}`;
      const theme: ThemeConfig = {
        id: themeId,
        name: values.name,
        type: 'custom',
        backgroundType: values.backgroundType || 'color',
        colors: {
          primary: getColorString(values.primary),
          background: getColorString(values.background),
          cardBackground: getColorString(values.cardBackground),
          siderBackground: getColorString(values.siderBackground || values.cardBackground),
          headerBackground: getColorString(values.headerBackground || values.cardBackground),
          textPrimary: getColorString(values.textPrimary),
          textSecondary: getColorString(values.textSecondary),
          siderText: getColorString(values.siderText || values.textPrimary),
          border: getColorString(values.border),
          accent: getColorString(values.accent),
          menuItemBackground: getColorString(values.menuItemBackground || 'rgba(24, 144, 255, 0.06)'),
          menuItemHover: getColorString(values.menuItemHover || 'rgba(24, 144, 255, 0.12)'),
          menuItemActive: getColorString(values.menuItemActive || values.primary)
        }
      };

      console.log('处理后的主题数据:', theme);

      const result = await (window as any).electronAPI?.saveTheme(theme);
      if (result?.success) {
        message.success('主题保存成功');
        setIsModalVisible(false);
        await loadThemes();
        
        // 如果保存的是当前激活的主题，立即应用
        if (activeTheme === theme.id) {
          console.log('保存的是当前激活主题，立即应用');
          applyTheme(theme);
        }
      } else {
        console.error('保存失败，服务器返回:', result);
        message.error('保存失败: ' + (result?.error || '未知错误'));
      }
    } catch (error) {
      console.error('保存主题失败:', error);
      message.error('保存失败: ' + (error instanceof Error ? error.message : '未知错误'));
    }
  };



  const renderThemePreview = (theme: ThemeConfig) => (
    <div 
      style={{
        width: '100%',
        height: '80px',
        background: theme.colors.background,
        border: `2px solid ${activeTheme === theme.id ? theme.colors.primary : 'transparent'}`,
        borderRadius: '8px',
        position: 'relative',
        overflow: 'hidden'
      }}
    >
      <div 
        style={{
          position: 'absolute',
          bottom: '8px',
          left: '8px',
          right: '8px',
          background: theme.colors.cardBackground,
          padding: '4px 8px',
          borderRadius: '4px',
          border: `1px solid ${theme.colors.border}`
        }}
      >
        <div style={{ color: theme.colors.textPrimary, fontSize: '12px', fontWeight: 'bold' }}>
          示例卡片
        </div>
        <div style={{ color: theme.colors.textSecondary, fontSize: '10px' }}>
          预览文本
        </div>
      </div>
      {activeTheme === theme.id && (
        <CheckOutlined 
          style={{
            position: 'absolute',
            top: '8px',
            right: '8px',
            color: theme.colors.primary,
            fontSize: '16px'
          }}
        />
      )}
    </div>
  );

  return (
    <div>
      <Title level={2}>主题设置</Title>
      
      <div style={{ marginBottom: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <Title level={4}>选择主题</Title>
          <Button 
            type="primary" 
            icon={<PlusOutlined />}
            onClick={handleCreateTheme}
          >
            创建自定义主题
          </Button>
        </div>
        
        <Row gutter={[16, 16]}>
          {themes.map((theme) => (
            <Col span={6} key={theme.id}>
              <Card
                hoverable
                size="small"
                className="theme-preview-card"
                style={{ 
                  cursor: 'pointer',
                  border: activeTheme === theme.id ? `2px solid ${theme.colors.primary}` : '1px solid #d9d9d9'
                }}
                onClick={() => handleThemeChange(theme.id)}
                actions={theme.type === 'custom' ? [
                  <EditOutlined key="edit" onClick={(e) => {
                    e.stopPropagation();
                    handleEditTheme(theme);
                  }} />,
                  <Popconfirm
                    key="delete"
                    title="确定要删除这个主题吗？"
                    onConfirm={() => handleDeleteTheme(theme.id)}
                  >
                    <DeleteOutlined onClick={(e) => e?.stopPropagation()} />
                  </Popconfirm>
                ] : undefined}
              >
                {renderThemePreview(theme)}
                <div style={{ marginTop: '8px', textAlign: 'center' }}>
                  <Text strong>{theme.name}</Text>
                  {theme.type === 'preset' && (
                    <Tag color="blue" style={{ marginLeft: '8px' }}>预设</Tag>
                  )}
                </div>
              </Card>
            </Col>
          ))}
        </Row>
      </div>

      <Modal
        title={editingTheme ? '编辑主题' : '创建自定义主题'}
        open={isModalVisible}
        onCancel={() => setIsModalVisible(false)}
        footer={null}
        width={800}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleSaveTheme}
          initialValues={{
            backgroundType: 'color',
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
          }}
        >
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="name"
                label="主题名称"
                rules={[{ required: true, message: '请输入主题名称' }]}
              >
                <Input placeholder="输入主题名称" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="backgroundType" label="背景类型">
                <Radio.Group>
                  <Radio value="color">纯色</Radio>
                  <Radio value="gradient">渐变</Radio>
                </Radio.Group>
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={8}>
              <Form.Item name="primary" label="主色调">
                <ColorPicker showText />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="background" label="背景色">
                <ColorPicker showText />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="cardBackground" label="卡片背景">
                <ColorPicker showText />
              </Form.Item>
            </Col>
          </Row>

                    <Row gutter={16}>
            <Col span={8}>
              <Form.Item name="siderBackground" label="侧边栏背景">
                <ColorPicker showText />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="headerBackground" label="顶部栏背景">
                <ColorPicker showText />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="siderText" label="侧边栏文字">
                <ColorPicker showText />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={8}>
              <Form.Item name="textPrimary" label="主文本色">
                <ColorPicker showText />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="textSecondary" label="次要文本色">
                <ColorPicker showText />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="border" label="边框色">
                <ColorPicker showText />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={8}>
              <Form.Item name="accent" label="强调色">
                <ColorPicker showText />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="menuItemBackground" label="菜单项背景">
                <ColorPicker showText />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="menuItemHover" label="菜单项悬停">
                <ColorPicker showText />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={8}>
              <Form.Item name="menuItemActive" label="菜单项激活">
                <ColorPicker showText />
              </Form.Item>
            </Col>
 
            </Row>

          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit">
                保存主题
              </Button>
              <Button onClick={() => setIsModalVisible(false)}>
                取消
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default ThemeSettings; 