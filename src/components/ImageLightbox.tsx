import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Download, ExternalLink, X } from 'lucide-react';
import { useStudioStore } from '../store/studioStore';
import { downloadImage } from '../lib/image';

export function ImageLightbox() {
  const asset = useStudioStore((state) => state.ui.lightbox);
  const showLightbox = useStudioStore((state) => state.showLightbox);
  const toast = useStudioStore((state) => state.toast);

  useEffect(() => {
    if (!asset) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') showLightbox(undefined);
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [asset, showLightbox]);

  if (!asset) return null;

  return createPortal(
    <div className="lightbox-layer" onMouseDown={() => showLightbox(undefined)}>
      <div className="lightbox" onMouseDown={(event) => event.stopPropagation()}>
        <div className="lightbox__toolbar">
          <div>
            <span>图像预览</span>
            {asset.width && asset.height ? <em>{asset.width} × {asset.height}</em> : null}
            {asset.simulated ? <span className="sim-watermark sim-watermark--inline">SIMULATION</span> : null}
          </div>
          <div>
            <button
              type="button"
              onClick={async () => {
                const delivery = await downloadImage(
                  asset,
                  asset.filename ?? 'comfyui-output',
                  'png',
                );
                if (delivery) {
                  toast({
                    type: delivery.kind === 'cancelled' ? 'info' : 'success',
                    title:
                      delivery.kind === 'saved'
                        ? '已保存到相册'
                        : delivery.kind === 'shared'
                          ? '图片已生成'
                          : delivery.kind === 'cancelled'
                            ? '已取消'
                            : '图片已下载',
                    description: delivery.message,
                  });
                }
              }}
              title="保存到相册"
            >
              <Download size={15} />
            </button>
            <button type="button" onClick={() => window.open(asset.src, '_blank', 'noopener,noreferrer')} title="在新窗口打开">
              <ExternalLink size={15} />
            </button>
            <button type="button" onClick={() => showLightbox(undefined)} aria-label="关闭预览">
              <X size={17} />
            </button>
          </div>
        </div>
        <div className="lightbox__image-wrap">
          <img src={asset.src} alt={asset.alt ?? '生成图像'} />
        </div>
        {asset.simulated ? (
          <p className="lightbox__note">
            这是学习用的模拟输出，由本地生成的占位图构成，不是真实 AI 生成结果。
          </p>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
