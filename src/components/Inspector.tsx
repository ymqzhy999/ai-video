import { useMemo } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  BookOpen,
  Check,
  ChevronRight,
  CircleAlert,
  Copy,
  Download,
  ExternalLink,
  Image as ImageIcon,
  Info,
  KeyRound,
  Play,
  PlayCircle,
  RefreshCw,
  Settings,
  Sparkles,
  Trash2,
  Ungroup,
  X,
} from 'lucide-react';
import type { StudioNode } from '../types/studio';
import { PORT_TYPES } from '../types/studio';
import { getNodeDefinition } from '../lib/nodeRegistry';
import { charCount, copyText, formatDateTime, formatDuration, truncate } from '../lib/format';
import { downloadImage, normalizeAgnesSize } from '../lib/image';
import { validateGraph } from '../lib/execution';
import { hasAgnesKey, hasDeepSeekKey } from '../lib/api';
import { focusCanvasNode } from '../lib/flowBridge';
import { WORKFLOW_CATEGORIES } from '../data/sampleWorkflows';
import { useStudioStore } from '../store/studioStore';
import { NodeIcon } from './NodeIcon';
import { FieldRenderer } from './fields/FieldRenderer';
import { ToolButton } from './ui/ToolButton';

const LEARNING_TIPS: Record<string, string> = {
  'text-input':
    '文本输入是工作流最基础的“原料”。它只输出文本，不参与生成，适合集中管理可复用的文案或变量。',
  prompt:
    '提示词描述你想要的画面。入门可以按「主体 + 场景 + 风格 + 光线 + 质量」的顺序写，越具体越稳定。',
  'negative-prompt':
    '负向提示词告诉模型「不要什么」。入门只需写 low quality、blurry、watermark 等少数关键词。',
  'deepseek-refiner':
    '这是一个可选的“提示词优化”节点：把简单描述交给 DeepSeek 扩写。未配置 Key 时改用本地规则并明确标注模拟。',
  'agnes-image':
    '生成节点把文本变成图片。它需要提示词，可选参考图。真正生成需要 Agnes API Key；没有 Key 时只用于学习流程，输出会带 SIMULATION 水印。',
  'load-image':
    '图片载入是图生图的入口。图片只在本地读取，执行时作为参考图传给生成节点。',
  checkpoint:
    'Checkpoint 是绘图的基础模型，类似“画师的基础能力”。模型节点本身不生成图片，只提供模型引用。',
  ksampler:
    'KSampler 控制生成过程：步数越多通常越细，CFG 控制贴合提示词的程度。当前示例中它只演示参数结构，真实采样需要接入 ComfyUI。',
  'image-output':
    '输出节点是工作流的终点。执行成功后在这里查看结果，节点卡片也会显示缩略图。',
  'image-scale':
    '缩放节点在本地用 Canvas 处理图片，不会上传到服务器。适合统一输出尺寸。',
  seed:
    '种子是随机数。固定种子可以复现同一张图；随机种子每次执行都会产生新变化。',
  dimensions:
    '尺寸节点把宽高作为两个数值输出，便于给多个节点复用，避免重复填写。',
  'comfyui-workflow':
    '这是进阶节点：把 ComfyUI 导出的 API 格式工作流提交到你自己的服务。入门阶段可以先忽略它。',
  note: '便签不参与执行。用它记录思路、参数选择或下一步操作，是学习时最实用的节点之一。',
  group: '分组把多个节点装进一个可拖动的框。拖动分组标题可以整体移动，方便整理画布。',
  default:
    '节点只负责一件事：接收输入、处理、输出结果。理解每个节点的「输入 / 输出类型」，就能读懂大多数工作流。',
};

export function Inspector() {
  const nodes = useStudioStore((state) => state.nodes);
  const edges = useStudioStore((state) => state.edges);
  const selectedNodeIds = useStudioStore((state) => state.selectedNodeIds);
  const rightOpen = useStudioStore((state) => state.ui.rightOpen);
  const rightTab = useStudioStore((state) => state.ui.rightTab);
  const settings = useStudioStore((state) => state.settings);
  const execution = useStudioStore((state) => state.execution);
  const close = () => useStudioStore.getState().setUI({ rightOpen: false });
  const setUI = useStudioStore((state) => state.setUI);

  const selectedNodes = useMemo(
    () => nodes.filter((node) => selectedNodeIds.includes(node.id)),
    [nodes, selectedNodeIds],
  );
  const selectedNode = selectedNodes.length === 1 ? selectedNodes[0] : undefined;
  const definition = selectedNode ? getNodeDefinition(selectedNode.data.defType) : undefined;

  return (
    <aside className={`inspector ${rightOpen ? 'is-open' : ''}`} aria-label="节点属性面板">
      <header className="inspector__header">
        <div className="inspector__heading">
          <p className="eyebrow">INSPECTOR</p>
          <h2>{selectedNode ? '节点属性' : selectedNodes.length > 1 ? '多选操作' : '工作流概览'}</h2>
        </div>
        <div className="inspector__header-actions">
          {selectedNode && definition ? (
            <span className="inspector__type">{definition.subtitle}</span>
          ) : null}
          <button
            type="button"
            className="icon-btn icon-btn--ghost inspector__close"
            onClick={close}
            aria-label="关闭属性面板"
          >
            <X size={17} />
          </button>
        </div>
      </header>

      {selectedNode && definition ? (
        <>
          <div className="inspector-node-head">
            <span
              className="inspector-node-head__icon"
              style={{
                color: definition.accent,
                background: `${definition.accent}16`,
                borderColor: `${definition.accent}33`,
              }}
            >
              <NodeIcon name={definition.icon} size={18} />
            </span>
            <div className="inspector-node-head__text">
              <h3>{selectedNode.data.label}</h3>
              <p>
                {definition.category === 'generation'
                  ? '生成节点'
                  : definition.category === 'output'
                    ? '输出节点'
                    : definition.title}
                <span>·</span>
                <em className={`status-pill status-pill--${selectedNode.data.status}`}>
                  {selectedNode.data.status === 'idle' ? '未执行' : statusText(selectedNode.data.status)}
                </em>
              </p>
            </div>
            {selectedNode.data.status === 'success' && !definition.outputs.length ? (
              <span className="inspector-node-head__check">
                <Check size={14} />
              </span>
            ) : null}
          </div>

          <div className="inspector-tabs" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={rightTab === 'params'}
              className={rightTab === 'params' ? 'is-active' : ''}
              onClick={() => setUI({ rightTab: 'params' })}
            >
              参数配置
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={rightTab === 'output'}
              className={rightTab === 'output' ? 'is-active' : ''}
              onClick={() => setUI({ rightTab: 'output' })}
            >
              执行输出
              {selectedNode.data.status === 'error' ? <i className="dot-error" /> : null}
            </button>
          </div>

          <div className="inspector__scroll">
            {rightTab === 'params' ? (
              <NodeParamsPanel node={selectedNode} />
            ) : (
              <NodeOutputPanel node={selectedNode} />
            )}
          </div>

          <footer className="inspector__footer">
            <button
              type="button"
              className="btn btn--soft btn--full"
              onClick={() => {
                void useStudioStore.getState().runNode(selectedNode.id);
              }}
              disabled={execution.status === 'running' || selectedNode.data.defType === 'note'}
            >
              <Play size={14} />
              运行此节点
            </button>
            <button
              type="button"
              className="btn btn--ghost btn--full"
              onClick={() => {
                void useStudioStore.getState().runFrom(selectedNode.id);
              }}
              disabled={execution.status === 'running' || selectedNode.data.defType === 'note'}
            >
              <PlayCircle size={14} />
              从这里继续
            </button>
          </footer>
        </>
      ) : selectedNodes.length > 1 ? (
        <MultiPanel nodes={selectedNodes} />
      ) : (
        <WorkflowOverview />
      )}
    </aside>
  );
}

function statusText(status: StudioNode['data']['status']): string {
  return {
    idle: '未执行',
    queued: '等待执行',
    running: '执行中',
    success: '执行成功',
    error: '执行失败',
    skipped: '已跳过',
  }[status];
}

function NodeParamsPanel({ node }: { node: StudioNode }) {
  const definition = getNodeDefinition(node.data.defType);
  const edges = useStudioStore((state) => state.edges);
  const nodes = useStudioStore((state) => state.nodes);
  const settings = useStudioStore((state) => state.settings);
  const openModal = useStudioStore((state) => state.openModal);
  const updateNodeParams = useStudioStore((state) => state.updateNodeParams);
  const updateNodeLabel = useStudioStore((state) => state.updateNodeLabel);
  const updateNodeNote = useStudioStore((state) => state.updateNodeNote);

  const missingAgnes = node.data.defType === 'agnes-image' && !hasAgnesKey(settings);
  const missingDeepSeek =
    node.data.defType === 'deepseek-refiner' && !hasDeepSeekKey(settings);
  const missingComfy =
    node.data.defType === 'comfyui-workflow' && !settings.comfyBaseUrl.trim();

  return (
    <>
      {missingAgnes || missingDeepSeek || missingComfy ? (
        <div className="inspector-callout inspector-callout--warn">
          <AlertTriangle size={15} />
          <div>
            <strong>
              {missingAgnes ? '未配置 Agnes API Key' : missingDeepSeek ? '未配置 DeepSeek API Key' : '未配置 ComfyUI 服务'}
            </strong>
            <p>
              {missingAgnes || missingDeepSeek
                ? '执行时会使用明确标注的模拟模式，不会假装已生成真实结果。'
                : '这个节点需要本地可访问的 ComfyUI 服务地址。'}
            </p>
          </div>
          <button type="button" onClick={() => openModal('settings')}>
            配置
          </button>
        </div>
      ) : null}

      <div className="inspector-callout inspector-callout--learning">
        <BookOpen size={14} />
        <div>
          <strong>学习提示</strong>
          <p>{LEARNING_TIPS[node.data.defType] ?? LEARNING_TIPS.default}</p>
        </div>
      </div>

      <section className="inspector-section">
        <h3>基础信息</h3>
        <div className="field">
          <label htmlFor={`label-${node.id}`}>节点名称</label>
          <input
            id={`label-${node.id}`}
            type="text"
            value={node.data.label}
            onChange={(event) => updateNodeLabel(node.id, event.target.value)}
          />
        </div>
        {definition.fields.length ? (
          <div className="fields-stack">
            {definition.fields.map((field) => (
              <FieldRenderer
                key={field.key}
                field={field}
                value={node.data.params[field.key]}
                nodeId={node.id}
                onChange={(key, value) => updateNodeParams(node.id, { [key]: value })}
              />
            ))}
          </div>
        ) : (
          <p className="inspector-empty-copy">
            {node.data.defType === 'group'
              ? '分组本身没有可配置参数。拖动分组标题即可整体移动其中的节点。'
              : '这个节点没有参数，连接输入后直接输出。'}
          </p>
        )}
      </section>

      {node.data.defType === 'agnes-image' ? (
        <section className="inspector-section">
          <h3>Agnes 参数说明</h3>
          <dl className="inspector-kv">
            <div>
              <dt>API 生成比例</dt>
              <dd>
                {normalizeAgnesSize(
                  Number(node.data.params.width),
                  Number(node.data.params.height),
                ).label}
              </dd>
            </div>
            <div>
              <dt>本地导出尺寸</dt>
              <dd>
                宽 {Number(node.data.params.width)} × 高 {Number(node.data.params.height)}
              </dd>
            </div>
            <div>
              <dt>模型</dt>
              <dd>{settings.agnesModel || 'agnes-image-2.0-flash'}</dd>
            </div>
            <div>
              <dt>请求方式</dt>
              <dd>{settings.useBackendProxy ? '后端代理' : '直连 API'}</dd>
            </div>
            <div>
              <dt>当前模式</dt>
              <dd>{hasAgnesKey(settings) && settings.executionMode !== 'mock' ? '真实生成可用' : '模拟输出'}</dd>
            </div>
          </dl>
        </section>
      ) : null}

      <section className="inspector-section">
        <h3>端口与连接</h3>
        <div className="port-overview">
          <div>
            <p className="port-overview__title">输入端口</p>
            {definition.inputs.length ? (
              definition.inputs.map((port) => {
                const incoming = edges.find(
                  (edge) => edge.target === node.id && edge.targetHandle === port.id,
                );
                const source = incoming
                  ? nodes.find((candidate) => candidate.id === incoming.source)
                  : undefined;
                return (
                  <div className="port-overview__row" key={port.id}>
                    <span
                      className="port-type-dot"
                      style={{ background: PORT_TYPES[port.type].color }}
                    />
                    <span>{port.label}</span>
                    <em className={incoming ? 'is-connected' : port.required ? 'is-missing' : ''}>
                      {source ? truncate(source.data.label, 16) : port.required ? '必填未连接' : '可选'}
                    </em>
                  </div>
                );
              })
            ) : (
              <p className="inspector-empty-copy">无输入端口</p>
            )}
          </div>
          <div>
            <p className="port-overview__title">输出端口</p>
            {definition.outputs.length ? (
              definition.outputs.map((port) => {
                const count = edges.filter(
                  (edge) => edge.source === node.id && edge.sourceHandle === port.id,
                ).length;
                return (
                  <div className="port-overview__row" key={port.id}>
                    <span
                      className="port-type-dot"
                      style={{ background: PORT_TYPES[port.type].color }}
                    />
                    <span>{port.label}</span>
                    <em className={count ? 'is-connected' : ''}>
                      {count ? `${count} 条连接` : '未连接'}
                    </em>
                  </div>
                );
              })
            ) : (
              <p className="inspector-empty-copy">无输出端口</p>
            )}
          </div>
        </div>
      </section>

      <section className="inspector-section">
        <h3>节点备注</h3>
        <textarea
          rows={3}
          placeholder="给自己留一条说明，例如：这里为什么要固定种子？"
          value={node.data.note ?? ''}
          onChange={(event) => updateNodeNote(node.id, event.target.value)}
        />
      </section>

      <div className="inspector-actions-row">
        {node.data.defType === 'group' ? (
          <>
            <button
              type="button"
              className="btn btn--ghost"
              onClick={() => useStudioStore.getState().ungroupSelected()}
            >
              <Ungroup size={14} />
              取消分组
            </button>
            <button
              type="button"
              className="btn btn--ghost btn--danger"
              onClick={() => useStudioStore.getState().deleteNodes([node.id])}
            >
              <Trash2 size={14} />
              删除分组
            </button>
          </>
        ) : (
          <button
            type="button"
            className="btn btn--ghost btn--danger"
            onClick={() => useStudioStore.getState().deleteNodes([node.id])}
          >
            <Trash2 size={14} />
            删除节点
          </button>
        )}
      </div>
    </>
  );
}

function NodeOutputPanel({ node }: { node: StudioNode }) {
  const execution = useStudioStore((state) => state.execution);
  const showLightbox = useStudioStore((state) => state.showLightbox);
  const toast = useStudioStore((state) => state.toast);
  const definition = getNodeDefinition(node.data.defType);
  const result = node.data.result;
  const logs = execution.logs.filter((log) => log.nodeId === node.id).slice(-10);

  return (
    <>
      <section className="inspector-section">
        <div className="result-status-row">
          <span className={`result-status result-status--${node.data.status}`}>
            {node.data.status === 'success' ? <Check size={13} /> : null}
            {node.data.status === 'error' ? <CircleAlert size={13} /> : null}
            {node.data.status === 'running' ? <RefreshCw size={13} className="spin" /> : null}
            {statusText(node.data.status)}
          </span>
          {node.data.durationMs !== undefined ? (
            <span className="result-duration">{formatDuration(node.data.durationMs)}</span>
          ) : null}
          {node.data.cached ? <span className="result-badge">缓存</span> : null}
          {node.data.result?.simulated ? <span className="result-badge sim">模拟</span> : null}
        </div>
        {node.data.error ? (
          <div className="result-error">
            <AlertTriangle size={14} />
            <p>{node.data.error}</p>
          </div>
        ) : null}
        {!result && !node.data.error ? (
          <div className="result-empty">
            <Sparkles size={20} />
            <strong>还没有执行结果</strong>
            <p>点击下方「运行此节点」或执行整个工作流。</p>
          </div>
        ) : null}
      </section>

      {result?.images?.length ? (
        <section className="inspector-section">
          <div className="section-title-row">
            <h3>图像输出</h3>
            <span>{result.images.length} 张</span>
          </div>
          <div className="result-gallery">
            {result.images.map((image, index) => (
              <figure key={`${image.src.slice(0, 24)}-${index}`} className="result-image">
                <button
                  type="button"
                  className="result-image__button"
                  onClick={() => showLightbox(image)}
                  aria-label="放大查看"
                >
                  <img src={image.src} alt={image.alt ?? `输出 ${index + 1}`} />
                </button>
                {image.simulated ? <span className="sim-watermark">SIMULATION</span> : null}
                <figcaption>
                  <span>
                    {image.width && image.height ? `${image.width} × ${image.height}` : `输出 ${index + 1}`}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      void downloadImage(
                        image,
                        `${node.data.params.filename ?? 'comfyui-output'}-${index + 1}`,
                        String(node.data.params.format ?? 'png'),
                      )
                    }
                    title="下载图片"
                  >
                    <Download size={12} />
                  </button>
                </figcaption>
              </figure>
            ))}
          </div>
          {result.simulated ? (
            <p className="result-note">
              模拟输出仅用于学习工作流结构，不是真实 AI 生成结果。
            </p>
          ) : null}
        </section>
      ) : null}

      {result?.text ? (
        <section className="inspector-section">
          <div className="section-title-row">
            <h3>文本结果</h3>
            <button
              type="button"
              className="text-button"
              onClick={async () => {
                const copied = await copyText(result.text ?? '');
                toast({
                  type: copied ? 'success' : 'error',
                  title: copied ? '已复制文本' : '复制失败',
                });
              }}
            >
              <Copy size={12} />
              复制
            </button>
          </div>
          <div className="text-result">{result.text}</div>
        </section>
      ) : null}

      {result?.meta && Object.keys(result.meta).length ? (
        <section className="inspector-section">
          <h3>执行信息</h3>
          <dl className="inspector-kv">
            {Object.entries(result.meta).map(([key, value]) => (
              <div key={key}>
                <dt>{key}</dt>
                <dd>{typeof value === 'string' ? value : JSON.stringify(value)}</dd>
              </div>
            ))}
          </dl>
        </section>
      ) : null}

      <section className="inspector-section">
        <h3>节点日志</h3>
        {logs.length ? (
          <div className="mini-log">
            {logs.map((log) => (
              <div key={log.id} className={`mini-log__row mini-log__row--${log.level}`}>
                <span>{new Date(log.time).toLocaleTimeString('zh-CN', { hour12: false })}</span>
                <p>{log.message}</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="inspector-empty-copy">执行后将在这里显示该节点的日志。</p>
        )}
      </section>

      {definition.category === 'output' && node.data.params.filename ? (
        <p className="inspector-footnote">
          输出文件命名：{String(node.data.params.filename)}.{String(node.data.params.format ?? 'png')}
        </p>
      ) : null}
    </>
  );
}

function WorkflowOverview() {
  const nodes = useStudioStore((state) => state.nodes);
  const edges = useStudioStore((state) => state.edges);
  const workflowName = useStudioStore((state) => state.workflowName);
  const workflowDescription = useStudioStore((state) => state.workflowDescription);
  const workflowCategory = useStudioStore((state) => state.workflowCategory);
  const settings = useStudioStore((state) => state.settings);
  const execution = useStudioStore((state) => state.execution);
  const setWorkflowMeta = useStudioStore((state) => state.setWorkflowMeta);
  const openModal = useStudioStore((state) => state.openModal);
  const autoLayout = useStudioStore((state) => state.autoLayout);
  const requestFit = useStudioStore((state) => state.requestFit);
  const selectNodes = useStudioStore((state) => state.selectNodes);
  const openNodeInspector = useStudioStore((state) => state.openNodeInspector);
  const saveCurrent = useStudioStore((state) => state.saveCurrent);
  const exportWorkflow = useStudioStore((state) => state.exportWorkflow);
  const issues = validateGraph(nodes, edges);
  const errors = issues.filter((issue) => issue.severity === 'error');
  const warnings = issues.filter((issue) => issue.severity === 'warning');
  const outputCount = nodes.reduce(
    (count, node) => count + (getNodeDefinition(node.data.defType).category === 'output' ? 1 : 0),
    0,
  );
  const lastRun = execution.history[0];
  const typeCount = new Set(nodes.map((node) => node.data.defType)).size;

  return (
    <div className="inspector__scroll inspector__scroll--overview">
      <div className="workflow-hero">
        <span className="workflow-hero__icon">
          <NodeIcon name="Workflow" size={21} />
        </span>
        <div>
          <p className="eyebrow">CURRENT WORKFLOW</p>
          <h3>{workflowName}</h3>
          <p>{workflowDescription || '为这条工作流添加一句说明，方便日后回顾。'}</p>
        </div>
      </div>

      <div className="overview-stats">
        <div>
          <strong>{nodes.length}</strong>
          <span>节点</span>
        </div>
        <div>
          <strong>{edges.length}</strong>
          <span>连接</span>
        </div>
        <div>
          <strong>{typeCount}</strong>
          <span>节点类型</span>
        </div>
        <div>
          <strong>{outputCount}</strong>
          <span>输出</span>
        </div>
      </div>

      <section className="inspector-section">
        <h3>工作流信息</h3>
        <div className="field">
          <label htmlFor="workflow-name">名称</label>
          <input
            id="workflow-name"
            value={workflowName}
            onChange={(event) => setWorkflowMeta({ name: event.target.value })}
          />
        </div>
        <div className="field">
          <label htmlFor="workflow-category">分类</label>
          <div className="select-wrap">
            <select
              id="workflow-category"
              value={workflowCategory}
              onChange={(event) => setWorkflowMeta({ category: event.target.value })}
            >
              {WORKFLOW_CATEGORIES.filter((category) => category !== '全部').map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
              {!WORKFLOW_CATEGORIES.includes(workflowCategory) ? (
                <option value={workflowCategory}>{workflowCategory}</option>
              ) : null}
            </select>
          </div>
        </div>
        <div className="field">
          <label htmlFor="workflow-description">说明</label>
          <textarea
            id="workflow-description"
            rows={3}
            value={workflowDescription}
            onChange={(event) => setWorkflowMeta({ description: event.target.value })}
            placeholder="这条工作流解决了什么问题？"
          />
        </div>
      </section>

      <section className="inspector-section">
        <h3>连接检查</h3>
        {errors.length ? (
          <div className="health-list health-list--error">
            {errors.slice(0, 4).map((issue, index) => (
              <button
                key={`${issue.message}-${index}`}
                type="button"
                onClick={() => {
                  if (issue.nodeId) {
                    openNodeInspector(issue.nodeId);
                    focusCanvasNode(issue.nodeId);
                  }
                }}
              >
                <AlertTriangle size={13} />
                <span>{issue.message}</span>
                <ChevronRight size={12} />
              </button>
            ))}
          </div>
        ) : warnings.length ? (
          <div className="health-list health-list--warn">
            {warnings.slice(0, 3).map((issue, index) => (
              <button
                key={`${issue.message}-${index}`}
                type="button"
                onClick={() => {
                  if (issue.nodeId) {
                    selectNodes([issue.nodeId]);
                    focusCanvasNode(issue.nodeId);
                  }
                }}
              >
                <Info size={13} />
                <span>{issue.message}</span>
                <ChevronRight size={12} />
              </button>
            ))}
          </div>
        ) : (
          <div className="health-ok">
            <Check size={14} />
            <span>{nodes.length ? '结构完整，可以执行。' : '画布是空的，先添加节点吧。'}</span>
          </div>
        )}
      </section>

      <section className="inspector-section">
        <h3>API 与执行模式</h3>
        <div className="api-status-list">
          <button type="button" onClick={() => openModal('settings')}>
            <span className={`api-dot ${hasAgnesKey(settings) ? 'is-on' : ''}`} />
            <span>Agnes 图像生成</span>
            <em>{hasAgnesKey(settings) ? '已配置' : '未配置'}</em>
            <ChevronRight size={12} />
          </button>
          <button type="button" onClick={() => openModal('settings')}>
            <span className={`api-dot ${hasDeepSeekKey(settings) ? 'is-on' : ''}`} />
            <span>DeepSeek 提示词优化</span>
            <em>{hasDeepSeekKey(settings) ? '已配置' : '未配置'}</em>
            <ChevronRight size={12} />
          </button>
          <button type="button" onClick={() => openModal('settings')}>
            <span className={`api-dot ${settings.comfyBaseUrl ? 'is-on' : ''}`} />
            <span>ComfyUI 服务</span>
            <em>{settings.comfyBaseUrl ? '已配置' : '未配置'}</em>
            <ChevronRight size={12} />
          </button>
        </div>
        <p className="mode-note">
          当前：<strong>{settings.executionMode === 'auto' ? '自动' : settings.executionMode === 'mock' ? '模拟' : '真实'}</strong>
          {settings.executionMode === 'auto'
            ? ' · 有 Key 时调用真实 API，否则明确标注模拟。'
            : settings.executionMode === 'mock'
              ? ' · 不调用任何生成 API，只演示流程。'
              : ' · 缺少必要 Key 时执行会失败，不会悄悄降级。'}
        </p>
      </section>

      <section className="inspector-section">
        <div className="section-title-row">
          <h3>最近一次执行</h3>
          {lastRun ? <span>{formatDateTime(lastRun.startedAt)}</span> : null}
        </div>
        {lastRun ? (
          <div className={`run-summary run-summary--${lastRun.status}`}>
            <span className="run-summary__state">
              {lastRun.status === 'success' ? <Check size={13} /> : <AlertTriangle size={13} />}
              {lastRun.status === 'success' ? '成功' : lastRun.status === 'stopped' ? '已停止' : '失败'}
            </span>
            <span>{lastRun.completed}/{lastRun.total} 节点</span>
            <span>{lastRun.mode === 'mock' ? '模拟' : lastRun.mode === 'mixed' ? '混合' : '真实'}</span>
          </div>
        ) : (
          <p className="inspector-empty-copy">还没有执行记录。</p>
        )}
      </section>

      <section className="inspector-section">
        <h3>快速操作</h3>
        <div className="quick-actions">
          <button type="button" onClick={() => requestFit()}>
            <MaximizeIcon /> 全览画布
          </button>
          <button type="button" onClick={autoLayout}>
            <LayoutIcon /> 自动排列
          </button>
          <button type="button" onClick={() => void saveCurrent()}>
            <SaveIcon /> 保存工作流
          </button>
          <button type="button" onClick={() => exportWorkflow()}>
            <Download size={13} /> 导出 JSON
          </button>
          <button type="button" onClick={() => openModal('help')}>
            <BookOpen size={13} /> 学习中心
          </button>
          <button type="button" onClick={() => openModal('workflows')}>
            <FolderIcon /> 工作流库
          </button>
        </div>
      </section>

      <div className="overview-footer-note">
        <Sparkles size={13} />
        <p>
          建议先打开示例工作流，逐个点击节点查看参数，再按「执行」观察依赖顺序。
          学习时不需要配置任何 Key。
        </p>
      </div>
    </div>
  );
}

function MultiPanel({ nodes }: { nodes: StudioNode[] }) {
  const duplicateSelected = useStudioStore((state) => state.duplicateSelected);
  const groupSelected = useStudioStore((state) => state.groupSelected);
  const alignSelected = useStudioStore((state) => state.alignSelected);
  const deleteNodes = useStudioStore((state) => state.deleteNodes);
  const clearSelection = useStudioStore((state) => state.clearSelection);
  const askConfirm = useStudioStore((state) => state.askConfirm);

  return (
    <div className="inspector__scroll inspector__scroll--overview">
      <div className="multi-hero">
        <span>
          <LayersIcon />
        </span>
        <h3>已选择 {nodes.length} 个节点</h3>
        <p>对齐、分组或一起复制。多选时属性面板不可编辑。</p>
      </div>
      <div className="multi-list">
        {nodes.map((node) => (
          <button
            type="button"
            key={node.id}
            onClick={() => useStudioStore.getState().openNodeInspector(node.id)}
          >
            <span>
              <NodeIcon name={getNodeDefinition(node.data.defType).icon} size={13} />
            </span>
            <strong>{node.data.label}</strong>
            <em>{getNodeDefinition(node.data.defType).subtitle}</em>
            <ArrowRight size={12} />
          </button>
        ))}
      </div>
      <section className="inspector-section">
        <h3>批量操作</h3>
        <div className="quick-actions quick-actions--two">
          <button type="button" onClick={groupSelected}>
            <Group size={13} /> 创建分组
          </button>
          <button type="button" onClick={duplicateSelected}>
            <Copy size={13} /> 复制所选
          </button>
          <button type="button" onClick={() => alignSelected('left')}>
            <AlignIcon /> 左对齐
          </button>
          <button type="button" onClick={() => alignSelected('top')}>
            <AlignIcon /> 上对齐
          </button>
          <button type="button" onClick={clearSelection}>
            <X size={13} /> 取消选择
          </button>
          <button
            type="button"
            className="is-danger"
            onClick={() =>
              askConfirm({
                title: `删除 ${nodes.length} 个节点？`,
                description: '连接也会一并删除，此操作可以撤销。',
                confirmLabel: '删除',
                tone: 'danger',
                onConfirm: () => deleteNodes(nodes.map((node) => node.id)),
              })
            }
          >
            <Trash2 size={13} /> 删除
          </button>
        </div>
      </section>
    </div>
  );
}

function MaximizeIcon() {
  return <ExternalLink size={13} />;
}
function LayoutIcon() {
  return <RefreshCw size={13} />;
}
function SaveIcon() {
  return <KeyRound size={13} />;
}
function FolderIcon() {
  return <BookOpen size={13} />;
}
function LayersIcon() {
  return <ImageIcon size={16} />;
}
function Group({ size }: { size: number }) {
  return <NodeIcon name="Group" size={size} />;
}
function AlignIcon() {
  return <ArrowRight size={13} />;
}
