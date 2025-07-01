import React, { useState, useEffect } from 'react';
import {
  Modal,
  Tabs,
  Table,
  Button,
  Form,
  Input,
  Select,
  Switch,
  Space,
  message,
  Popconfirm,
  Tag,
  Alert,
  Typography,
  Checkbox,
  Divider,
  Card,
  Progress,
  Spin,
  Row,
  Col
} from 'antd';
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  PlayCircleOutlined,
  HistoryOutlined,
  SettingOutlined,
  ThunderboltOutlined,
  LoadingOutlined,
  FileTextOutlined,
  SearchOutlined
} from '@ant-design/icons';
import CleaningRulesManager from './CleaningRulesManager';
// 使用全局类型定义，不需要导入

const { TabPane } = Tabs;
const { Option } = Select;
const { TextArea } = Input;
const { Text } = Typography;

interface Video {
  id: string;
  title: string;
  path: string;
  [key: string]: any;
}

interface RenameManagerProps {
  visible: boolean;
  onClose: () => void;
  videos: Video[];
  onVideosUpdated?: () => void; // 视频更新后的回调
}

// 可用变量定义
const AVAILABLE_VARIABLES = [
  { 
    variable: '{title}', 
    description: '视频标题', 
    example: '复仇者联盟',
    category: '基本信息'
  },
  { 
    variable: '{year}', 
    description: '年份', 
    example: '2019',
    category: '基本信息'
  },
  { 
    variable: '{quality}', 
    description: '画质品质', 
    example: '1080p, 4K, BluRay',
    category: '技术参数'
  },
  { 
    variable: '{source}', 
    description: '视频来源', 
    example: 'BluRay, WEB-DL, HDTV',
    category: '技术参数'
  },
  { 
    variable: '{codec}', 
    description: '视频编码', 
    example: 'H264, H265, x264',
    category: '技术参数'
  },
  { 
    variable: '{language}', 
    description: '语言', 
    example: 'Chinese, English',
    category: '语言字幕'
  },
  { 
    variable: '{group}', 
    description: '制作组', 
    example: 'RARBG, YTS',
    category: '发布信息'
  },
  { 
    variable: '{season}', 
    description: '季数', 
    example: '01, 02',
    category: '剧集信息'
  },
  { 
    variable: '{episode}', 
    description: '集数', 
    example: '01, 02',
    category: '剧集信息'
  },
  { 
    variable: '{ext}', 
    description: '文件扩展名', 
    example: 'mp4, mkv, avi',
    category: '文件信息'
  }
];

// 按类别分组变量
const VARIABLES_BY_CATEGORY = AVAILABLE_VARIABLES.reduce((acc, variable) => {
  if (!acc[variable.category]) {
    acc[variable.category] = [];
  }
  acc[variable.category].push(variable);
  return acc;
}, {} as Record<string, typeof AVAILABLE_VARIABLES>);

// 预设模板
const PRESET_TEMPLATES = [
  {
    name: '电影标准格式',
    template: '{title} ({year}) [{quality}].{ext}',
    description: '适用于电影文件'
  },
  {
    name: '剧集标准格式',  
    template: '{title} S{season}E{episode}.{ext}',
    description: '适用于电视剧集'
  },
  {
    name: '高清收藏格式',
    template: '{title} ({year}) [{quality}] [{codec}].{ext}',
    description: '包含编码信息的详细格式'
  },
  {
    name: '制作组标注格式',
    template: '[{group}] {title} ({year}) [{quality}].{ext}',
    description: '包含制作组信息'
  },
  {
    name: '简洁格式',
    template: '{title} ({year}).{ext}',
    description: '最简洁的命名格式'
  }
];

const RenameManager: React.FC<RenameManagerProps> = ({ visible, onClose, videos, onVideosUpdated }) => {
  const [form] = Form.useForm();
  const [renameRules, setRenameRules] = useState<RenameRule[]>([]);
  const [previewData, setPreviewData] = useState<any[]>([]);
  const [selectedVideos, setSelectedVideos] = useState<string[]>([]);
  const [currentPreviewRuleId, setCurrentPreviewRuleId] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [showRuleForm, setShowRuleForm] = useState(false);
  const [editingRule, setEditingRule] = useState<RenameRule | null>(null);
  const [currentTemplate, setCurrentTemplate] = useState('');
  const [selectedPreset, setSelectedPreset] = useState<string | undefined>(undefined);
  const [renameHistory, setRenameHistory] = useState<RenameHistory[]>([]);
  const [cleaningManagerVisible, setCleaningManagerVisible] = useState(false);
  
  // 🔥 新增：视频显示标题缓存
  const [displayTitles, setDisplayTitles] = useState<Record<string, string>>({});
  
  // 🔥 新增：批量重命名进度状态
  const [batchProgress, setBatchProgress] = useState({
    visible: false,
    current: 0,
    total: 0,
    message: '',
    fileName: '',
    successCount: 0,
    failureCount: 0,
    isComplete: false,
    hasError: false,
    errorMessage: ''
  });

  const [activeTab, setActiveTab] = useState('cleaning-rules');

  // 🔥 获取应该显示的标题
  const getDisplayTitle = (video: Video): string => {
    // 优先从缓存中获取
    if (displayTitles[video.id]) {
      return displayTitles[video.id];
    }
    
    // 如果缓存中没有，返回默认标题
    return video.title;
  };

  // 🔥 初始化显示标题缓存
  const initDisplayTitles = async () => {
    const newDisplayTitles: Record<string, string> = {};
    
    for (const video of videos) {
      try {
        const hasVirtual = await window.electronAPI.hasVirtualRename(video.id);
        if (hasVirtual) {
          // 有虚拟重命名，使用数据库中的标题
          newDisplayTitles[video.id] = video.title;
        } else {
          // 没有虚拟重命名，使用文件名（去除扩展名）
          const fullPath = video.path;
          const fileName = fullPath.split(/[/\\]/).pop() || fullPath; // 获取最后一部分作为文件名
          // 只匹配常见的视频文件扩展名，避免误删文件名中的.com等内容
          const nameWithoutExt = fileName.replace(/\.(mp4|mkv|avi|mov|wmv|flv|webm|m4v|3gp|ts|m2ts|mts)$/i, "");
          newDisplayTitles[video.id] = nameWithoutExt;
        }
      } catch (error) {
        console.error('检查虚拟重命名失败:', error);
        // 出错时使用默认标题
        newDisplayTitles[video.id] = video.title;
      }
    }
    
    setDisplayTitles(newDisplayTitles);
  };

  // 🔥 监听批量重命名进度事件
  useEffect(() => {
    const handleRenameProgress = (progressData: any) => {
      console.log('📊 收到重命名进度事件:', progressData);
      
      switch (progressData.type) {
        case 'start':
          setBatchProgress({
            visible: true,
            current: 0,
            total: progressData.total,
            message: progressData.message,
            fileName: '',
            successCount: 0,
            failureCount: 0,
            isComplete: false,
            hasError: false,
            errorMessage: ''
          });
          break;
          
        case 'progress':
          setBatchProgress(prev => ({
            ...prev,
            current: progressData.current,
            message: progressData.message,
            fileName: progressData.fileName || ''
          }));
          break;
          
        case 'batch-complete':
          setBatchProgress(prev => ({
            ...prev,
            current: progressData.current,
            message: progressData.message
          }));
          break;
          
        case 'complete':
          setBatchProgress(prev => ({
            ...prev,
            current: progressData.current,
            message: progressData.message,
            successCount: progressData.successCount || 0,
            failureCount: progressData.failureCount || 0,
            isComplete: true
          }));
          
          // 5秒后自动隐藏进度框
          setTimeout(() => {
            setBatchProgress(prev => ({ ...prev, visible: false }));
          }, 5000);
          break;
          
        case 'error':
          setBatchProgress(prev => ({
            ...prev,
            hasError: true,
            errorMessage: progressData.message,
            isComplete: true
          }));
          break;
          
        default:
          console.warn('未知的进度事件类型:', progressData.type);
      }
    };

    // 添加事件监听器 - 使用正确的API调用方式
    let cleanupFunction: (() => void) | null = null;
    
    if (window.electronAPI && window.electronAPI.onRenameProgress) {
      cleanupFunction = window.electronAPI.onRenameProgress(handleRenameProgress);
    } else {
      console.warn('electronAPI.onRenameProgress 不可用');
    }

    // 清理函数
    return () => {
      if (cleanupFunction) {
        cleanupFunction();
      }
    };
  }, []);

  // 加载重命名规则
  const loadRenameRules = async () => {
    try {
      const rules = await window.electronAPI.getRenameRules();
      setRenameRules(rules);
    } catch (error) {
      message.error('加载重命名规则失败');
    }
  };

  // 加载重命名历史
  const loadRenameHistory = async () => {
    try {
      const history = await window.electronAPI.getRenameHistory();
      setRenameHistory(history);
    } catch (error) {
      message.error('加载重命名历史失败');
    }
  };

  useEffect(() => {
    if (visible) {
      loadRenameRules();
      loadRenameHistory();
      initDisplayTitles(); // 🔥 初始化显示标题
    }
  }, [visible]);

  // 🔥 当videos变化时重新初始化显示标题
  useEffect(() => {
    if (visible && videos.length > 0) {
      initDisplayTitles();
    }
  }, [videos]);

  // 保存重命名规则
  const handleSaveRule = async (values: any) => {
    try {
      const rule: RenameRule = {
        id: editingRule?.id || `rule_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        name: values.name,
        template: values.template,
        mode: values.mode || 'virtual',
        description: values.description,
        enabled: values.enabled !== false,
        applyTo: 'all',
        createdAt: Date.now(),
        examples: []
      };

      const result = await window.electronAPI.saveRenameRule(rule);
      if (result.success) {
        message.success(editingRule ? '重命名规则更新成功' : '重命名规则创建成功');
      } else {
        message.error(result.error || '保存失败');
      }

      form.resetFields();
      setShowRuleForm(false);
      setEditingRule(null);
      setCurrentTemplate(''); // 清空模板状态
      setSelectedPreset(undefined); // 清空预设模板选择
      loadRenameRules();
    } catch (error) {
      message.error('保存重命名规则失败');
    }
  };

  // 删除重命名规则
  const handleDeleteRule = async (id: string) => {
    try {
      await window.electronAPI.deleteRenameRule(id);
      message.success('重命名规则删除成功');
      loadRenameRules();
    } catch (error) {
      message.error('删除重命名规则失败');
    }
  };

  // 编辑规则
  const handleEditRule = (rule: RenameRule) => {
    setEditingRule(rule);
    setCurrentTemplate(rule.template || ''); // 设置当前模板状态
    
    // 🔥 检查是否匹配预设模板
    const matchingPreset = PRESET_TEMPLATES.find(preset => preset.template === rule.template);
    setSelectedPreset(matchingPreset ? matchingPreset.template : undefined);
    
    form.setFieldsValue(rule);
    setShowRuleForm(true);
  };

  // 生成重命名预览
  const generatePreview = async (ruleId: string) => {
    if (selectedVideos.length === 0) {
      message.warning('请先选择要重命名的视频');
      return;
    }

    setIsLoading(true);
    try {
      console.log('开始生成预览, 规则ID:', ruleId);
      const rule = renameRules.find(r => r.id === ruleId);
      console.log('使用的规则:', rule);
      
      const previews = await window.electronAPI.generateRenamePreview(ruleId, selectedVideos);
      const previewData = previews.map(preview => {
        const video = videos.find(v => v.id === preview.videoId);
        return {
          id: preview.videoId,
          originalName: preview.originalName,
          newName: preview.newName,
          path: preview.originalPath,
          isValid: preview.isValid,
          error: preview.isValid ? undefined : '重命名失败'
        };
      });
      setPreviewData(previewData);
      setCurrentPreviewRuleId(ruleId); // 记录当前预览的规则ID
      setActiveTab('preview');
    } catch (error) {
      message.error('生成预览失败');
    } finally {
      setIsLoading(false);
    }
  };

  // 执行重命名
  const executeRename = async (ruleId: string) => {
    if (previewData.length === 0) {
      message.warning('请先生成预览');
      return;
    }

    setIsLoading(true);
    try {
      const rule = renameRules.find(r => r.id === ruleId);
      if (!rule) {
        message.error('重命名规则不存在');
        return;
      }

      console.log('开始执行重命名:');
      console.log('  规则ID:', ruleId);
      console.log('  规则详情:', rule);
      console.log('  重命名模式:', rule.mode);
      console.log('  预览数据:', previewData);

      const validPreviewResults = previewData
        .filter(item => item.isValid)
        .map(item => ({
          videoId: item.id,
          originalPath: item.path,
          originalName: item.originalName,
          newName: item.newName,
          isValid: item.isValid
        }));

      console.log('  有效预览结果:', validPreviewResults);

      // 🔥 添加超时保护和详细日志
      console.log('🚀 开始调用 executeRename，时间:', new Date().toLocaleTimeString());
      
      const startTime = Date.now();
      const result = await window.electronAPI.executeRename(ruleId, validPreviewResults, rule.mode);
      const endTime = Date.now();
      
      console.log('🎬 executeRename 调用完成，时间:', new Date().toLocaleTimeString());
      console.log('⏱️ executeRename 耗时:', endTime - startTime, 'ms');
      console.log('🎬 重命名结果:', result);
      console.log('✅ result.success:', result.success);
      console.log('🔗 onVideosUpdated存在:', !!onVideosUpdated);
      console.log('🔗 onVideosUpdated类型:', typeof onVideosUpdated);
      
      if (result.success) {
        console.log('🎉 重命名成功，准备调用回调函数...');
        message.success(`重命名完成！成功: ${result.results.length} 个文件`);
        
        // 重命名成功后刷新视频列表
        if (onVideosUpdated) {
          console.log('📞 🚨🚨🚨 正在调用 onVideosUpdated()... 🚨🚨🚨');
          console.log('📞 调用时间:', new Date().toLocaleTimeString());
          
          try {
            await onVideosUpdated();
            console.log('✅ ✅ ✅ onVideosUpdated() 调用完成！ ✅ ✅ ✅');
          } catch (error) {
            console.error('💥 onVideosUpdated() 调用失败:', error);
          }
        } else {
          console.warn('⚠️ ⚠️ ⚠️ onVideosUpdated 不存在，无法刷新视频列表！ ⚠️ ⚠️ ⚠️');
          console.warn('检查 RenameManager 的 props:', { onVideosUpdated });
        }
      } else {
        console.error('❌ 重命名失败:', result.error);
        message.error(result.error || '重命名失败');
      }

      loadRenameHistory();
      setPreviewData([]);
      setSelectedVideos([]);
      setCurrentPreviewRuleId(''); // 清空当前预览规则
    } catch (error) {
      console.error('执行重命名失败:', error);
      message.error('执行重命名失败');
    } finally {
      setIsLoading(false);
    }
  };

  // 规则管理表格列
  const ruleColumns = [
    {
      title: '规则名称',
      dataIndex: 'name',
      key: 'name',
      width: 180,
    },
    {
      title: '模板',
      dataIndex: 'template',
      key: 'template',
      width: 300,
      ellipsis: true,
    },
    {
      title: '模式',
      dataIndex: 'mode',
      key: 'mode',
      width: 120,
      render: (mode: string) => (
        <Tag color={mode === 'physical' ? 'red' : 'blue'}>
          {mode === 'physical' ? '物理重命名' : '虚拟重命名'}
        </Tag>
      ),
    },
    {
      title: '状态',
      dataIndex: 'enabled',
      key: 'enabled',
      width: 80,
      render: (enabled: boolean) => (
        <Tag color={enabled ? 'green' : 'default'}>
          {enabled ? '启用' : '禁用'}
        </Tag>
      ),
    },
    {
      title: '操作',
      key: 'action',
      width: 220,
      render: (_: any, record: RenameRule) => (
        <Space size="small">
          <Button
            type="link"
            icon={<EditOutlined />}
            onClick={() => handleEditRule(record)}
            size="small"
          >
            编辑
          </Button>
          <Button
            type="link"
            icon={<PlayCircleOutlined />}
            onClick={() => generatePreview(record.id)}
            disabled={selectedVideos.length === 0}
            size="small"
          >
            预览
          </Button>
          <Popconfirm
            title="确定删除此规则？"
            onConfirm={() => handleDeleteRule(record.id)}
          >
            <Button
              type="link"
              icon={<DeleteOutlined />}
              danger
              size="small"
            >
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  // 预览表格列
  const previewColumns = [
    {
      title: '原文件名',
      dataIndex: 'originalName',
      key: 'originalName',
      width: 500,
      ellipsis: true,
    },
    {
      title: '新文件名',
      dataIndex: 'newName',
      key: 'newName',
      width: 500,
      ellipsis: true,
      render: (text: string, record: any) => (
        <Text type={record.isValid ? 'success' : 'danger'}>
          {text || record.error}
        </Text>
      ),
    },
    {
      title: '状态',
      dataIndex: 'isValid',
      key: 'isValid',
      width: 100,
      render: (isValid: boolean) => (
        <Tag color={isValid ? 'green' : 'red'}>
          {isValid ? '有效' : '无效'}
        </Tag>
      ),
    },
  ];

  // 回退重命名
  const handleRevertRename = async (historyId: string) => {
    try {
      setIsLoading(true);
      const result = await window.electronAPI.revertRename(historyId);
      
      if (result.success) {
        message.success(result.message || '回退成功');
        loadRenameHistory(); // 刷新历史记录
        if (onVideosUpdated) {
          onVideosUpdated(); // 刷新视频列表
        }
      } else {
        message.error(result.error || '回退失败');
      }
    } catch (error) {
      message.error('回退操作失败');
    } finally {
      setIsLoading(false);
    }
  };

  // 历史记录表格列
  const historyColumns = [
    {
      title: '时间',
      dataIndex: 'timestamp',
      key: 'timestamp',
      width: 140,
      render: (timestamp: number) => new Date(timestamp).toLocaleString(),
    },
    {
      title: '原文件名',
      dataIndex: 'originalPath',
      key: 'originalPath',
      width: 280,
      ellipsis: true,
      render: (text: string) => text.split(/[/\\]/).pop() || text,
    },
    {
      title: '新文件名',
      dataIndex: 'newPath',
      key: 'newPath',
      width: 280,
      ellipsis: true,
      render: (text: string) => text.split(/[/\\]/).pop() || text,
    },
    {
      title: '规则',
      dataIndex: 'ruleName',
      key: 'ruleName',
      width: 120,
    },
    {
      title: '模式',
      dataIndex: 'mode',
      key: 'mode',
      width: 70,
      render: (mode: string) => (
        <Tag color={mode === 'physical' ? 'red' : 'blue'}>
          {mode === 'physical' ? '物理' : '虚拟'}
        </Tag>
      ),
    },
    {
      title: '状态',
      dataIndex: 'reverted',
      key: 'reverted',
      width: 80,
      render: (reverted: boolean, record: RenameHistory) => {
        if (reverted) {
          return <Tag color="orange">已回退</Tag>;
        }
        return record.canRevert ? <Tag color="green">可回退</Tag> : <Tag color="gray">不可回退</Tag>;
      },
    },
    {
      title: '操作',
      key: 'action',
      width: 120,
      render: (_: any, record: RenameHistory) => (
        <Space size="small">
          {record.canRevert && !record.reverted && (
            <Popconfirm
              title="确定要回退此重命名操作？"
              description={`将 ${record.newPath.split(/[/\\]/).pop()} 恢复为 ${record.originalPath.split(/[/\\]/).pop()}`}
              onConfirm={() => handleRevertRename(record.id)}
              okText="确定"
              cancelText="取消"
            >
              <Button
                type="link"
                size="small"
                loading={isLoading}
                style={{ color: '#ff7a00' }}
              >
                回退
              </Button>
            </Popconfirm>
          )}
          {record.reverted && (
            <Text type="secondary" style={{ fontSize: '12px' }}>
              {new Date(record.revertedAt!).toLocaleString()} 已回退
            </Text>
          )}
        </Space>
      ),
    },
  ];

  return (
    <Modal
      title="智能重命名工具"
      open={visible}
      onCancel={onClose}
      width={1400}
      footer={null}
      destroyOnClose
    >
      <Tabs 
        activeKey={activeTab} 
        onChange={setActiveTab}
        items={[
          {
            key: 'cleaning-rules',
            label: (
              <span>
                <SettingOutlined />
                文件名清理规则
              </span>
            ),
            children: (
              <div>
                <Alert
                  message="第一步：设置文件名清理规则"
                  description="定义如何清理视频文件名中的垃圾信息，这些规则将在重命名时自动应用到 {title} 变量中"
                  type="info"
                  style={{ marginBottom: 16 }}
                  showIcon
                />
                <CleaningRulesManager />
              </div>
            )
          },
          {
            key: 'rules',
            label: (
              <span>
                <FileTextOutlined />
                重命名规则
              </span>
            ),
            children: (
                              <div>
                  <Alert
                    message="第二步：设置重命名模板规则"
                    description="定义文件重命名的模板格式，如 {title} ({year}) [{quality}].{ext}"
                    type="info"
                    style={{ marginBottom: 16 }}
                    showIcon
                  />
                  <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between' }}>
                    <Button 
                      type="primary" 
                      icon={<PlusOutlined />}
                      onClick={() => {
                        setEditingRule(null);
                        setShowRuleForm(true);
                        form.resetFields();
                        setCurrentTemplate('');
                        setSelectedPreset(undefined);
                      }}
                    >
                      添加规则
                    </Button>
                  </div>
                <Table
                  dataSource={renameRules}
                  columns={ruleColumns}
                  rowKey="id"
                  pagination={{ pageSize: 10 }}
                />
              </div>
            )
          },

          {
            key: 'batch',
            label: (
              <span>
                <PlayCircleOutlined />
                批量重命名
              </span>
            ),
            children: (
              <div>
                <Alert
                  message="第三步：执行批量重命名"
                  description="选择视频文件和重命名规则，生成预览后执行重命名操作"
                  type="info"
                  style={{ marginBottom: 16 }}
                  showIcon
                />

                <Row gutter={16}>
                  <Col span={12}>
                    <Card title="选择视频文件" size="small">
                      <Checkbox
                        indeterminate={selectedVideos.length > 0 && selectedVideos.length < videos.length}
                        checked={selectedVideos.length === videos.length}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedVideos(videos.map(v => v.id));
                          } else {
                            setSelectedVideos([]);
                          }
                        }}
                      >
                        全选 ({selectedVideos.length}/{videos.length})
                      </Checkbox>
                      <Divider />
                      <div style={{ maxHeight: 300, overflowY: 'auto' }}>
                        {videos.map(video => (
                          <div key={video.id} style={{ marginBottom: 8 }}>
                            <Checkbox
                              checked={selectedVideos.includes(video.id)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedVideos([...selectedVideos, video.id]);
                                } else {
                                  setSelectedVideos(selectedVideos.filter(id => id !== video.id));
                                }
                              }}
                              style={{ 
                                width: '100%',
                                display: 'flex',
                                alignItems: 'flex-start'
                              }}
                            >
                              <span 
                                title={getDisplayTitle(video)}
                                style={{
                                  display: 'inline-block',
                                  maxWidth: '100%',
                                  wordBreak: 'break-all',
                                  whiteSpace: 'normal',
                                  lineHeight: '1.4'
                                }}
                              >
                                {getDisplayTitle(video)}
                              </span>
                            </Checkbox>
                          </div>
                        ))}
                      </div>
                    </Card>
                  </Col>

                  <Col span={12}>
                    <Card title="选择重命名规则" size="small">
                      {renameRules.filter(rule => rule.enabled).map(rule => (
                        <Card
                          key={rule.id}
                          size="small"
                          style={{ marginBottom: 8 }}
                          actions={[
                            <Button
                              type="link"
                              icon={<PlayCircleOutlined />}
                              onClick={() => generatePreview(rule.id)}
                              disabled={selectedVideos.length === 0}
                              loading={isLoading}
                              key="preview"
                            >
                              生成预览
                            </Button>
                          ]}
                        >
                          <Card.Meta
                            title={rule.name}
                            description={
                              <div>
                                <div>模板: {rule.template}</div>
                                <Tag color={rule.mode === 'physical' ? 'red' : 'blue'}>
                                  {rule.mode === 'physical' ? '物理重命名' : '虚拟重命名'}
                                </Tag>
                              </div>
                            }
                          />
                        </Card>
                      ))}
                    </Card>
                  </Col>
                </Row>
              </div>
            )
          },
          {
            key: 'preview',
            label: (
              <span>
                <SearchOutlined />
                重命名预览
              </span>
            ),
            children: (
              <div>
                {previewData.length > 0 && currentPreviewRuleId && (
                  <div style={{ marginBottom: 16 }}>
                    <Alert
                      message={(() => {
                        const rule = renameRules.find(r => r.id === currentPreviewRuleId);
                        return `当前使用规则: ${rule?.name} (${rule?.mode === 'physical' ? '物理重命名' : '虚拟重命名'})`;
                      })()}
                      description={(() => {
                        const rule = renameRules.find(r => r.id === currentPreviewRuleId);
                        return `模板: ${rule?.template}`;
                      })()}
                      type="info"
                      style={{ marginBottom: 16 }}
                    />
                    
                    <Space>
                      <Button
                        type="primary"
                        onClick={() => {
                          if (currentPreviewRuleId) {
                            executeRename(currentPreviewRuleId);
                          } else {
                            message.error('请先生成预览');
                          }
                        }}
                        loading={isLoading}
                        disabled={previewData.every(item => !item.isValid) || !currentPreviewRuleId}
                      >
                        执行重命名
                      </Button>
                      <Button onClick={() => {
                        setPreviewData([]);
                        setCurrentPreviewRuleId('');
                      }}>
                        清除预览
                      </Button>
                    </Space>
                  </div>
                )}

                <Table
                  dataSource={previewData}
                  columns={previewColumns}
                  rowKey="id"
                  pagination={{ pageSize: 10 }}
                  locale={{ emptyText: '请先在批量重命名页面生成预览' }}
                />
              </div>
            )
          },
          {
            key: 'history',
            label: (
              <span>
                <HistoryOutlined />
                重命名历史
              </span>
            ),
            children: (
              <div>
                <Alert
                  message="⚠️ 重要：请谨慎删除重命名历史记录"
                  description={
                    <div>
                      <div style={{ marginBottom: 8 }}>
                        <strong>删除历史记录的严重后果：</strong>
                      </div>
                      <ul style={{ margin: 0, paddingLeft: 20 }}>
                        <li><strong>永久失去回退能力：</strong>一旦删除历史记录，您将无法撤销任何重命名操作</li>
                        <li><strong>物理重命名无法恢复：</strong>删除后，物理重命名的文件无法自动恢复原始文件名</li>
                        <li><strong>虚拟重命名失去追踪：</strong>无法还原虚拟重命名，视频标题修改将永久生效</li>
                        <li><strong>数据溯源中断：</strong>失去重命名操作的完整审计追踪</li>
                      </ul>
                      <div style={{ marginTop: 8, color: '#d48806' }}>
                        <strong>建议：</strong>除非确实需要清理空间，否则建议保留历史记录以备不时之需
                      </div>
                    </div>
                  }
                  type="warning"
                  style={{ marginBottom: 16 }}
                  showIcon
                />

                <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <Space>
                      <Button onClick={loadRenameHistory} loading={isLoading}>
                        刷新
                      </Button>
                      <Popconfirm
                        title="⚠️ 危险操作：确定清空所有重命名历史？"
                        description={
                          <div style={{ maxWidth: 300 }}>
                            <div style={{ marginBottom: 8, fontWeight: 'bold', color: '#d4380d' }}>
                              此操作将造成不可逆的后果：
                            </div>
                            <ul style={{ margin: 0, paddingLeft: 15, fontSize: '12px' }}>
                              <li>所有重命名操作将无法回退</li>
                              <li>物理重命名无法恢复原文件名</li>
                              <li>虚拟重命名无法还原标题</li>
                              <li>完全失去操作审计追踪</li>
                            </ul>
                            <div style={{ marginTop: 8, color: '#d48806', fontSize: '12px' }}>
                              请确保您真的需要清空历史记录！
                            </div>
                          </div>
                        }
                        onConfirm={async () => {
                          try {
                            setIsLoading(true);
                            await window.electronAPI.clearRenameHistory();
                            message.success('历史记录已清空');
                            loadRenameHistory();
                          } catch (error) {
                            message.error('清空历史记录失败');
                          } finally {
                            setIsLoading(false);
                          }
                        }}
                        okText="确定"
                        cancelText="取消"
                      >
                        <Button danger loading={isLoading}>
                          清空历史
                        </Button>
                      </Popconfirm>
                    </Space>
                  </div>
                  
                  <div style={{ fontSize: '14px', color: '#666' }}>
                    总计 {renameHistory.length} 条记录 | 
                    可回退 {renameHistory.filter(h => h.canRevert && !h.reverted).length} 条 | 
                    已回退 {renameHistory.filter(h => h.reverted).length} 条
                  </div>
                </div>

                <Table
                  dataSource={renameHistory}
                  columns={historyColumns}
                  rowKey="id"
                  pagination={{ 
                    pageSize: 10,
                    showSizeChanger: true,
                    showQuickJumper: true,
                    showTotal: (total, range) => `第 ${range[0]}-${range[1]} 条，共 ${total} 条记录`
                  }}
                  scroll={{ x: 1200 }}
                  locale={{ emptyText: '暂无重命名历史记录' }}
                />
              </div>
            )
          }
        ]}
      />
      
      {/* 创建/编辑规则的Modal */}
      <Modal
        title={editingRule ? '编辑重命名规则' : '创建重命名规则'}
        open={showRuleForm}
        onCancel={() => {
          setShowRuleForm(false);
          setEditingRule(null);
          setCurrentTemplate('');
          setSelectedPreset(undefined);
          form.resetFields();
        }}
        footer={null}
        width={800}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleSaveRule}
          initialValues={{ enabled: true, mode: 'virtual' }}
        >
          <Form.Item
            name="name"
            label="规则名称"
            rules={[{ required: true, message: '请输入规则名称' }]}
          >
            <Input placeholder="输入规则名称" />
          </Form.Item>

          <Form.Item label="预设模板">
            <Select
              placeholder="选择预设模板（可选）"
              allowClear
              value={selectedPreset}
              onChange={(value) => {
                setSelectedPreset(value);
                if (value) {
                  setCurrentTemplate(value);
                  form.setFieldsValue({ template: value });
                  message.success('模板已应用');
                } else {
                  setCurrentTemplate('');
                  form.setFieldsValue({ template: '' });
                }
              }}
            >
              {PRESET_TEMPLATES.map((preset) => (
                <Option key={preset.template} value={preset.template}>
                  {preset.name} - {preset.description}
                </Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item
            name="template"
            label="重命名模板"
            rules={[{ required: true, message: '请输入重命名模板' }]}
          >
            <TextArea
              rows={3}
              placeholder="例如: {title} ({year}) [{quality}].{ext}"
              value={currentTemplate}
              onChange={(e) => {
                const value = e.target.value;
                setCurrentTemplate(value);
                form.setFieldsValue({ template: value });
                // 🔥 手动输入时，清空预设模板选择
                setSelectedPreset(undefined);
              }}
            />
          </Form.Item>

          {/* 模板预览 */}
          {currentTemplate && (
            <div style={{ marginBottom: 16 }}>
              <Alert
                message="🔍 模板预览"
                description={
                  <div style={{ marginTop: 8 }}>
                    <div style={{ fontSize: '12px', color: '#666', marginBottom: 4 }}>
                      当前模板：
                    </div>
                    <div style={{ 
                      fontFamily: 'monospace', 
                      backgroundColor: '#f5f5f5', 
                      padding: '4px 8px', 
                      borderRadius: '4px',
                      fontSize: '13px',
                      border: '1px solid #e8e8e8'
                    }}>
                      {currentTemplate}
                    </div>
                    <div style={{ fontSize: '12px', color: '#666', marginTop: 8, marginBottom: 4 }}>
                      示例输出：
                    </div>
                    <div style={{ 
                      fontFamily: 'monospace', 
                      backgroundColor: '#e6f7ff', 
                      padding: '4px 8px', 
                      borderRadius: '4px',
                      fontSize: '13px',
                      border: '1px solid #91d5ff',
                      color: '#1890ff'
                    }}>
                      {currentTemplate
                        .replace(/{title}/g, '复仇者联盟4')
                        .replace(/{year}/g, '2019')
                        .replace(/{quality}/g, '1080p')
                        .replace(/{source}/g, 'BluRay')
                        .replace(/{codec}/g, 'H264')
                        .replace(/{language}/g, 'Chinese')
                        .replace(/{group}/g, 'RARBG')
                        .replace(/{season}/g, '01')
                        .replace(/{episode}/g, '01')
                        .replace(/{ext}/g, 'mp4')
                      }
                    </div>
                  </div>
                }
                type="success"
                style={{ marginBottom: 0 }}
                showIcon
              />
            </div>
          )}

          {/* 可用变量说明 */}
          <div style={{ marginBottom: 24 }}>
            <Alert
              message="📝 可用变量说明"
              description={
                <div style={{ marginTop: 12 }}>
                  <div style={{ marginBottom: 12, fontSize: '13px', color: '#666' }}>
                    点击变量名可以快速插入到模板中
                  </div>
                  
                  {Object.entries(VARIABLES_BY_CATEGORY).map(([category, variables]) => (
                    <div key={category} style={{ marginBottom: 16 }}>
                      <div style={{ 
                        fontWeight: 'bold', 
                        fontSize: '14px', 
                        marginBottom: 8,
                        color: '#1890ff',
                        borderBottom: '1px solid #e8f4fd',
                        paddingBottom: 4
                      }}>
                        {category}
                      </div>
                      <Row gutter={[8, 8]}>
                        {variables.map((variable) => (
                          <Col span={12} key={variable.variable}>
                            <div
                              style={{
                                padding: '6px 8px',
                                border: '1px solid #e8e8e8',
                                borderRadius: '4px',
                                backgroundColor: '#fafafa',
                                cursor: 'pointer',
                                transition: 'all 0.2s',
                                fontSize: '12px'
                              }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.backgroundColor = '#e6f7ff';
                                e.currentTarget.style.borderColor = '#1890ff';
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.backgroundColor = '#fafafa';
                                e.currentTarget.style.borderColor = '#e8e8e8';
                              }}
                              onClick={() => {
                                // 插入变量到模板末尾（简化版）
                                const currentValue = currentTemplate || '';
                                const newTemplate = currentValue + (currentValue ? ' ' : '') + variable.variable;
                                setCurrentTemplate(newTemplate);
                                form.setFieldsValue({ template: newTemplate });
                                // 🔥 手动插入变量时，清空预设模板选择
                                setSelectedPreset(undefined);
                                message.success(`已插入变量 ${variable.variable}`);
                              }}
                            >
                              <div style={{ 
                                fontFamily: 'monospace', 
                                fontWeight: 'bold', 
                                color: '#1890ff',
                                marginBottom: 2
                              }}>
                                {variable.variable}
                              </div>
                              <div style={{ color: '#666', marginBottom: 2 }}>
                                {variable.description}
                              </div>
                              <div style={{ color: '#999', fontSize: '11px' }}>
                                例: {variable.example}
                              </div>
                            </div>
                          </Col>
                        ))}
                      </Row>
                    </div>
                  ))}
                  
                  <div style={{ 
                    marginTop: 16, 
                    padding: '8px 12px', 
                    backgroundColor: '#f6ffed', 
                    border: '1px solid #b7eb8f',
                    borderRadius: '4px',
                    fontSize: '12px'
                  }}>
                    <strong>💡 提示：</strong>
                    <ul style={{ margin: '4px 0 0 16px', padding: 0 }}>
                      <li>变量名区分大小写，必须用大括号 {} 包围</li>
                      <li>如果文件中无法解析某个变量，将保持原样显示</li>
                      <li>{'{ext}'} 变量会自动保留文件扩展名</li>
                      <li>可以组合多个变量和固定文本创建复杂的命名规则</li>
                    </ul>
                  </div>
                </div>
              }
              type="info"
              style={{ marginBottom: 0 }}
              showIcon
            />
          </div>

          <Form.Item
            name="mode"
            label="重命名模式"
            rules={[{ required: true }]}
          >
            <Select>
              <Option value="virtual">虚拟重命名（仅修改显示名称）</Option>
              <Option value="physical">物理重命名（修改实际文件名）</Option>
            </Select>
          </Form.Item>

          <Form.Item name="description" label="描述">
            <TextArea rows={2} placeholder="规则描述（可选）" />
          </Form.Item>

          <Form.Item name="enabled" valuePropName="checked">
            <Switch checkedChildren="启用" unCheckedChildren="禁用" />
          </Form.Item>

          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit">
                {editingRule ? '更新' : '创建'}
              </Button>
              <Button onClick={() => {
                setShowRuleForm(false);
                setCurrentTemplate('');
                setSelectedPreset(undefined);
                form.resetFields();
              }}>
                取消
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
      
      {/* 🔥 新增：批量重命名进度显示Modal */}
      <Modal
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <ThunderboltOutlined />
            <span>批量重命名进度</span>
          </div>
        }
        open={batchProgress.visible}
        footer={null}
        closable={batchProgress.isComplete}
        maskClosable={false}
        onCancel={() => setBatchProgress(prev => ({ ...prev, visible: false }))}
        width={500}
      >
        <div style={{ padding: '16px 0' }}>
          {/* 主进度条 */}
          <div style={{ marginBottom: 24 }}>
            <Progress
              percent={batchProgress.total > 0 ? Math.round((batchProgress.current / batchProgress.total) * 100) : 0}
              status={batchProgress.hasError ? 'exception' : batchProgress.isComplete ? 'success' : 'active'}
              strokeColor={{
                '0%': '#108ee9',
                '100%': '#87d068',
              }}
            />
            <div style={{ 
              display: 'flex', 
              justifyContent: 'space-between', 
              marginTop: 8,
              fontSize: '12px',
              color: '#666'
            }}>
              <span>{batchProgress.current} / {batchProgress.total}</span>
              <span>
                {batchProgress.total > 0 ? Math.round((batchProgress.current / batchProgress.total) * 100) : 0}%
              </span>
            </div>
          </div>

          {/* 状态信息 */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ 
              fontSize: '14px', 
              fontWeight: 500,
              marginBottom: 8,
              color: batchProgress.hasError ? '#ff4d4f' : '#262626'
            }}>
              {batchProgress.message}
            </div>
            
            {batchProgress.fileName && (
              <div style={{ 
                fontSize: '12px', 
                color: '#666',
                backgroundColor: '#f5f5f5',
                padding: '4px 8px',
                borderRadius: '4px',
                fontFamily: 'monospace'
              }}>
                📄 {batchProgress.fileName}
              </div>
            )}
          </div>

          {/* 错误信息 */}
          {batchProgress.hasError && batchProgress.errorMessage && (
            <Alert
              message="操作失败"
              description={batchProgress.errorMessage}
              type="error"
              showIcon
              style={{ marginBottom: 16 }}
            />
          )}

          {/* 完成统计 */}
          {batchProgress.isComplete && !batchProgress.hasError && (
            <div style={{ 
              backgroundColor: '#f6ffed',
              border: '1px solid #b7eb8f',
              borderRadius: '6px',
              padding: '12px',
              marginBottom: 16
            }}>
              <div style={{ fontSize: '14px', fontWeight: 500, marginBottom: 8, color: '#52c41a' }}>
                🎉 批量重命名完成！
              </div>
              <div style={{ fontSize: '12px', color: '#666' }}>
                <Space split={<span style={{ color: '#d9d9d9' }}>|</span>}>
                  <span>✅ 成功: {batchProgress.successCount} 个</span>
                  {batchProgress.failureCount > 0 && (
                    <span style={{ color: '#ff4d4f' }}>❌ 失败: {batchProgress.failureCount} 个</span>
                  )}
                </Space>
              </div>
            </div>
          )}

          {/* 加载动画 */}
          {!batchProgress.isComplete && !batchProgress.hasError && (
            <div style={{ 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center',
              gap: 8,
              color: '#666',
              fontSize: '12px'
            }}>
              <Spin size="small" />
              <span>正在处理中，请耐心等待...</span>
            </div>
          )}

          {/* 完成后的操作按钮 */}
          {batchProgress.isComplete && (
            <div style={{ 
              display: 'flex', 
              justifyContent: 'flex-end',
              marginTop: 16,
              gap: 8
            }}>
              <Button 
                type="primary" 
                onClick={() => setBatchProgress(prev => ({ ...prev, visible: false }))}
              >
                关闭
              </Button>
            </div>
          )}
        </div>
      </Modal>
    </Modal>
  );
};

export default RenameManager;
