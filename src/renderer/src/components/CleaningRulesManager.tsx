import React, { useState, useEffect } from 'react';
import {
  Card,
  Table,
  Button,
  Modal,
  Form,
  Input,
  Select,
  Switch,
  InputNumber,
  Space,
  Popconfirm,
  message,
  Row,
  Col,
  Typography,
  Divider,
  Alert,
  Tag
} from 'antd';
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  PlayCircleOutlined,
  BugOutlined,
  QuestionCircleOutlined
} from '@ant-design/icons';

const { Title, Text } = Typography;
const { TextArea } = Input;
const { Option } = Select;

interface CleaningRule {
  id: string;
  name: string;
  description?: string;
  pattern: string;
  replacement: string;
  type: 'regex' | 'string';
  enabled: boolean;
  priority: number;
  category: 'brackets' | 'garbage' | 'website' | 'custom';
  createdAt: number;
  updatedAt: number;
}

const categoryLabels = {
  brackets: '括号清理',
  garbage: '垃圾词汇',
  website: '网站信息',
  custom: '自定义'
};

const categoryColors = {
  brackets: 'blue',
  garbage: 'orange',
  website: 'red',
  custom: 'green'
};

const CleaningRulesManager: React.FC = () => {
  const [rules, setRules] = useState<CleaningRule[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [testModalVisible, setTestModalVisible] = useState(false);
  const [editingRule, setEditingRule] = useState<CleaningRule | null>(null);
  const [form] = Form.useForm();
  const [testForm] = Form.useForm();
  const [testResult, setTestResult] = useState<string>('');
  const [previewResult, setPreviewResult] = useState<string>('');

  // 加载清理规则
  const loadRules = async () => {
    setLoading(true);
    try {
      const result = await (window as any).electronAPI.getCleaningRules();
      setRules(result || []);
    } catch (error) {
      console.error('加载清理规则失败:', error);
      message.error('加载清理规则失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRules();
  }, []);

  // 保存规则
  const handleSave = async (values: any) => {
    try {
      const ruleData: CleaningRule = {
        id: editingRule?.id || `rule_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        name: values.name,
        description: values.description,
        pattern: values.pattern,
        replacement: values.replacement || '',
        type: values.type,
        enabled: values.enabled !== false,
        priority: values.priority || 100,
        category: values.category,
        createdAt: editingRule?.createdAt || Date.now(),
        updatedAt: Date.now()
      };

      const result = await (window as any).electronAPI.saveCleaningRule(ruleData);
      if (result.success) {
        message.success(editingRule ? '规则更新成功' : '规则创建成功');
        setModalVisible(false);
        setEditingRule(null);
        form.resetFields();
        await loadRules();
      } else {
        message.error(result.error || '保存失败');
      }
    } catch (error) {
      console.error('保存规则失败:', error);
      message.error('保存规则失败');
    }
  };

  // 删除规则
  const handleDelete = async (ruleId: string) => {
    try {
      const result = await (window as any).electronAPI.deleteCleaningRule(ruleId);
      if (result.success) {
        message.success('规则删除成功');
        await loadRules();
      } else {
        message.error(result.error || '删除失败');
      }
    } catch (error) {
      console.error('删除规则失败:', error);
      message.error('删除规则失败');
    }
  };

  // 切换规则状态
  const handleToggleStatus = async (ruleId: string, enabled: boolean) => {
    try {
      const result = await (window as any).electronAPI.updateCleaningRuleStatus(ruleId, enabled);
      if (result.success) {
        message.success(enabled ? '规则已启用' : '规则已禁用');
        await loadRules();
      } else {
        message.error(result.error || '状态更新失败');
      }
    } catch (error) {
      console.error('更新规则状态失败:', error);
      message.error('更新规则状态失败');
    }
  };

  // 测试单个规则
  const handleTestRule = async (rule: CleaningRule, testText: string) => {
    try {
      const result = await (window as any).electronAPI.testCleaningRule(rule, testText);
      if (result.success) {
        setTestResult(result.result);
      } else {
        message.error(result.error || '测试失败');
      }
    } catch (error) {
      console.error('测试规则失败:', error);
      message.error('测试规则失败');
    }
  };

  // 预览完整清理效果
  const handlePreviewEffect = async (testText: string) => {
    try {
      const result = await (window as any).electronAPI.previewCleaningEffect(testText);
      if (result.success) {
        setPreviewResult(result.result);
      } else {
        message.error(result.error || '预览失败');
      }
    } catch (error) {
      console.error('预览效果失败:', error);
      message.error('预览效果失败');
    }
  };

  // 打开编辑模态框
  const openEditModal = (rule?: CleaningRule) => {
    setEditingRule(rule || null);
    
    if (rule) {
      // 确保enabled字段是boolean类型
      const formValues = {
        ...rule,
        enabled: Boolean(rule.enabled) // 强制转换为boolean
      };
      form.setFieldsValue(formValues);
    } else {
      form.resetFields();
      form.setFieldsValue({
        type: 'regex',
        category: 'custom',
        enabled: true,
        priority: 100,
        replacement: ''
      });
    }
    
    setModalVisible(true);
  };

  // 打开测试模态框
  const openTestModal = () => {
    testForm.resetFields();
    testForm.setFieldsValue({
      testText: '【高清我去之夏灿芳 www.HD81HD.com】如影之翼.S01E01.1080p.WEB-DL.x264.mp4'
    });
    setTestResult('');
    setPreviewResult('');
    setTestModalVisible(true);
  };

  const columns = [
    {
      title: '优先级',
      dataIndex: 'priority',
      key: 'priority',
      width: 80,
      sorter: (a: CleaningRule, b: CleaningRule) => a.priority - b.priority,
      render: (priority: number) => (
        <Tag color={priority < 50 ? 'red' : priority < 100 ? 'orange' : 'blue'}>
          {priority}
        </Tag>
      )
    },
    {
      title: '规则名称',
      dataIndex: 'name',
      key: 'name',
      ellipsis: true
    },
    {
      title: '分类',
      dataIndex: 'category',
      key: 'category',
      width: 100,
      render: (category: string) => (
        <Tag color={categoryColors[category as keyof typeof categoryColors]}>
          {categoryLabels[category as keyof typeof categoryLabels]}
        </Tag>
      )
    },
    {
      title: '类型',
      dataIndex: 'type',
      key: 'type',
      width: 80,
      render: (type: string) => (
        <Tag color={type === 'regex' ? 'purple' : 'cyan'}>
          {type === 'regex' ? '正则' : '字符串'}
        </Tag>
      )
    },
    {
      title: '模式',
      dataIndex: 'pattern',
      key: 'pattern',
      ellipsis: true,
      render: (pattern: string) => (
        <Text code style={{ fontSize: '12px' }}>{pattern}</Text>
      )
    },
    {
      title: '状态',
      dataIndex: 'enabled',
      key: 'enabled',
      width: 80,
      render: (enabled: boolean, record: CleaningRule) => (
        <Switch
          size="small"
          checked={enabled}
          onChange={(checked) => handleToggleStatus(record.id, checked)}
        />
      )
    },
    {
      title: '操作',
      key: 'actions',
      width: 120,
      render: (_: any, record: CleaningRule) => (
        <Space size="small">
          <Button
            type="text"
            size="small"
            icon={<EditOutlined />}
            onClick={() => openEditModal(record)}
          />
          <Popconfirm
            title="确定要删除这个规则吗？"
            onConfirm={() => handleDelete(record.id)}
            okText="确定"
            cancelText="取消"
          >
            <Button
              type="text"
              size="small"
              danger
              icon={<DeleteOutlined />}
            />
          </Popconfirm>
        </Space>
      )
    }
  ];

  return (
    <div style={{ padding: '24px' }}>
      <Card>
        <div style={{ marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <Title level={4} style={{ margin: 0 }}>文件名清理规则管理</Title>
            <Text type="secondary">管理文件名清理的自定义规则，优先级数字越小越先执行</Text>
          </div>
          <Space>
            <Button
              type="default"
              icon={<BugOutlined />}
              onClick={openTestModal}
            >
              测试规则
            </Button>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => openEditModal()}
            >
              添加规则
            </Button>
          </Space>
        </div>

        <Alert
          message="使用说明"
          description={
            <div>
              <p>• <strong>优先级</strong>：数字越小越先执行（0-49高优先级，50-99中优先级，100+低优先级）</p>
              <p>• <strong>正则模式</strong>：支持复杂的模式匹配，如 <code>[【\\[].*?网站.*?[】\\]]</code></p>
              <p>• <strong>字符串模式</strong>：简单的文本替换，会自动转义特殊字符</p>
              <p>• <strong>替换内容</strong>：通常留空表示删除匹配的内容</p>
            </div>
          }
          type="info"
          showIcon
          style={{ marginBottom: '16px' }}
        />

        <Table
          columns={columns}
          dataSource={rules}
          rowKey="id"
          loading={loading}
          pagination={{ pageSize: 10 }}
          size="small"
        />
      </Card>

      {/* 编辑规则模态框 */}
      <Modal
        title={editingRule ? '编辑清理规则' : '添加清理规则'}
        open={modalVisible}
        onCancel={() => {
          setModalVisible(false);
          setEditingRule(null);
          form.resetFields();
        }}
        onOk={() => form.submit()}
        width={700}
        destroyOnClose
        afterOpenChange={(open) => {
          if (open && editingRule) {
            // Modal打开后重新设置表单值，确保Switch状态正确
            const formValues = {
              ...editingRule,
              enabled: Boolean(editingRule.enabled)
            };
            form.setFieldsValue(formValues);
          }
        }}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleSave}
        >
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="name"
                label="规则名称"
                rules={[{ required: true, message: '请输入规则名称' }]}
              >
                <Input placeholder="如：移除网站信息" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="category"
                label="分类"
                rules={[{ required: true, message: '请选择分类' }]}
              >
                <Select>
                  <Option value="brackets">括号清理</Option>
                  <Option value="garbage">垃圾词汇</Option>
                  <Option value="website">网站信息</Option>
                  <Option value="custom">自定义</Option>
                </Select>
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="type"
                label="类型"
                rules={[{ required: true, message: '请选择类型' }]}
              >
                <Select>
                  <Option value="regex">正则表达式</Option>
                  <Option value="string">字符串匹配</Option>
                </Select>
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="priority"
                label="优先级"
                rules={[{ required: true, message: '请输入优先级' }]}
              >
                <InputNumber
                  min={0}
                  max={999}
                  placeholder="数字越小越先执行"
                  style={{ width: '100%' }}
                />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item
            name="pattern"
            label="匹配模式"
            rules={[{ required: true, message: '请输入匹配模式' }]}
          >
            <Input
              placeholder="正则表达式或字符串"
            />
          </Form.Item>

          <Form.Item
            name="replacement"
            label="替换内容"
          >
            <Input placeholder="留空表示删除匹配内容" />
          </Form.Item>

          <Form.Item
            name="description"
            label="说明"
          >
            <TextArea rows={2} placeholder="规则的详细说明（可选）" />
          </Form.Item>

          <Form.Item
            name="enabled"
            valuePropName="checked"
          >
            <Switch 
              checked={form.getFieldValue('enabled')}
              onChange={(checked) => form.setFieldValue('enabled', checked)}
            /> 启用此规则
          </Form.Item>
        </Form>
      </Modal>

      {/* 测试规则模态框 */}
      <Modal
        title="测试清理规则"
        open={testModalVisible}
        onCancel={() => setTestModalVisible(false)}
        footer={null}
        width={800}
        destroyOnClose
      >
        <Form
          form={testForm}
          layout="vertical"
        >
          <Form.Item
            name="testText"
            label="测试文本"
            rules={[{ required: true, message: '请输入测试文本' }]}
          >
            <TextArea
              rows={3}
              placeholder="输入要测试的文件名..."
              onChange={() => {
                // 清理之前的测试结果
                setTestResult('');
                setPreviewResult('');
              }}
            />
          </Form.Item>

          <Space style={{ width: '100%', justifyContent: 'center', marginBottom: '16px' }}>
            <Button
              type="primary"
              icon={<PlayCircleOutlined />}
              onClick={() => {
                const testText = testForm.getFieldValue('testText');
                if (testText) {
                  handlePreviewEffect(testText);
                }
              }}
            >
              预览完整清理效果
            </Button>
          </Space>

          {previewResult && (
            <Alert
              message="完整清理结果"
              description={
                <div>
                  <Text strong>原文本：</Text>
                  <Text code>{testForm.getFieldValue('testText')}</Text>
                  <br />
                  <Text strong>清理后：</Text>
                  <Text code style={{ color: '#52c41a', backgroundColor: '#f6ffed' }}>
                    {previewResult}
                  </Text>
                </div>
              }
              type="success"
              style={{ marginTop: '16px' }}
            />
          )}

          <Divider>单个规则测试</Divider>

          {testResult && (
            <Alert
              message="单个规则测试结果"
              description={
                <div>
                  <Text strong>原文本：</Text>
                  <Text code>{testForm.getFieldValue('testText')}</Text>
                  <br />
                  <Text strong>处理后：</Text>
                  <Text code style={{ color: '#1890ff', backgroundColor: '#f0f9ff' }}>
                    {testResult}
                  </Text>
                </div>
              }
              type="info"
              style={{ marginBottom: '16px' }}
              closable
              onClose={() => setTestResult('')}
            />
          )}

          {rules.filter(r => r.enabled).map((rule) => (
            <Card
              key={rule.id}
              size="small"
              style={{ marginBottom: '8px' }}
              title={
                <Space>
                  <Tag color={categoryColors[rule.category]}>
                    {categoryLabels[rule.category]}
                  </Tag>
                  <span>{rule.name}</span>
                  <Tag color={rule.type === 'regex' ? 'purple' : 'cyan'}>
                    {rule.type}
                  </Tag>
                </Space>
              }
              extra={
                <Button
                  size="small"
                  onClick={() => {
                    const testText = testForm.getFieldValue('testText');
                    if (testText) {
                      handleTestRule(rule, testText);
                    } else {
                      message.warning('请先输入测试文本');
                    }
                  }}
                >
                  测试
                </Button>
              }
            >
              <Text code style={{ fontSize: '12px' }}>{rule.pattern}</Text>
            </Card>
          ))}
        </Form>
      </Modal>
    </div>
  );
};

export default CleaningRulesManager; 