import React, { useState, useEffect } from 'react';
import { Card, Button, Input, message, Modal, Space, Tag, Empty } from 'antd';
import { PlusOutlined, FolderOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';

interface Category {
  id: string;
  name: string;
  path: string;
  description?: string;
  color: string;
}

const CategoryManager: React.FC = () => {
  const [categories, setCategories] = useState<Category[]>([]);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [form, setForm] = useState({
    name: '',
    path: '',
    description: '',
    color: '#1890ff'
  });

  // 默认分类配色
  const colors = ['#1890ff', '#52c41a', '#fa541c', '#722ed1', '#13c2c2', '#eb2f96'];

  useEffect(() => {
    loadCategories();
  }, []);

  const loadCategories = async () => {
    try {
      // 这里会调用 Electron API 加载分类
      const savedCategories = await (window as any).electronAPI?.getCategories() || [];
      setCategories(savedCategories);
    } catch (error) {
      console.error('加载分类失败:', error);
    }
  };

  const handleSelectPath = async () => {
    try {
      const selectedPath = await (window as any).electronAPI?.selectDirectory();
      if (selectedPath) {
        setForm({ ...form, path: selectedPath });
      }
    } catch (error) {
      message.error('选择目录失败');
    }
  };

  const handleSave = async () => {
    if (!form.name.trim() || !form.path.trim()) {
      message.error('请填写分类名称和选择目录');
      return;
    }

    try {
      const categoryData = {
        id: editingCategory?.id || Date.now().toString(),
        ...form,
        name: form.name.trim(),
        description: form.description.trim()
      };

      await (window as any).electronAPI?.saveCategory(categoryData);
      
      if (editingCategory) {
        setCategories(categories.map(cat => cat.id === editingCategory.id ? categoryData : cat));
        message.success('分类更新成功');
      } else {
        setCategories([...categories, categoryData]);
        message.success('分类添加成功');
      }

      setIsModalVisible(false);
      resetForm();
    } catch (error) {
      message.error('保存分类失败');
    }
  };

  const handleEdit = (category: Category) => {
    setEditingCategory(category);
    setForm({
      name: category.name,
      path: category.path,
      description: category.description || '',
      color: category.color
    });
    setIsModalVisible(true);
  };

  const handleDelete = (categoryId: string) => {
    Modal.confirm({
      title: '确认删除',
      content: '删除分类不会删除实际文件，确定要删除这个分类吗？',
      onOk: async () => {
        try {
          const result = await (window as any).electronAPI?.deleteCategory(categoryId);
          if (result?.success) {
            setCategories(categories.filter(cat => cat.id !== categoryId));
            message.success('分类删除成功');
          } else {
            message.error('删除分类失败：' + (result?.error || '未知错误'));
          }
        } catch (error) {
          console.error('删除分类失败:', error);
          message.error('删除分类失败');
        }
      }
    });
  };

  const resetForm = () => {
    setForm({
      name: '',
      path: '',
      description: '',
      color: '#1890ff'
    });
    setEditingCategory(null);
  };

  const handleModalCancel = () => {
    setIsModalVisible(false);
    resetForm();
  };

  return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2>分类管理</h2>
        <Button 
          type="primary" 
          icon={<PlusOutlined />}
          onClick={() => setIsModalVisible(true)}
        >
          添加分类
        </Button>
      </div>

      {categories.length === 0 ? (
        <Empty
          description="暂无分类，点击上方按钮添加您的第一个分类"
          image={Empty.PRESENTED_IMAGE_SIMPLE}
        />
      ) : (
        <div className="category-grid">
          {categories.map((category) => (
            <Card
              key={category.id}
              hoverable
              className="category-card"
              style={{
                background: `linear-gradient(135deg, ${category.color}10, ${category.color}05)`,
                borderLeft: `4px solid ${category.color}`
              }}
              actions={[
                <EditOutlined key="edit" onClick={() => handleEdit(category)} />,
                <DeleteOutlined key="delete" onClick={() => handleDelete(category.id)} />
              ]}
            >
              <Card.Meta
                avatar={<FolderOutlined style={{ fontSize: 24, color: category.color }} />}
                title={
                  <Space>
                    {category.name}
                    <Tag color={category.color}>文件夹</Tag>
                  </Space>
                }
                description={
                  <div>
                    <div style={{ marginBottom: 8, fontSize: 12, color: '#666' }}>
                      {category.path}
                    </div>
                    {category.description && (
                      <div style={{ fontSize: 13 }}>{category.description}</div>
                    )}
                  </div>
                }
              />
            </Card>
          ))}
        </div>
      )}

      <Modal
        title={editingCategory ? '编辑分类' : '添加分类'}
        open={isModalVisible}
        onOk={handleSave}
        onCancel={handleModalCancel}
        width={500}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label>分类名称 *</label>
            <Input
              placeholder="如：动漫、电影、电视剧"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </div>
          
          <div>
            <label>目录路径 *</label>
            <Space.Compact style={{ width: '100%' }}>
              <Input
                placeholder="选择分类对应的文件夹"
                value={form.path}
                readOnly
              />
              <Button onClick={handleSelectPath}>选择目录</Button>
            </Space.Compact>
          </div>
          
          <div>
            <label>描述</label>
            <Input.TextArea
              placeholder="分类描述（可选）"
              rows={3}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </div>
          
          <div>
            <label>颜色</label>
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              {colors.map(color => (
                <div
                  key={color}
                  style={{
                    width: 24,
                    height: 24,
                    backgroundColor: color,
                    borderRadius: 4,
                    cursor: 'pointer',
                    border: form.color === color ? '2px solid #000' : '1px solid #d9d9d9'
                  }}
                  onClick={() => setForm({ ...form, color })}
                />
              ))}
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default CategoryManager; 