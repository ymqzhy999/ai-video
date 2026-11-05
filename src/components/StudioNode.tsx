import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import {
  AlertTriangle,
  Check,
  ChevronDown,
  Clock3,
  Loader2,
  MoreHorizontal,
  Play,
  Radio,
  Star,
  X,
} from 'lucide-react';
import type { StudioNode, StudioNodeData } from '../types/studio';
import { getNodeDefinition } from '../lib/nodeRegistry';
import { PORT_TYPES } from '../types/studio';
import { NodeIcon } from './NodeIcon';
import { useStudioStore } from '../store/studioStore';
import { charCount, formatDuration, truncate } from '../lib/format';

const STATUS_LABELS: Record<StudioNodeData['status'], string> = {
  idle: '未执行',
  queued: '等待执行',
  running: '执行中',
  success: '执行成功',
  error: '执行失败',
  skipped: '已跳过',
};

function chip(label: string, key?: string) {
  return (
    <span className="node-chip" key={key ?? label}>
      {label}
    </span>
  );
}

function paramSummary(node: StudioNode): string[] {
  const definition = getNodeDefinition(node.data.defType);
  const params = node.data.params;
  switch (node.data.defType) {
    case 'prompt':
    case 'negative-prompt': {
      const count = charCount(String(params.text ?? ''));
      return [`${count} 字符`, String(params.template ?? '') === 'custom' ? '自定义' : '模板'];
    }
    case 'agnes-image':
      return [
        `${params.width ?? 1024} × ${params.height ?? 1024}`,
        `×${params.count ?? 1}`,
        `seed ${String(params.seed ?? 0).slice(-6)}`,
      ];
    case 'deepseek-refiner':
      return ['DeepSeek', String(params.language ?? 'en') === 'en' ? 'EN' : '中文'];
    case 'style-preset': {
      const style = definition.fields
        .find((field) => field.key === 'style')
        ?.options?.find((option) => option.value === params.style);
      return [style?.label ?? String(params.style ?? ''), `${params.strength ?? 70}%`];
    }
    case 'checkpoint':
      return [String(params.model ?? ''), String(params.precision ?? '')];
    case 'lora':
      return [String(params.lora ?? ''), `${params.strength ?? 65}%`];
    case 'ksampler':
      return [`${params.steps ?? 28} steps`, `CFG ${params.cfg ?? 6.5}`, String(params.sampler ?? '')];
    case 'latent-empty':
      return [
        `${params.width ?? 1024} × ${params.height ?? 1024}`,
        `batch ${params.batch ?? 1}`,
      ];
    case 'seed':
      return [String(params.seed ?? 0), params.randomize ? '每次随机' : '固定'];
    case 'dimensions':
      return [`${params.width ?? 1024} × ${params.height ?? 1024}`];
    case 'load-image':
      return [params.image ? '已载入图片' : '等待上传'];
    case 'image-scale':
      return [`${params.width ?? 768} × ${params.height ?? 768}`, String(params.fit ?? '')];
    case 'image-crop':
      return [String(params.ratio ?? '1:1'), `${params.zoom ?? 100}%`];
    case 'image-adjust':
      return [
        `亮度 ${params.brightness ?? 100}%`,
        `饱和 ${params.saturation ?? 100}%`,
        params.grayscale ? '黑白' : '彩色',
      ];
    case 'image-output':
      return [String(params.format ?? 'png').toUpperCase(), String(params.filename ?? '')];
    case 'comfyui-workflow':
      return ['ComfyUI', params.workflowJson ? 'API JSON' : '待配置'];
    case 'text-input':
      return [`${charCount(String(params.text ?? ''))} 字符`];
    case 'number-input':
      return [String(params.value ?? 0)];
    case 'prompt-merge':
      return [String(params.separator ?? ', '), params.trim ? '去空段' : '保留空段'];
    case 'api-request':
      return [String(params.method ?? 'POST'), truncate(String(params.url ?? '未配置 URL'), 24)];
    case 'note':
      return [];
    default:
      return [];
  }
}

function statusIcon(status: StudioNodeData['status']) {
  if (status === 'running') return <Loader2 size={11} className="spin" />;
  if (status === 'success') return <Check size={11} />;
  if (status === 'error') return <AlertTriangle size={11} />;
  if (status === 'queued') return <Clock3 size={11} />;
  if (status === 'skipped') return <X size={11} />;
  return <Radio size={10} />;
}

function StudioNodeComponent({ id, data, selected }: NodeProps<StudioNode>) {
  const definition = getNodeDefinition(data.defType);
  const settings = useStudioStore((state) => state.settings);
  const favorites = useStudioStore((state) => state.favoriteNodes);
  const toggleFavorite = useStudioStore((state) => state.toggleFavoriteNode);
  const childCount = useStudioStore(
    (state) =>
      state.nodes.filter((node) => node.parentId === id).length,
  );

  if (data.defType === 'group') {
    return (
      <div className={`group-node ${selected ? 'is-selected' : ''}`}>
        <div className="group-node__header">
          <span className="group-node__dots">
            <i />
            <i />
            <i />
          </span>
          <span className="group-node__title">{data.label}</span>
          <span className="group-node__count">{childCount} 节点</span>
          <button
            type="button"
            className="group-node__menu"
            aria-label="分组操作"
            onClick={(event) => {
              event.stopPropagation();
              const rect = event.currentTarget.getBoundingClientRect();
              window.dispatchEvent(
                new CustomEvent('studio:node-menu', {
                  detail: { nodeId: id, x: rect.right, y: rect.bottom },
                }),
              );
            }}
          >
            <MoreHorizontal size={14} />
          </button>
        </div>
      </div>
    );
  }

  const accent = definition.accent;
  const isNote = data.defType === 'note';
  const noteColor = String(data.params.color ?? accent);
  const images =
    data.result?.images?.length
      ? data.result.images
      : typeof data.params.image === 'string' && data.params.image
        ? [{ src: data.params.image, alt: data.label }]
        : [];
  const previewImage = images[0];
  const summary = paramSummary({ id, data } as StudioNode);
  const isOutput = definition.category === 'output';
  const isFavorite = favorites.includes(data.defType);
  const simulated = Boolean(data.result?.simulated) || data.simulated;
  const textResult = data.result?.text;

  return (
    <div
      className={[
        'studio-node',
        `studio-node--${data.status}`,
        selected ? 'is-selected' : '',
        isNote ? 'studio-node--note' : '',
        isOutput ? 'studio-node--output' : '',
        data.defType === 'agnes-image' ? 'studio-node--generator' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      style={
        {
          '--node-accent': isNote ? noteColor : accent,
          width: definition.width ?? 236,
        } as React.CSSProperties
      }
      title={definition.description}
    >
      <div className="studio-node__header">
        <span
          className="studio-node__icon"
          style={{
            color: isNote ? noteColor : accent,
            background: `${isNote ? noteColor : accent}1b`,
            borderColor: `${isNote ? noteColor : accent}38`,
          }}
        >
          <NodeIcon name={definition.icon} size={14} />
        </span>
        <span className="studio-node__titles">
          <strong>{data.label}</strong>
          <small>{definition.subtitle}</small>
        </span>
        <span className={`node-status-dot node-status-dot--${data.status}`}>
          {statusIcon(data.status)}
        </span>
        <button
          type="button"
          className="studio-node__menu nodrag"
          aria-label="节点菜单"
          onClick={(event) => {
            event.stopPropagation();
            const rect = event.currentTarget.getBoundingClientRect();
            window.dispatchEvent(
              new CustomEvent('studio:node-menu', {
                detail: { nodeId: id, x: rect.right, y: rect.bottom },
              }),
            );
          }}
        >
          <MoreHorizontal size={14} />
        </button>
      </div>

      {!data.collapsed ? (
        <>
          {isNote ? (
            <div className="studio-node__note-body">{String(data.params.text ?? '')}</div>
          ) : (
            <>
              {previewImage ? (
                <div className={`node-preview ${isOutput ? 'node-preview--large' : ''}`}>
                  <img src={previewImage.src} alt={previewImage.alt ?? data.label} draggable={false} />
                  {simulated ? <span className="node-preview__badge">SIMULATION</span> : null}
                  {images.length > 1 ? (
                    <span className="node-preview__count">+{images.length - 1}</span>
                  ) : null}
                </div>
              ) : null}

              {textResult && (isOutput || data.defType === 'text-output') ? (
                <p className="node-text-preview">{truncate(textResult, 92)}</p>
              ) : null}

              {definition.inputs.length || definition.outputs.length ? (
                <div className="node-ports">
                  <div className="node-ports__column">
                    {definition.inputs.map((port) => (
                      <div className="node-port node-port--input" key={port.id}>
                        <Handle
                          type="target"
                          position={Position.Left}
                          id={port.id}
                          className="port-handle"
                          style={{ background: PORT_TYPES[port.type].color }}
                          isConnectable
                        />
                        <span
                          className="node-port__dot"
                          style={{ background: PORT_TYPES[port.type].color }}
                        />
                        <span className="node-port__label" title={`${port.label} · ${PORT_TYPES[port.type].label}`}>
                          {port.label}
                        </span>
                        {port.required ? <span className="node-port__required">•</span> : null}
                      </div>
                    ))}
                  </div>
                  <div className="node-ports__column node-ports__column--outputs">
                    {definition.outputs.map((port) => (
                      <div className="node-port node-port--output" key={port.id}>
                        <span
                          className="node-port__label"
                          title={`${port.label} · ${PORT_TYPES[port.type].label}`}
                        >
                          {port.label}
                        </span>
                        <span
                          className="node-port__dot"
                          style={{ background: PORT_TYPES[port.type].color }}
                        />
                        <Handle
                          type="source"
                          position={Position.Right}
                          id={port.id}
                          className="port-handle"
                          style={{ background: PORT_TYPES[port.type].color }}
                          isConnectable
                        />
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {summary.length && !isOutput ? (
                <div className="node-chips">
                  {summary.filter(Boolean).map((label) => chip(label))}
                </div>
              ) : null}
            </>
          )}
        </>
      ) : null}

      <div className="studio-node__footer">
        <span className={`node-state node-state--${data.status}`}>
          {statusIcon(data.status)}
          {data.status === 'running'
            ? `${STATUS_LABELS[data.status]}${data.progress !== undefined ? ` ${Math.round(data.progress)}%` : ''}`
            : data.status === 'success' && data.cached
              ? '缓存结果'
              : data.status === 'success'
                ? `成功${data.durationMs ? ` · ${formatDuration(data.durationMs)}` : ''}`
                : STATUS_LABELS[data.status]}
        </span>
        <span className="studio-node__footer-right">
          {simulated ? <em className="sim-badge">SIM</em> : null}
          {data.defType === 'deepseek-refiner' && settings.executionMode === 'live' ? (
            <Play size={10} />
          ) : null}
          {isFavorite ? <Star size={10} fill="currentColor" className="node-fav" /> : null}
          {data.status === 'success' && !data.cached ? <ChevronDown size={10} /> : null}
        </span>
        {data.status === 'running' ? (
          <span
            className="node-progress"
            style={{ width: `${data.progress ?? 8}%` }}
          />
        ) : null}
      </div>
      {data.status === 'error' && data.error ? (
        <div className="studio-node__error">{truncate(data.error, 80)}</div>
      ) : null}
    </div>
  );
}

export const StudioNodeView = memo(StudioNodeComponent);
