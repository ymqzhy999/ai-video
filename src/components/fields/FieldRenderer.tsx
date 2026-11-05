import { useRef, useState } from 'react';
import {
  Code2,
  Dices,
  ImagePlus,
  Minus,
  Plus,
  UploadCloud,
  X,
} from 'lucide-react';
import type { FieldDef, ImageAsset } from '../../types/studio';
import { readImageFile } from '../../lib/image';
import { useStudioStore } from '../../store/studioStore';
import { charCount, byteSize } from '../../lib/format';

interface FieldRendererProps {
  field: FieldDef;
  value: unknown;
  nodeId: string;
  onChange: (key: string, value: unknown) => void;
}

function stopLabelFocus(event: React.MouseEvent) {
  event.stopPropagation();
}

export function FieldRenderer({ field, value, nodeId, onChange }: FieldRendererProps) {
  const toast = useStudioStore((state) => state.toast);
  const updateNodeParams = useStudioStore((state) => state.updateNodeParams);
  const nodeParams = useStudioStore((state) => state.nodes.find((node) => node.id === nodeId)?.data.params);
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [imageDragOver, setImageDragOver] = useState(false);

  if (field.showIf && value === undefined) return null;

  const commonId = `${nodeId}-${field.key}`;

  if (field.type === 'image') {
    const src = typeof value === 'string' ? value : '';
    const handleFile = async (file: File) => {
      setUploading(true);
      try {
        const asset = await readImageFile(file);
        onChange(field.key, asset.src);
        updateNodeParams(nodeId, {
          [field.key]: asset.src,
          imageMeta: {
            width: asset.width,
            height: asset.height,
            filename: asset.filename ?? file.name,
            size: byteSize(asset.src),
          },
        });
        toast({ type: 'success', title: '图片已载入', description: file.name });
      } catch (error) {
        toast({
          type: 'error',
          title: '图片读取失败',
          description: error instanceof Error ? error.message : '未知错误',
        });
      } finally {
        setUploading(false);
      }
    };

    return (
      <div className="field">
        <label>{field.label}</label>
        {src ? (
          <div className="image-field">
            <img src={src} alt={field.label} />
            <button
              type="button"
              className="image-field__remove"
              onClick={() => {
                updateNodeParams(nodeId, {
                  [field.key]: '',
                  imageMeta: undefined,
                });
              }}
              aria-label="移除图片"
            >
              <X size={12} />
            </button>
            <div className="image-field__meta">
              <span>
                {(() => {
                  const meta = nodeParams?.imageMeta as
                    | { width?: number; height?: number; filename?: string }
                    | undefined;
                  if (meta?.width && meta?.height) {
                    const ext = meta.filename?.split('.').pop()?.toUpperCase();
                    return `${meta.width} × ${meta.height}${ext ? ` · ${ext}` : ''}`;
                  }
                  return '本地图片';
                })()}
              </span>
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
              >
                更换
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            className={`image-dropzone ${imageDragOver ? 'is-over' : ''}`}
            onClick={() => fileRef.current?.click()}
            onDragOver={(event) => {
              event.preventDefault();
              setImageDragOver(true);
            }}
            onDragLeave={() => setImageDragOver(false)}
            onDrop={(event) => {
              event.preventDefault();
              setImageDragOver(false);
              const file = event.dataTransfer.files?.[0];
              if (file) void handleFile(file);
            }}
            disabled={uploading}
          >
            <span className="image-dropzone__icon">
              {uploading ? <UploadCloud size={18} className="pulse" /> : <ImagePlus size={18} />}
            </span>
            <strong>{uploading ? '正在压缩图片…' : '点击上传或拖入图片'}</strong>
            <small>PNG / JPEG / WebP · 最大 14 MB</small>
          </button>
        )}
        <input
          ref={fileRef}
          type="file"
          accept={field.accept ?? 'image/*'}
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void handleFile(file);
            event.target.value = '';
          }}
        />
        {field.description ? <p className="field__help">{field.description}</p> : null}
      </div>
    );
  }

  if (field.type === 'textarea' || field.type === 'code') {
    const stringValue = typeof value === 'string' ? value : '';
    const isCode = field.type === 'code';
    let jsonValid: boolean | null = null;
    if (isCode && stringValue.trim()) {
      try {
        JSON.parse(stringValue);
        jsonValid = true;
      } catch {
        jsonValid = false;
      }
    }
    return (
      <div className="field">
        <div className="field__label-row">
          <label htmlFor={commonId}>{field.label}</label>
          <span className="field__counter">
            {isCode
              ? jsonValid === null
                ? 'JSON'
                : jsonValid
                  ? 'JSON 有效'
                  : 'JSON 格式错误'
              : `${charCount(stringValue)} 字符`}
          </span>
        </div>
        <textarea
          id={commonId}
          className={`${isCode ? 'code-input' : ''} ${isCode && jsonValid === false ? 'has-error' : ''}`}
          rows={field.rows ?? 4}
          value={stringValue}
          placeholder={field.placeholder}
          spellCheck={!isCode}
          onChange={(event) => onChange(field.key, event.target.value)}
        />
        {field.description ? <p className="field__help">{field.description}</p> : null}
      </div>
    );
  }

  if (field.type === 'select') {
    return (
      <div className="field">
        <label htmlFor={commonId}>{field.label}</label>
        <div className="select-wrap">
          <select
            id={commonId}
            value={String(value ?? '')}
            onChange={(event) => onChange(field.key, event.target.value)}
          >
            {field.options?.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        {field.description ? <p className="field__help">{field.description}</p> : null}
      </div>
    );
  }

  if (field.type === 'toggle') {
    return (
      <div className="field">
        <button
          type="button"
          className={`toggle-row ${Boolean(value) ? 'is-on' : ''}`}
          onClick={() => onChange(field.key, !value)}
          role="switch"
          aria-checked={Boolean(value)}
        >
          <span>{field.label}</span>
          <span className="toggle-row__switch">
            <i />
          </span>
        </button>
        {field.description ? <p className="field__help">{field.description}</p> : null}
      </div>
    );
  }

  if (field.type === 'slider') {
    const numeric = Number(value ?? field.min ?? 0);
    return (
      <div className="field">
        <div className="field__label-row">
          <label htmlFor={commonId}>{field.label}</label>
          <span className="field__value">
            {numeric}
            {field.unit ?? ''}
          </span>
        </div>
        <div className="slider-row">
          <button
            type="button"
            className="stepper"
            onClick={() =>
              onChange(field.key, Math.max(field.min ?? 0, numeric - (field.step ?? 1)))
            }
            aria-label="减少"
          >
            <Minus size={12} />
          </button>
          <input
            id={commonId}
            type="range"
            min={field.min}
            max={field.max}
            step={field.step}
            value={numeric}
            onChange={(event) => onChange(field.key, Number(event.target.value))}
          />
          <button
            type="button"
            className="stepper"
            onClick={() =>
              onChange(field.key, Math.min(field.max ?? 100, numeric + (field.step ?? 1)))
            }
            aria-label="增加"
          >
            <Plus size={12} />
          </button>
        </div>
        {field.description ? <p className="field__help">{field.description}</p> : null}
      </div>
    );
  }

  if (field.type === 'seed') {
    return (
      <div className="field">
        <label htmlFor={commonId}>{field.label}</label>
        <div className="input-with-action">
          <input
            id={commonId}
            type="number"
            min={field.min}
            max={field.max}
            step={1}
            value={String(value ?? 0)}
            onChange={(event) => onChange(field.key, Number(event.target.value))}
          />
          <button
            type="button"
            onClick={() => onChange(field.key, Math.floor(Math.random() * 999999999))}
            title="随机生成种子"
          >
            <Dices size={14} />
            随机
          </button>
        </div>
        {field.description ? <p className="field__help">{field.description}</p> : null}
      </div>
    );
  }

  if (field.type === 'number') {
    return (
      <div className="field">
        <label htmlFor={commonId}>{field.label}</label>
        <div className="input-with-unit">
          <input
            id={commonId}
            type="number"
            min={field.min}
            max={field.max}
            step={field.step ?? 1}
            value={Number(value ?? 0)}
            onChange={(event) => onChange(field.key, Number(event.target.value))}
          />
          {field.unit ? <span>{field.unit}</span> : null}
        </div>
        {field.description ? <p className="field__help">{field.description}</p> : null}
      </div>
    );
  }

  if (field.type === 'color') {
    return (
      <div className="field">
        <label htmlFor={commonId}>{field.label}</label>
        <div className="color-field">
          <input
            id={commonId}
            type="color"
            value={typeof value === 'string' ? value : '#8b7dff'}
            onChange={(event) => onChange(field.key, event.target.value)}
          />
          <span>{String(value ?? '#8b7dff')}</span>
        </div>
      </div>
    );
  }

  if (field.type === 'readonly') {
    return (
      <div className="field">
        <label>{field.label}</label>
        <div className="readonly-value">{String(value ?? '—')}</div>
      </div>
    );
  }

  return (
    <div className="field">
      <label htmlFor={commonId}>
        {field.label}
        {field.description ? <span className="field__hint-icon" onMouseDown={stopLabelFocus}>?</span> : null}
      </label>
      <input
        id={commonId}
        type="text"
        value={typeof value === 'string' ? value : String(value ?? '')}
        placeholder={field.placeholder}
        spellCheck={false}
        onChange={(event) => onChange(field.key, event.target.value)}
      />
      {field.description ? <p className="field__help">{field.description}</p> : null}
    </div>
  );
}
