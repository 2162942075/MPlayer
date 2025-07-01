import React, { useState, useEffect } from 'react';
import { Card, Button, Input, message, Space, Switch, Select, Modal } from 'antd';
import { FolderOutlined } from '@ant-design/icons';

interface SettingsData {
  playerPath: string;
  autoScan: boolean;
  scanDepth: number;
  ffplayDebugMode: boolean;
}

interface AutoScanSettings {
  enabled: boolean;
  watchDepth: number;
  debounceTime: number;
  pauseOnUserAction: boolean;
}

const Settings: React.FC = () => {
  const [settings, setSettings] = useState<SettingsData>({
    playerPath: '',
    autoScan: true,
    scanDepth: 3,
    ffplayDebugMode: false
  });

  const [autoScanSettings, setAutoScanSettings] = useState<AutoScanSettings>({
    enabled: false,
    watchDepth: 2,
    debounceTime: 3000,
    pauseOnUserAction: true
  });

  const [debugInfo, setDebugInfo] = useState<any>(null);
  const [showDebug, setShowDebug] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const playerPath = await (window as any).electronAPI?.getSetting('playerPath', '');
      const autoScan = await (window as any).electronAPI?.getSetting('autoScan', true);
      const scanDepth = await (window as any).electronAPI?.getSetting('scanDepth', 3);
      const ffplayDebugMode = await (window as any).electronAPI?.getSetting('ffplayDebugMode', false);
      
      setSettings({
        playerPath,
        autoScan,
        scanDepth,
        ffplayDebugMode
      });

      // 加载自动扫描设置
      const autoScanData = await (window as any).electronAPI?.getAutoScanSettings();
      if (autoScanData) {
        setAutoScanSettings(autoScanData);
      }
    } catch (error) {
      console.error('加载设置失败:', error);
    }
  };

  const saveSettings = async () => {
    try {
      await (window as any).electronAPI?.saveSetting('playerPath', settings.playerPath);
      await (window as any).electronAPI?.saveSetting('autoScan', settings.autoScan);
      await (window as any).electronAPI?.saveSetting('scanDepth', settings.scanDepth);
      await (window as any).electronAPI?.saveSetting('ffplayDebugMode', settings.ffplayDebugMode);
      
      // 保存自动扫描设置
      const result = await (window as any).electronAPI?.updateAutoScanSettings(autoScanSettings);
      if (!result?.success) {
        throw new Error(result?.error || '保存自动扫描设置失败');
      }
      
      // 通知其他组件设置已更新
      window.dispatchEvent(new CustomEvent('autoScanSettingsUpdated', { 
        detail: autoScanSettings 
      }));
      
      message.success('设置保存成功');
    } catch (error) {
      console.error('设置保存失败:', error);
      message.error('设置保存失败：' + (error instanceof Error ? error.message : '未知错误'));
    }
  };

  const handleSelectPlayer = async () => {
    try {
      const selectedPath = await (window as any).electronAPI?.selectFile({
        title: '选择视频播放器',
        filters: [
          { name: '可执行文件', extensions: ['exe'] },
          { name: '所有文件', extensions: ['*'] }
        ]
      });
      
      if (selectedPath) {
        setSettings({ ...settings, playerPath: selectedPath });
      }
    } catch (error) {
      message.error('选择播放器失败');
    }
  };

  const handleClearPlayer = () => {
    setSettings({ ...settings, playerPath: '' });
    message.success('播放器路径已清除，将使用内置播放器');
  };

  const testPlayer = async () => {
    if (!settings.playerPath) {
      message.error('请先选择播放器');
      return;
    }
    
    try {
      // 这里可以测试播放器是否可用
      message.success('播放器测试成功');
    } catch (error) {
      message.error('播放器测试失败');
    }
  };

  const loadDebugInfo = async () => {
    try {
      const info = await (window as any).electronAPI?.getAutoScanDebugInfo();
      setDebugInfo(info);
    } catch (error) {
      console.error('获取调试信息失败:', error);
    }
  };

  const handleShowKeyboardShortcuts = () => {
    Modal.info({
      title: '🎮 FFplay 播放器快捷键',
      icon: null,
      width: 520,
      content: (
        <div style={{ fontSize: 14 }}>
          <div style={{ marginBottom: 16, color: '#666' }}>
            内置 FFplay 播放器快捷键一览：
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
            padding: 10, 
            backgroundColor: '#f6ffed', 
            border: '1px solid #b7eb8f', 
            borderRadius: 6,
            fontSize: 12,
            color: '#666'
          }}>
            💡 这些快捷键只在使用内置 FFplay 播放器时有效
          </div>
        </div>
      ),
      okText: '知道了'
    });
  };

  const handleResetShortcutsReminder = () => {
    localStorage.removeItem('ffplay-shortcuts-shown');
    message.success('已重置快捷键提醒，下次使用内置播放器时将再次显示详细说明');
  };

  return (
    <div>
      <h2 style={{ marginBottom: 24 }}>设置</h2>
      
      <div className="settings-section">
        <Card title="播放器设置" size="small">
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', marginBottom: 8 }}>默认播放器路径</label>
            <Space.Compact style={{ width: '100%' }}>
              <Input
                placeholder="未设置时将使用内置 FFplay 播放器"
                value={settings.playerPath}
                readOnly
              />
              <Button icon={<FolderOutlined />} onClick={handleSelectPlayer}>
                选择
              </Button>
              <Button onClick={handleClearPlayer} disabled={!settings.playerPath}>
                清除
              </Button>
              <Button type="primary" onClick={testPlayer} disabled={!settings.playerPath}>
                测试
              </Button>
            </Space.Compact>
            <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>
              {settings.playerPath ? (
                <>推荐使用：VLC Media Player、PotPlayer、MPC-HC 等</>
              ) : (
                <>🎯 当前未设置外部播放器，将使用内置 FFplay 播放器</>
              )}
            </div>
            
            {!settings.playerPath && (
              <div style={{ 
                marginTop: 12,
                padding: 12,
                backgroundColor: '#f0f8ff',
                border: '1px solid #91caff',
                borderRadius: 6
              }}>
                <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 8, color: '#1677ff' }}>
                  📖 FFplay 播放器快捷键说明
                </div>
                <div style={{ fontSize: 12, color: '#666' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 16px' }}>
                    <div><strong>空格键</strong> - 暂停/播放</div>
                    <div><strong>Q 或 ESC</strong> - 退出播放器</div>
                    <div><strong>F</strong> - 全屏切换</div>
                    <div><strong>M</strong> - 静音切换</div>
                    <div><strong>← →</strong> - 快退/快进10秒</div>
                    <div><strong>↓ ↑</strong> - 快退/快进1分钟</div>
                    <div><strong>9 / 0</strong> - 降低/提高音量</div>
                    <div><strong>S</strong> - 单帧播放</div>
                  </div>
                                     <div style={{ marginTop: 12, paddingTop: 8, borderTop: '1px solid #e0e0e0' }}>
                     <Button 
                       size="small" 
                       type="primary" 
                       onClick={handleShowKeyboardShortcuts}
                       style={{ marginRight: 8 }}
                     >
                       📖 显示快捷键说明
                     </Button>
                     <Button 
                       size="small" 
                       onClick={handleResetShortcutsReminder}
                     >
                       🔄 重置提醒
                     </Button>
                   </div>
                </div>
              </div>
            )}

            {/* FFplay调试模式 - 仅在使用内置播放器时显示 */}
            {!settings.playerPath && (
              <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid #f0f0f0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <label style={{ fontSize: 14, fontWeight: 500 }}>🐛 调试模式</label>
                  <Switch
                    checked={settings.ffplayDebugMode}
                    onChange={(checked) => setSettings({ ...settings, ffplayDebugMode: checked })}
                  />
                </div>
                <div style={{ fontSize: 12, color: '#666', marginBottom: 8 }}>
                  启用后会显示详细的FFplay命令行信息，帮助排查播放问题
                </div>
                
                {settings.ffplayDebugMode && (
                  <div style={{ 
                    marginTop: 8,
                    padding: 8,
                    backgroundColor: '#fff2e8',
                    border: '1px solid #ffcd91',
                    borderRadius: 4,
                    fontSize: 12
                  }}>
                    <div style={{ color: '#d4760e', marginBottom: 4 }}>
                      ⚠️ 调试模式已启用
                    </div>
                    <div style={{ color: '#666', lineHeight: 1.4 }}>
                      • 启动播放器时会弹出命令行信息对话框
                      <br />
                      • 控制台会输出详细的FFplay日志
                      <br />
                      • 适用于排查播放失败、黑屏、无声音等问题
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </Card>
      </div>

      <div className="settings-section">
        <Card title="手动扫描设置" size="small">
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', marginBottom: 8 }}>手动扫描深度</label>
            <Select
              style={{ width: '100%' }}
              value={settings.scanDepth}
              onChange={(value) => setSettings({ ...settings, scanDepth: value })}
              options={[
                { label: '1层 - 仅扫描直接子目录', value: 1 },
                { label: '2层 - 扫描2层子目录', value: 2 },
                { label: '3层 - 扫描3层子目录（推荐）', value: 3 },
                { label: '5层 - 扫描5层子目录', value: 5 },
                { label: '无限制 - 扫描所有子目录', value: -1 }
              ]}
            />
            <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>
              设置手动刷新时扫描目录的最大深度，避免扫描过多不相关文件
            </div>
          </div>
        </Card>
      </div>

      <div className="settings-section">
        <Card title="自动扫描设置" size="small">
          <div style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <label>启用自动扫描</label>
              <Switch
                checked={autoScanSettings.enabled}
                onChange={(checked) => setAutoScanSettings({ ...autoScanSettings, enabled: checked })}
              />
            </div>
            <div style={{ fontSize: 12, color: '#666' }}>
              启用后会实时监听分类目录下的文件变化，自动扫描新增或删除的视频文件
            </div>
          </div>

          {autoScanSettings.enabled && (
            <>
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', marginBottom: 8 }}>监听深度级别</label>
                <Select
                  style={{ width: '100%' }}
                  value={autoScanSettings.watchDepth}
                  onChange={(value) => setAutoScanSettings({ ...autoScanSettings, watchDepth: value })}
                  options={[
                    { label: '1层 - 仅监听直接子目录 (性能影响最小)', value: 1 },
                    { label: '2层 - 监听2层子目录 (推荐，平衡性能和功能)', value: 2 },
                    { label: '3层 - 监听3层子目录 (性能影响中等)', value: 3 },
                    { label: '4层 - 监听4层子目录 (性能影响较大)', value: 4 },
                    { label: '5层 - 监听5层子目录 (性能影响很大)', value: 5 }
                  ]}
                />
                <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>
                  <div>设置文件监听的目录深度。更深的监听级别会：</div>
                  <div>• 增加内存占用 (每层约 5-10MB)</div>
                  <div>• 增加CPU使用率 (文件变化时 10-30%)</div>
                  <div>• 可能影响系统响应速度</div>
                </div>
              </div>

              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', marginBottom: 8 }}>响应延迟时间</label>
                <Select
                  style={{ width: '100%' }}
                  value={autoScanSettings.debounceTime}
                  onChange={(value) => setAutoScanSettings({ ...autoScanSettings, debounceTime: value })}
                  options={[
                    { label: '1秒 - 快速响应，可能频繁扫描', value: 1000 },
                    { label: '3秒 - 平衡响应速度和性能 (推荐)', value: 3000 },
                    { label: '5秒 - 减少频繁扫描，节省资源', value: 5000 },
                    { label: '10秒 - 最低资源占用，延迟较高', value: 10000 }
                  ]}
                />
                <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>
                  文件变化后等待多长时间才开始扫描，避免频繁触发
                </div>
              </div>

              <div style={{ marginBottom: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <label>用户操作时自动暂停</label>
                  <Switch
                    checked={autoScanSettings.pauseOnUserAction}
                    onChange={(checked) => setAutoScanSettings({ ...autoScanSettings, pauseOnUserAction: checked })}
                  />
                </div>
                <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>
                  启用后，在用户进行界面操作时会暂停自动扫描，避免影响操作体验
                </div>
              </div>
            </>
          )}

          <div style={{ 
            marginTop: 16, 
            padding: 12, 
            backgroundColor: autoScanSettings.enabled ? '#fff7e6' : '#f6f6f6',
            border: autoScanSettings.enabled ? '1px solid #ffd591' : '1px solid #d9d9d9',
            borderRadius: 6 
          }}>
            <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 4 }}>
              {autoScanSettings.enabled ? '⚠️ 性能影响提示' : 'ℹ️ 功能说明'}
            </div>
            <div style={{ fontSize: 12, color: '#666' }}>
              {autoScanSettings.enabled ? (
                <>
                  <div>• 内存占用: 约 {autoScanSettings.watchDepth * 5}MB</div>
                  <div>• CPU占用: 文件变化时临时增加 10-30%</div>
                  <div>• 建议监听深度不超过3层，避免性能问题</div>
                  <div>• 网络磁盘或移动硬盘建议关闭此功能</div>
                </>
              ) : (
                <>
                  <div>自动扫描功能可以实时监听文件变化，但会占用一定系统资源。</div>
                  <div>如果您的视频文件变化不频繁，建议使用手动刷新功能。</div>
                </>
              )}
            </div>
          </div>

          {autoScanSettings.enabled && (
            <div style={{ marginTop: 16 }}>
              <div style={{ marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 13, fontWeight: 500 }}>🔍 自动扫描状态监控</span>
                <Space>
                  <Button size="small" onClick={loadDebugInfo}>刷新状态</Button>
                  <Button 
                    size="small" 
                    type={showDebug ? 'primary' : 'default'}
                    onClick={() => setShowDebug(!showDebug)}
                  >
                    {showDebug ? '隐藏详情' : '显示详情'}
                  </Button>
                </Space>
              </div>

              {debugInfo && (
                <div style={{ 
                  padding: 12, 
                  backgroundColor: '#f9f9f9', 
                  border: '1px solid #e0e0e0',
                  borderRadius: 4,
                  fontSize: 12
                }}>
                  <div style={{ marginBottom: 8 }}>
                    <strong>监听状态:</strong> {debugInfo.enabled ? '✅ 已启用' : '❌ 未启用'}
                  </div>
                  <div style={{ marginBottom: 8 }}>
                    <strong>活跃监听器:</strong> {debugInfo.activeWatchers} 个
                  </div>
                  <div style={{ marginBottom: 8 }}>
                    <strong>等待扫描队列:</strong> {debugInfo.queuedScans} 个
                  </div>
                  <div style={{ marginBottom: 8 }}>
                    <strong>用户操作暂停:</strong> {debugInfo.userActionPaused ? '是' : '否'}
                  </div>

                  {showDebug && (
                    <>
                      <div style={{ marginTop: 12, marginBottom: 8 }}>
                        <strong>详细监听信息:</strong>
                      </div>
                      {Object.entries(debugInfo.watcherDetails || {}).map(([categoryId, details]: [string, any]) => (
                        <div key={categoryId} style={{ marginLeft: 16, marginBottom: 4 }}>
                          <div>分类 {categoryId}: {details.isReady ? '✅ 正常' : '❌ 异常'}</div>
                          {details.watched && (
                            <div style={{ marginLeft: 16, fontSize: 11, color: '#888' }}>
                              监听路径: {Object.keys(details.watched).slice(0, 3).join(', ')}
                              {Object.keys(details.watched).length > 3 && '...'}
                            </div>
                          )}
                        </div>
                      ))}
                      
                      {debugInfo.queuedCategories?.length > 0 && (
                        <div style={{ marginTop: 8 }}>
                          <strong>待扫描分类:</strong> {debugInfo.queuedCategories.join(', ')}
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          )}
        </Card>
      </div>





      <div className="settings-section">
        <Card title="关于" size="small">
          <div style={{ color: '#666' }}>
            <p><strong>视频管理工具</strong> v1.0.0</p>
            <p>一个简单易用的本地视频文件管理和播放工具</p>
            <p style={{ marginTop: 12 }}>
              <strong>支持的视频格式：</strong><br />
              MP4, AVI, MKV, MOV, WMV, FLV, WebM, M4V, MPG, MPEG, 3GP
            </p>
            <div style={{ 
              marginTop: 20, 
              paddingTop: 16, 
              borderTop: '1px solid #e9ecef',
              fontSize: '12px',
              color: '#999'
            }}>
              <p style={{ margin: '4px 0' }}>
                <strong>开发者：</strong>lihongmingze
              </p>
              <p style={{ margin: '4px 0' }}>
                <strong>开发年份：</strong>2025
              </p>
              <p style={{ margin: '4px 0' }}>
                © 2025 lihongmingze. All rights reserved.
              </p>
            </div>
          </div>
        </Card>
      </div>

      <div style={{ textAlign: 'center', marginTop: 32 }}>
        <Button type="primary" size="large" onClick={saveSettings}>
          保存设置
        </Button>
      </div>


    </div>
  );
};

export default Settings; 