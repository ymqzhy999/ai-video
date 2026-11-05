import { useEffect, useState } from 'react';
import {
  Check,
  CircleAlert,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  RefreshCw,
  Server,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  ExternalLink,
  Cpu,
} from 'lucide-react';
import { useStudioStore } from '../store/studioStore';
import { DEFAULT_SETTINGS, type AppSettings, type ExecutionMode } from '../types/studio';
import {
  checkBackend,
  testAgnesKey,
  testDeepSeekConnection,
} from '../lib/api';
import { Modal } from './ui/Modal';
import { Switch } from './ui/Switch';

type SettingsTab = 'api' | 'execution' | 'editor';

type TestState = {
  status: 'idle' | 'testing' | 'success' | 'error';
  message?: string;
};

export function SettingsModal() {
  const activeModal = useStudioStore((state) => state.ui.activeModal);
  const settings = useStudioStore((state) => state.settings);
  const closeModal = useStudioStore((state) => state.closeModal);
  const updateSettings = useStudioStore((state) => state.updateSettings);
  const saveCurrent = useStudioStore((state) => state.saveCurrent);
  const clearAllData = useStudioStore((state) => state.clearAllData);
  const toast = useStudioStore((state) => state.toast);
  const setUI = useStudioStore((state) => state.setUI);
  const open = activeModal === 'settings';
  const [tab, setTab] = useState<SettingsTab>('api');
  const [draft, setDraft] = useState<AppSettings>(settings);
  const [showAgnesKey, setShowAgnesKey] = useState(false);
  const [showDeepSeekKey, setShowDeepSeekKey] = useState(false);
  const [deepseekTest, setDeepseekTest] = useState<TestState>({ status: 'idle' });
  const [agnesTest, setAgnesTest] = useState<TestState>({ status: 'idle' });
  const [backendTest, setBackendTest] = useState<TestState>({ status: 'idle' });
  const [saving, setSaving] = useState(false);
  const [resetConfirm, setResetConfirm] = useState(false);

  useEffect(() => {
    if (open) {
      setDraft(settings);
      setDeepseekTest({ status: 'idle' });
      setAgnesTest({ status: 'idle' });
      setBackendTest({ status: 'idle' });
      setResetConfirm(false);
    }
  }, [open, settings]);

  const patch = (value: Partial<AppSettings>) => setDraft((current) => ({ ...current, ...value }));

  const handleSave = async () => {
    setSaving(true);
    updateSettings(draft);
    await saveCurrent({ quiet: true });
    setSaving(false);
    toast({ type: 'success', title: '设置已保存', description: 'API Key 只保存在此设备。' });
    closeModal();
  };

  const runDeepSeekTest = async () => {
    setDeepseekTest({ status: 'testing', message: '正在请求 DeepSeek…' });
    try {
      const reply = await testDeepSeekConnection({ ...draft, deepseekApiKey: draft.deepseekApiKey.trim() });
      setDeepseekTest({ status: 'success', message: `连接成功：${reply.slice(0, 40)}` });
    } catch (error) {
      setDeepseekTest({
        status: 'error',
        message: error instanceof Error ? error.message : '连接失败',
      });
    }
  };

  const runAgnesTest = async () => {
    setAgnesTest({ status: 'testing', message: '正在检查端点…' });
    try {
      const message = await testAgnesKey(draft);
      setAgnesTest({ status: 'success', message });
    } catch (error) {
      setAgnesTest({
        status: 'error',
        message:
          error instanceof Error
            ? error.message
            : '端点检查失败。直连 API 在网页端可能被 CORS 限制，请用后端代理或 iOS App。',
      });
    }
  };

  const runBackendTest = async () => {
    setBackendTest({ status: 'testing', message: '正在连接后端…' });
    const ok = await checkBackend(draft);
    setBackendTest({
      status: ok ? 'success' : 'error',
      message: ok ? '后端 FastAPI 已连接' : '无法连接到后端服务，请确认已启动 server/main.py。',
    });
  };

  const modeCards: Array<{ id: ExecutionMode; label: string; description: string }> = [
    {
      id: 'auto',
      label: '自动',
      description: '有 Key 就调用真实 API，没有则明确标注模拟。适合学习。',
    },
    {
      id: 'mock',
      label: '始终模拟',
      description: '完全不调用生成 API，只演示节点流程。',
    },
    {
      id: 'live',
      label: '仅真实',
      description: '缺少 Key 时直接报错，绝不悄悄降级。',
    },
  ];

  return (
    <Modal
      open={open}
      onClose={closeModal}
      title="设置"
      subtitle="API Key 只保存在当前设备的本地存储中，不会上传到本项目服务器。"
      eyebrow="PREFERENCES"
      icon={<Settings2 size={18} />}
      size="lg"
      className="settings-modal"
      footer={
        <>
          <button type="button" className="btn btn--ghost" onClick={closeModal}>
            取消
          </button>
          <span className="modal-footer-spacer" />
          <button type="button" className="btn btn--primary" onClick={() => void handleSave()} disabled={saving}>
            {saving ? <Loader2 size={14} className="spin" /> : <Check size={14} />}
            {saving ? '保存中…' : '保存设置'}
          </button>
        </>
      }
    >
      <div className="settings-layout">
        <nav className="settings-nav">
          <button
            type="button"
            onClick={() => {
              closeModal();
              setUI({ activeModal: 'settings' });
            }}
            className="settings-nav__mobile-close"
            hidden
          >
            关闭
          </button>
          <button
            type="button"
            className={tab === 'api' ? 'is-active' : ''}
            onClick={() => setTab('api')}
          >
            <KeyRound size={14} />
            API 接入
          </button>
          <button
            type="button"
            className={tab === 'execution' ? 'is-active' : ''}
            onClick={() => setTab('execution')}
          >
            <Cpu size={14} />
            执行与数据
          </button>
          <button
            type="button"
            className={tab === 'editor' ? 'is-active' : ''}
            onClick={() => setTab('editor')}
          >
            <SlidersHorizontal size={14} />
            编辑器
          </button>
          <div className="settings-nav__note">
            <ShieldCheck size={14} />
            <p>建议使用测试 Key。不要把含 Key 的截图发到公开场合。</p>
          </div>
        </nav>

        <div className="settings-content">
          {tab === 'api' ? (
            <>
              <div className="settings-callout">
                <Sparkles size={15} />
                <div>
                  <strong>不配置 Key 也可以学习</strong>
                  <p>
                    点击执行时会走模拟模式，日志与输出图都会标注 SIMULATION。配置 Key
                    后，图像生成节点才会调用真实 Agnes API，提示词优化节点才会调用 DeepSeek。
                  </p>
                </div>
              </div>

              <section className="settings-card">
                <div className="settings-card__head">
                  <span className="provider-logo provider-logo--agnes">A</span>
                  <div>
                    <h3>Agnes 图像生成</h3>
                    <p>用于「Agnes 图像生成」节点，接口为 /v1/images/generations。</p>
                  </div>
                  <a
                    className="settings-link"
                    href="https://platform.agnes-ai.com"
                    target="_blank"
                    rel="noreferrer"
                  >
                    获取 Key
                    <ExternalLink size={11} />
                  </a>
                </div>
                <div className="field">
                  <label htmlFor="agnes-key">API Key</label>
                  <div className="key-input">
                    <input
                      id="agnes-key"
                      type={showAgnesKey ? 'text' : 'password'}
                      value={draft.agnesApiKey}
                      autoComplete="off"
                      spellCheck={false}
                      placeholder="粘贴 Agnes API Key…"
                      onChange={(event) => patch({ agnesApiKey: event.target.value })}
                    />
                    <button
                      type="button"
                      onClick={() => setShowAgnesKey((value) => !value)}
                      aria-label={showAgnesKey ? '隐藏 Key' : '显示 Key'}
                    >
                      {showAgnesKey ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>
                  <p className="field__help">仅保存在此设备，不会同步到任何服务器。</p>
                </div>
                <div className="settings-row-2">
                  <div className="field">
                    <label htmlFor="agnes-base">Base URL</label>
                    <input
                      id="agnes-base"
                      value={draft.agnesBaseUrl}
                      spellCheck={false}
                      onChange={(event) => patch({ agnesBaseUrl: event.target.value })}
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="agnes-model">模型</label>
                    <input
                      id="agnes-model"
                      value={draft.agnesModel}
                      spellCheck={false}
                      onChange={(event) => patch({ agnesModel: event.target.value })}
                    />
                  </div>
                </div>
                <div className="settings-test-row">
                  <button
                    type="button"
                    className="btn btn--ghost btn--sm"
                    onClick={() => void runAgnesTest()}
                    disabled={agnesTest.status === 'testing' || !draft.agnesApiKey}
                  >
                    {agnesTest.status === 'testing' ? (
                      <Loader2 size={12} className="spin" />
                    ) : (
                      <RefreshCw size={12} />
                    )}
                    检查端点
                  </button>
                  {agnesTest.status !== 'idle' ? (
                    <span className={`test-result test-result--${agnesTest.status}`}>
                      {agnesTest.message}
                    </span>
                  ) : (
                    <span className="test-hint">只检查网络与 CORS，不生成图片、不扣费。</span>
                  )}
                </div>
              </section>

              <section className="settings-card">
                <div className="settings-card__head">
                  <span className="provider-logo provider-logo--deepseek">D</span>
                  <div>
                    <h3>DeepSeek</h3>
                    <p>用于「DeepSeek 提示词优化」节点与提示词扩写。</p>
                  </div>
                  <a
                    className="settings-link"
                    href="https://platform.deepseek.com"
                    target="_blank"
                    rel="noreferrer"
                  >
                    获取 Key
                    <ExternalLink size={11} />
                  </a>
                </div>
                <div className="field">
                  <label htmlFor="deepseek-key">API Key</label>
                  <div className="key-input">
                    <input
                      id="deepseek-key"
                      type={showDeepSeekKey ? 'text' : 'password'}
                      value={draft.deepseekApiKey}
                      autoComplete="off"
                      spellCheck={false}
                      placeholder="sk-…"
                      onChange={(event) => patch({ deepseekApiKey: event.target.value })}
                    />
                    <button
                      type="button"
                      onClick={() => setShowDeepSeekKey((value) => !value)}
                      aria-label={showDeepSeekKey ? '隐藏 Key' : '显示 Key'}
                    >
                      {showDeepSeekKey ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>
                </div>
                <div className="settings-row-2">
                  <div className="field">
                    <label htmlFor="deepseek-base">Base URL</label>
                    <input
                      id="deepseek-base"
                      value={draft.deepseekBaseUrl}
                      spellCheck={false}
                      onChange={(event) => patch({ deepseekBaseUrl: event.target.value })}
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="deepseek-model">模型</label>
                    <select
                      id="deepseek-model"
                      value={draft.deepseekModel}
                      onChange={(event) => patch({ deepseekModel: event.target.value })}
                    >
                      <option value="deepseek-chat">deepseek-chat</option>
                      <option value="deepseek-reasoner">deepseek-reasoner</option>
                    </select>
                  </div>
                </div>
                <div className="settings-test-row">
                  <button
                    type="button"
                    className="btn btn--ghost btn--sm"
                    onClick={() => void runDeepSeekTest()}
                    disabled={deepseekTest.status === 'testing' || !draft.deepseekApiKey}
                  >
                    {deepseekTest.status === 'testing' ? (
                      <Loader2 size={12} className="spin" />
                    ) : (
                      <RefreshCw size={12} />
                    )}
                    测试连接
                  </button>
                  {deepseekTest.status !== 'idle' ? (
                    <span className={`test-result test-result--${deepseekTest.status}`}>
                      {deepseekTest.message}
                    </span>
                  ) : (
                    <span className="test-hint">会发送一次极小的对话请求，可能产生少量费用。</span>
                  )}
                </div>
              </section>

              <section className="settings-card">
                <div className="settings-card__head">
                  <span className="provider-logo provider-logo--comfy">
                    <Server size={16} />
                  </span>
                  <div>
                    <h3>ComfyUI 服务（可选）</h3>
                    <p>用于「ComfyUI API 工作流」节点。学习阶段可以不填。</p>
                  </div>
                </div>
                <div className="field">
                  <label htmlFor="comfy-base">ComfyUI 地址</label>
                  <input
                    id="comfy-base"
                    value={draft.comfyBaseUrl}
                    placeholder="http://127.0.0.1:8188"
                    spellCheck={false}
                    onChange={(event) => patch({ comfyBaseUrl: event.target.value })}
                  />
                  <p className="field__help">
                    需要能让设备访问。手机上的 127.0.0.1 指手机自身，通常是电脑的局域网 IP。
                  </p>
                </div>
                <div className="settings-row-2">
                  <div className="field">
                    <label htmlFor="backend-base">FastAPI 后端</label>
                    <input
                      id="backend-base"
                      value={draft.backendBaseUrl}
                      placeholder="http://127.0.0.1:8000"
                      spellCheck={false}
                      onChange={(event) => patch({ backendBaseUrl: event.target.value })}
                    />
                  </div>
                  <div className="field field--switch">
                    <Switch
                      checked={draft.useBackendProxy}
                      onChange={(checked) => patch({ useBackendProxy: checked })}
                      label="通过后端代理 API"
                      description="解决网页端 CORS；iOS App 可直接连接。"
                    />
                  </div>
                </div>
                <div className="settings-test-row">
                  <button
                    type="button"
                    className="btn btn--ghost btn--sm"
                    onClick={() => void runBackendTest()}
                    disabled={backendTest.status === 'testing' || !draft.backendBaseUrl}
                  >
                    {backendTest.status === 'testing' ? (
                      <Loader2 size={12} className="spin" />
                    ) : (
                      <Server size={12} />
                    )}
                    检查后端
                  </button>
                  {backendTest.status !== 'idle' ? (
                    <span className={`test-result test-result--${backendTest.status}`}>
                      {backendTest.message}
                    </span>
                  ) : null}
                </div>
              </section>
            </>
          ) : null}

          {tab === 'execution' ? (
            <>
              <section className="settings-card settings-card--flat">
                <h3>执行模式</h3>
                <p className="settings-section-desc">
                  学习时建议保持「自动」。这样没 Key 也能完整走一遍工作流，而且结果有明确的模拟标识。
                </p>
                <div className="mode-cards">
                  {modeCards.map((mode) => (
                    <button
                      key={mode.id}
                      type="button"
                      className={`mode-card ${draft.executionMode === mode.id ? 'is-active' : ''}`}
                      onClick={() => patch({ executionMode: mode.id })}
                    >
                      <span className="mode-card__radio">
                        {draft.executionMode === mode.id ? <Check size={11} /> : null}
                      </span>
                      <strong>{mode.label}</strong>
                      <p>{mode.description}</p>
                    </button>
                  ))}
                </div>
              </section>

              <section className="settings-card settings-card--flat">
                <h3>编辑器行为</h3>
                <Switch
                  checked={draft.autoSave}
                  onChange={(checked) => patch({ autoSave: checked })}
                  label="自动保存"
                  description="停止编辑约 1 秒后保存当前工作流到本机。"
                />
                <Switch
                  checked={draft.cacheEnabled}
                  onChange={(checked) => patch({ cacheEnabled: checked })}
                  label="复用节点结果缓存"
                  description="参数未变化的节点在重复执行时直接复用结果。"
                />
                <Switch
                  checked={draft.snapToGrid}
                  onChange={(checked) => patch({ snapToGrid: checked })}
                  label="网格吸附"
                  description="拖动节点时对齐背景网格。"
                />
                <Switch
                  checked={draft.showMinimap}
                  onChange={(checked) => patch({ showMinimap: checked })}
                  label="显示小地图"
                  description="在画布右下角显示工作流缩略图。"
                />
                <Switch
                  checked={draft.confirmOnClear}
                  onChange={(checked) => patch({ confirmOnClear: checked })}
                  label="清空前确认"
                  description="避免误删整个画布，推荐保持开启。"
                />
                <div className="field settings-timeout">
                  <label htmlFor="timeout">API 超时（秒）</label>
                  <input
                    id="timeout"
                    type="number"
                    min={10}
                    max={600}
                    step={10}
                    value={Math.round(draft.requestTimeoutMs / 1000)}
                    onChange={(event) =>
                      patch({ requestTimeoutMs: Math.max(10, Number(event.target.value)) * 1000 })
                    }
                  />
                </div>
              </section>

              <section className="settings-card settings-card--flat settings-danger">
                <h3>本地数据</h3>
                <p className="settings-section-desc">
                  工作流、设置和 API Key 都保存在这台设备。清除后将恢复示例工作流。
                </p>
                {resetConfirm ? (
                  <div className="settings-confirm-row">
                    <span>确定清除所有本地数据？此操作无法撤销。</span>
                    <button type="button" className="btn btn--ghost" onClick={() => setResetConfirm(false)}>
                      取消
                    </button>
                    <button
                      type="button"
                      className="btn btn--danger"
                      onClick={() => {
                        void clearAllData();
                        setResetConfirm(false);
                        closeModal();
                      }}
                    >
                      确认清除
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="btn btn--ghost btn--danger"
                    onClick={() => setResetConfirm(true)}
                  >
                    <Trash2 size={14} />
                    清除本地数据
                  </button>
                )}
              </section>
            </>
          ) : null}

          {tab === 'editor' ? (
            <>
              <section className="settings-card settings-card--flat">
                <h3>画布</h3>
                <Switch
                  checked={draft.showMinimap}
                  onChange={(checked) => patch({ showMinimap: checked })}
                  label="显示小地图"
                  description="右下角显示工作流缩略图。"
                />
                <Switch
                  checked={draft.snapToGrid}
                  onChange={(checked) => patch({ snapToGrid: checked })}
                  label="网格吸附"
                  description="节点拖动时吸附到网格。"
                />
                <div className="field">
                  <label htmlFor="grid-size">网格大小</label>
                  <div className="input-with-unit">
                    <input
                      id="grid-size"
                      type="number"
                      min={8}
                      max={48}
                      step={4}
                      value={draft.gridSize}
                      onChange={(event) => patch({ gridSize: Number(event.target.value) })}
                    />
                    <span>px</span>
                  </div>
                </div>
              </section>
              <section className="settings-card settings-card--flat">
                <h3>关于本应用</h3>
                <dl className="inspector-kv">
                  <div>
                    <dt>名称</dt>
                    <dd>ComfyUI Workflow Studio</dd>
                  </div>
                  <div>
                    <dt>定位</dt>
                    <dd>面向入门的可视化 AI 工作流学习工具</dd>
                  </div>
                  <div>
                    <dt>数据格式</dt>
                    <dd>JSON · schemaVersion 1</dd>
                  </div>
                  <div>
                    <dt>运行方式</dt>
                    <dd>Web / iOS（Capacitor）</dd>
                  </div>
                </dl>
                <div className="settings-about-note">
                  <ShieldCheck size={14} />
                  <p>
                    本项目不会上传你的 API Key 或工作流。真实生成时，请求由你的设备直接发往所选服务商。
                  </p>
                </div>
              </section>
            </>
          ) : null}
        </div>
      </div>
    </Modal>
  );
}
