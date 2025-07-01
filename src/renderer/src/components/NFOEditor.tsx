import React, { useState, useEffect } from 'react';
import {
  Modal,
  Form,
  Input,
  InputNumber,
  Select,
  Button,
  Divider,
  Rate,
  DatePicker,
  Spin,
  message,
  Tabs,
  Alert
} from 'antd';
import {
  FileTextOutlined,
  SaveOutlined,
  ReloadOutlined,
  InfoCircleOutlined,
  TagsOutlined,
  UserOutlined
} from '@ant-design/icons';
import dayjs from 'dayjs';

const { TextArea } = Input;
const { Option } = Select;

interface NFOData {
  originalTitle?: string;
  year?: number;
  genre?: string[];
  director?: string[];
  actors?: string[];
  plot?: string;
  rating?: number;
  runtime?: number;
  studio?: string;
  tagline?: string;
  country?: string;
  language?: string;
  imdbId?: string;
  tmdbId?: string;
  tvdbId?: string;
  premiered?: string;
  status?: string;
}

interface NFOEditorProps {
  visible: boolean;
  videoPath: string;
  videoTitle: string;
  onClose: () => void;
  onSave?: (nfoData: NFOData) => void;
}

const NFOEditor: React.FC<NFOEditorProps> = ({
  visible,
  videoPath,
  videoTitle,
  onClose,
  onSave
}) => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [nfoData, setNfoData] = useState<NFOData | null>(null);
  const [hasNFOFile, setHasNFOFile] = useState(false);
  const [nfoPath, setNfoPath] = useState<string>('');

  useEffect(() => {
    if (visible && videoPath) {
      loadNFOData();
    }
  }, [visible, videoPath]);

  const loadNFOData = async () => {
    setLoading(true);
    try {
      // 检查是否存在NFO文件
      const hasNFO = await (window as any).electronAPI?.hasNFOFile(videoPath);
      setHasNFOFile(hasNFO);

      // 获取NFO文件路径
      const nfoFilePath = await (window as any).electronAPI?.createNFOPath(videoPath);
      setNfoPath(nfoFilePath || '');

      let data: NFOData = {};
      
      if (hasNFO) {
        // 解析现有的NFO文件
        const parsedData = await (window as any).electronAPI?.parseNFO(videoPath);
        if (parsedData) {
          data = parsedData;
        }
      }

      setNfoData(data);
      
      // 设置表单初始值
      form.setFieldsValue({
        originalTitle: data.originalTitle || videoTitle,
        year: data.year,
        genre: data.genre || [],
        director: data.director || [],
        actors: data.actors || [],
        plot: data.plot,
        rating: data.rating,
        runtime: data.runtime,
        studio: data.studio,
        tagline: data.tagline,
        country: data.country,
        language: data.language,
        imdbId: data.imdbId,
        tmdbId: data.tmdbId,
        tvdbId: data.tvdbId,
        premiered: data.premiered ? dayjs(data.premiered) : undefined,
        status: data.status
      });
    } catch (error) {
      console.error('加载NFO数据失败:', error);
      message.error('加载NFO数据失败');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      const values = await form.validateFields();
      
      const nfoData: NFOData = {
        originalTitle: values.originalTitle,
        year: values.year,
        genre: values.genre || [],
        director: values.director || [],
        actors: values.actors || [],
        plot: values.plot,
        rating: values.rating,
        runtime: values.runtime,
        studio: values.studio,
        tagline: values.tagline,
        country: values.country,
        language: values.language,
        imdbId: values.imdbId,
        tmdbId: values.tmdbId,
        tvdbId: values.tvdbId,
        premiered: values.premiered ? values.premiered.format('YYYY-MM-DD') : undefined,
        status: values.status
      };

      // 保存NFO文件
      const success = await (window as any).electronAPI?.writeNFO(
        nfoPath,
        nfoData,
        'movie' // 可以根据需要调整为 'tvshow'
      );

      if (success) {
        message.success('NFO文件保存成功');
        setNfoData(nfoData);
        setHasNFOFile(true);
        onSave?.(nfoData);
      } else {
        message.error('NFO文件保存失败');
      }
    } catch (error) {
      console.error('保存NFO失败:', error);
      message.error('保存NFO失败');
    } finally {
      setSaving(false);
    }
  };

  const commonGenres = [
    '动作', '冒险', '喜剧', '犯罪', '剧情', '奇幻', '恐怖', '悬疑', '爱情', '科幻',
    '惊悚', '战争', '西部', '动画', '纪录片', '家庭', '音乐', '运动', '传记', '历史'
  ];

  const commonLanguages = [
    '中文', '英语', '日语', '韩语', '法语', '德语', '西班牙语', '意大利语', '俄语', '阿拉伯语'
  ];

  const commonCountries = [
    '中国', '美国', '日本', '韩国', '英国', '法国', '德国', '意大利', '加拿大', '澳大利亚'
  ];

  const renderBasicInfo = () => (
    <div>
      <Form.Item
        name="originalTitle"
        label="标题"
        rules={[{ required: true, message: '请输入标题' }]}
      >
        <Input placeholder="电影或剧集标题" />
      </Form.Item>

      <Form.Item name="year" label="年份">
        <InputNumber
          placeholder="发行年份"
          min={1900}
          max={new Date().getFullYear() + 5}
          style={{ width: '100%' }}
        />
      </Form.Item>

      <Form.Item 
        name="genre" 
        label="类型"
        help="💡 可以选择预设类型，也可以直接输入自定义类型（如：武侠、仙侠、都市等）"
      >
        <Select
          mode="tags"
          placeholder="选择预设类型或直接输入自定义类型..."
          style={{ width: '100%' }}
          allowClear
          showSearch
          filterOption={false}
          notFoundContent="直接输入自定义类型，按回车确认"
        >
          {commonGenres.map(genre => (
            <Option key={genre} value={genre}>{genre}</Option>
          ))}
        </Select>
      </Form.Item>

      <Form.Item name="director" label="导演">
        <Select
          mode="tags"
          placeholder="输入导演姓名"
          style={{ width: '100%' }}
        />
      </Form.Item>

      <Form.Item name="actors" label="演员">
        <Select
          mode="tags"
          placeholder="输入演员姓名"
          style={{ width: '100%' }}
        />
      </Form.Item>

      <Form.Item name="studio" label="制作公司">
        <Input placeholder="制作公司或发行商" />
      </Form.Item>
    </div>
  );

  const renderDetailInfo = () => (
    <div>
      <Form.Item name="plot" label="剧情简介">
        <TextArea
          rows={4}
          placeholder="输入剧情简介"
          maxLength={1000}
          showCount
        />
      </Form.Item>

      <Form.Item name="tagline" label="宣传语">
        <Input placeholder="电影宣传语或标语" />
      </Form.Item>

      <Form.Item name="rating" label="评分">
        <Rate allowHalf count={10} />
      </Form.Item>

      <Form.Item name="runtime" label="时长（分钟）">
        <InputNumber
          placeholder="运行时长"
          min={1}
          style={{ width: '100%' }}
        />
      </Form.Item>

      <Form.Item name="premiered" label="首映日期">
        <DatePicker style={{ width: '100%' }} />
      </Form.Item>

      <Form.Item name="status" label="状态">
        <Select placeholder="选择状态">
          <Option value="Released">已发布</Option>
          <Option value="Post Production">后期制作</Option>
          <Option value="In Production">制作中</Option>
          <Option value="Planned">计划中</Option>
          <Option value="Canceled">已取消</Option>
        </Select>
      </Form.Item>
    </div>
  );

  const renderMetadata = () => (
    <div>
      <Form.Item 
        name="language" 
        label="语言"
        help="💡 可以选择常用语言，也可以输入自定义语言（如：粤语、闽南语、客家话等）"
      >
        <Select
          mode="tags"
          placeholder="选择常用语言或直接输入自定义语言..."
          style={{ width: '100%' }}
          allowClear
          showSearch
          filterOption={false}
          notFoundContent="直接输入自定义语言，按回车确认"
        >
          {commonLanguages.map(language => (
            <Option key={language} value={language}>{language}</Option>
          ))}
        </Select>
      </Form.Item>

      <Form.Item 
        name="country" 
        label="国家/地区"
        help="💡 可以选择常见国家，也可以输入任意国家/地区（如：港台、新马、欧盟等）"
      >
        <Select
          mode="tags"
          placeholder="选择常见国家或直接输入自定义国家/地区..."
          style={{ width: '100%' }}
          allowClear
          showSearch
          filterOption={false}
          notFoundContent="直接输入自定义国家/地区，按回车确认"
        >
          {commonCountries.map(country => (
            <Option key={country} value={country}>{country}</Option>
          ))}
        </Select>
      </Form.Item>

      <Divider>外部ID</Divider>

      <Form.Item 
        name="imdbId" 
        label="IMDb ID"
        rules={[
          {
            pattern: /^tt\d+$/,
            message: 'IMDb ID格式应为 tt0123456'
          }
        ]}
      >
        <Input placeholder="tt0123456" />
      </Form.Item>

      <Form.Item name="tmdbId" label="TMDb ID">
        <Input placeholder="The Movie Database ID" />
      </Form.Item>

      <Form.Item name="tvdbId" label="TVDb ID">
        <Input placeholder="TheTVDB ID（电视剧）" />
      </Form.Item>
    </div>
  );

  const tabItems = [
    {
      key: 'basic',
      label: (
        <span>
          <InfoCircleOutlined />
          基本信息
        </span>
      ),
      children: renderBasicInfo()
    },
    {
      key: 'detail',
      label: (
        <span>
          <TagsOutlined />
          详细信息
        </span>
      ),
      children: renderDetailInfo()
    },
    {
      key: 'metadata',
      label: (
        <span>
          <UserOutlined />
          元数据
        </span>
      ),
      children: renderMetadata()
    }
  ];

  return (
    <Modal
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <FileTextOutlined />
          NFO信息编辑
        </div>
      }
      open={visible}
      onCancel={onClose}
      width={800}
      footer={[
        <Button key="cancel" onClick={onClose}>
          取消
        </Button>,
        <Button
          key="reload"
          icon={<ReloadOutlined />}
          onClick={loadNFOData}
          disabled={loading}
        >
          重新加载
        </Button>,
        <Button
          key="save"
          type="primary"
          icon={<SaveOutlined />}
          loading={saving}
          onClick={handleSave}
        >
          保存NFO文件
        </Button>
      ]}
    >
      <div style={{ maxHeight: '70vh', overflowY: 'auto' }}>
        {hasNFOFile && (
          <Alert
            message="发现现有NFO文件"
            description={`已找到NFO文件: ${nfoPath}`}
            type="info"
            showIcon
            style={{ marginBottom: 16 }}
          />
        )}

        {!hasNFOFile && (
          <Alert
            message="未发现NFO文件"
            description={`将创建新的NFO文件: ${nfoPath}`}
            type="warning"
            showIcon
            style={{ marginBottom: 16 }}
          />
        )}

        {loading ? (
          <div style={{ textAlign: 'center', padding: '50px 0' }}>
            <Spin size="large" />
            <div style={{ marginTop: 16 }}>加载NFO数据中...</div>
          </div>
        ) : (
          <Form
            form={form}
            layout="vertical"
            onFinish={handleSave}
          >
            <Tabs items={tabItems} />
          </Form>
        )}
      </div>
    </Modal>
  );
};

export default NFOEditor; 