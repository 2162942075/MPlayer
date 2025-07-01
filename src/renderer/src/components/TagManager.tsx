import React, { useState, useEffect } from 'react';
import {
  Modal,
  Card,
  Button,
  Tag,
  Space,
  Form,
  Input,
  Select,
  // ColorPicker, // 🔥 移除ColorPicker导入，不再使用
  message,
  Popconfirm,
  Empty,
  Divider,
  Typography,
  Spin,
  Tooltip
} from 'antd';
import { 
  TagOutlined, 
  PlusOutlined, 
  EditOutlined, 
  DeleteOutlined,
  SaveOutlined,
  CloseOutlined
} from '@ant-design/icons';

const { Text, Title } = Typography;
const { Option } = Select;

interface VideoTag {
  id: string;
  name: string;
  color: string;
  category: 'genre' | 'quality' | 'language' | 'studio' | 'custom';
  description?: string;
  createdAt: number;
}

interface TagManagerProps {
  visible: boolean;
  onClose: () => void;
  onTagsChange?: () => void;
}

const TagManager: React.FC<TagManagerProps> = ({ visible, onClose, onTagsChange }) => {
  const [tags, setTags] = useState<VideoTag[]>([]);
  const [loading, setLoading] = useState(false);
  const [editingTag, setEditingTag] = useState<VideoTag | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [form] = Form.useForm();

  const tagCategories = [
    { value: 'genre', label: '类型' },
    { value: 'quality', label: '质量' },
    { value: 'language', label: '语言' },
    { value: 'studio', label: '制作方' },
    { value: 'custom', label: '自定义' }
  ];

  // 🔥 移除predefinedColors，不再需要颜色选择器
  // const predefinedColors = [
  //   '#f50', '#2db7f5', '#87d068', '#108ee9', '#f5222d',
  //   '#fa541c', '#fa8c16', '#faad14', '#fadb14', '#a0d911',
  //   '#52c41a', '#13c2c2', '#1890ff', '#2f54eb', '#722ed1',
  //   '#eb2f96', '#666', '#999'
  // ];

  useEffect(() => {
    if (visible) {
      loadTags();
    }
  }, [visible]);

  const loadTags = async () => {
    setLoading(true);
    try {
      const tagList = await (window as any).electronAPI?.getTags() || [];
      setTags(tagList);
    } catch (error) {
      console.error('加载标签失败:', error);
      message.error('加载标签失败');
    } finally {
      setLoading(false);
    }
  };

  const handleAddTag = () => {
    form.resetFields();
    setEditingTag(null);
    setIsEditing(true);
  };

  const handleEditTag = (tag: VideoTag) => {
    form.setFieldsValue({
      name: tag.name,
      category: tag.category,
      // color: tag.color, // 🔥 移除颜色字段设置，使用固定蓝色
      description: tag.description
    });
    setEditingTag(tag);
    setIsEditing(true);
  };

  const handleSaveTag = async () => {
    try {
      const values = await form.validateFields();
      
      const tagData: VideoTag = {
        id: editingTag?.id || `tag_${Date.now()}`,
        name: values.name,
        category: values.category,
        color: '#1890ff', // 🔥 固定使用蓝色
        description: values.description,
        createdAt: editingTag?.createdAt || Date.now()
      };

      const result = await (window as any).electronAPI?.saveTag(tagData);
      
      if (result?.success) {
        message.success(editingTag ? '标签更新成功' : '标签创建成功');
        setIsEditing(false);
        setEditingTag(null);
        await loadTags();
        onTagsChange?.();
      } else {
        message.error(result?.error || '保存标签失败');
      }
    } catch (error) {
      console.error('保存标签失败:', error);
      message.error('保存标签失败');
    }
  };

  const handleDeleteTag = async (tagId: string) => {
    try {
      const result = await (window as any).electronAPI?.deleteTag(tagId);
      
      if (result?.success) {
        message.success('标签删除成功');
        await loadTags();
        onTagsChange?.();
      } else {
        message.error(result?.error || '删除标签失败');
      }
    } catch (error) {
      console.error('删除标签失败:', error);
      message.error('删除标签失败');
    }
  };

  const getCategoryColor = (category: string) => {
    const colorMap = {
      genre: '#2db7f5',
      quality: '#87d068',
      language: '#f5222d',
      studio: '#722ed1',
      custom: '#666'
    };
    return colorMap[category as keyof typeof colorMap] || '#666';
  };

  const getCategoryLabel = (category: string) => {
    const labelMap = {
      genre: '类型',
      quality: '质量',
      language: '语言',
      studio: '制作方',
      custom: '自定义'
    };
    return labelMap[category as keyof typeof labelMap] || '未知';
  };

  const renderTagList = () => {
    if (loading) {
      return (
        <div style={{ textAlign: 'center', padding: '50px 0' }}>
          <Spin size="large" />
          <div style={{ marginTop: 16 }}>加载标签中...</div>
        </div>
      );
    }

    if (tags.length === 0) {
      return (
        <Empty
          description="暂无标签"
          image={Empty.PRESENTED_IMAGE_SIMPLE}
        >
          <Button type="primary" icon={<PlusOutlined />} onClick={handleAddTag}>
            创建第一个标签
          </Button>
        </Empty>
      );
    }

    // 按分类分组显示标签
    const groupedTags = tags.reduce((groups, tag) => {
      const category = tag.category || 'custom';
      if (!groups[category]) {
        groups[category] = [];
      }
      groups[category].push(tag);
      return groups;
    }, {} as Record<string, VideoTag[]>);

    return (
      <div>
        {Object.entries(groupedTags).map(([category, categoryTags]) => (
          <div key={category} style={{ marginBottom: 24 }}>
            <Title level={5} style={{ marginBottom: 12 }}>
              <Tag color={getCategoryColor(category)} style={{ marginRight: 8 }}>
                {getCategoryLabel(category)}
              </Tag>
              ({categoryTags.length})
            </Title>
            <Space wrap size={[8, 8]}>
              {categoryTags.map(tag => (
                <Card
                  key={tag.id}
                  size="small"
                  style={{ minWidth: 120 }}
                  actions={[
                    <Tooltip title="编辑" key="edit">
                      <EditOutlined onClick={() => handleEditTag(tag)} />
                    </Tooltip>,
                    <Popconfirm
                      key="delete"
                      title="确定删除这个标签吗？"
                      description="删除后将从所有视频中移除此标签"
                      onConfirm={() => handleDeleteTag(tag.id)}
                      okText="删除"
                      cancelText="取消"
                      okType="danger"
                    >
                      <Tooltip title="删除">
                        <DeleteOutlined style={{ color: '#ff4d4f' }} />
                      </Tooltip>
                    </Popconfirm>
                  ]}
                >
                  <div style={{ textAlign: 'center' }}>
                    <Tag color={tag.color} style={{ marginBottom: 8, fontSize: '14px' }}>
                      {tag.name}
                    </Tag>
                    {tag.description && (
                      <Text type="secondary" style={{ fontSize: '12px', display: 'block' }}>
                        {tag.description}
                      </Text>
                    )}
                  </div>
                </Card>
              ))}
            </Space>
          </div>
        ))}
      </div>
    );
  };

  return (
    <Modal
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <TagOutlined />
          标签管理
        </div>
      }
      open={visible}
      onCancel={onClose}
      width={800}
      footer={[
        <Button key="close" onClick={onClose}>
          关闭
        </Button>,
        <Button
          key="add"
          type="primary"
          icon={<PlusOutlined />}
          onClick={handleAddTag}
          disabled={isEditing}
        >
          添加标签
        </Button>
      ]}
    >
      <div style={{ maxHeight: '60vh', overflowY: 'auto' }}>
        {isEditing && (
          <Card
            title={editingTag ? '编辑标签' : '添加标签'}
            style={{ marginBottom: 16 }}
            extra={
              <Button
                type="text"
                icon={<CloseOutlined />}
                onClick={() => {
                  setIsEditing(false);
                  setEditingTag(null);
                }}
              />
            }
          >
            <Form
              form={form}
              layout="vertical"
              initialValues={{
                category: 'custom',
                color: '#1890ff'
              }}
            >
              <Form.Item
                name="name"
                label="标签名称"
                rules={[
                  { required: true, message: '请输入标签名称' },
                  { max: 20, message: '标签名称不能超过20个字符' }
                ]}
              >
                <Input placeholder="例如：动作片、高清、中文" />
              </Form.Item>

              <Form.Item
                name="category"
                label="标签分类"
                rules={[{ required: true, message: '请选择标签分类' }]}
              >
                <Select>
                  {tagCategories.map(category => (
                    <Option key={category.value} value={category.value}>
                      {category.label}
                    </Option>
                  ))}
                </Select>
              </Form.Item>

              {/* 🔥 隐藏颜色选择，使用固定蓝色 */}
              {/*
              <Form.Item
                name="color"
                label="标签颜色"
                rules={[{ required: true, message: '请选择标签颜色' }]}
              >
                <div>
                  <ColorPicker 
                    presets={[
                      {
                        label: '推荐颜色',
                        colors: predefinedColors
                      }
                    ]}
                  />
                  <div style={{ marginTop: 8 }}>
                    <Text type="secondary" style={{ fontSize: '12px' }}>
                      点击选择器可选择自定义颜色
                    </Text>
                  </div>
                </div>
              </Form.Item>
              */}

              <Form.Item
                name="description"
                label="描述（可选）"
              >
                <Input.TextArea
                  rows={2}
                  placeholder="标签的详细描述"
                  maxLength={100}
                  showCount
                />
              </Form.Item>

              <Form.Item>
                <Space>
                  <Button
                    type="primary"
                    icon={<SaveOutlined />}
                    onClick={handleSaveTag}
                  >
                    保存
                  </Button>
                  <Button
                    onClick={() => {
                      setIsEditing(false);
                      setEditingTag(null);
                    }}
                  >
                    取消
                  </Button>
                </Space>
              </Form.Item>
            </Form>
          </Card>
        )}

        <Divider style={{ marginBottom: 16 }} />

        {renderTagList()}
      </div>
    </Modal>
  );
};

export default TagManager; 