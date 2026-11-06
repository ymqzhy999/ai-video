import {
  BookOpen,
  Check,
  HelpCircle,
  Plus,
  Sparkles,
  TriangleAlert,
} from 'lucide-react';
import { useStudioStore } from '../store/studioStore';
import { getNodeDefinition } from '../lib/nodeRegistry';
import { getNodeGuide, portExamples } from '../lib/nodeGuide';
import { NODE_CATEGORIES, PORT_TYPES } from '../types/studio';
import { Modal } from './ui/Modal';
import { NodeIcon } from './NodeIcon';

export function NodeGuideModal() {
  const activeModal = useStudioStore((state) => state.ui.activeModal);
  const guideType = useStudioStore((state) => state.ui.guideNodeType);
  const closeModal = useStudioStore((state) => state.closeModal);
  const addNodeAtCenter = useStudioStore((state) => state.addNodeAtCenter);
  const open = activeModal === 'guide' && Boolean(guideType);
  if (!guideType) return null;

  const definition = getNodeDefinition(guideType);
  const guide = getNodeGuide(definition);
  const category = NODE_CATEGORIES.find((item) => item.id === definition.category);
  const inputs = definition.inputs;
  const outputs = definition.outputs;
  const isStructural =
    definition.implementation === 'structural' ||
    definition.implementation === 'external' ||
    definition.category === 'video';

  return (
    <Modal
      open={open}
      onClose={closeModal}
      title={`${definition.title} · 节点教学`}
      subtitle="长按节点可随时打开；这里说明它如何工作，以及怎样连接上下游。"
      eyebrow="NODE GUIDE"
      icon={<BookOpen size={18} />}
      size="lg"
      footer={
        <>
          <button type="button" className="btn btn--ghost" onClick={closeModal}>
            关闭
          </button>
          <span className="modal-footer-spacer" />
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => {
              addNodeAtCenter(definition.type);
              closeModal();
            }}
          >
            <Plus size={14} />
            添加到画布
          </button>
        </>
      }
    >
      <div className="guide-hero">
        <span
          className="guide-hero__icon"
          style={{ color: definition.accent, background: `${definition.accent}16`, borderColor: `${definition.accent}33` }}
        >
          <NodeIcon name={definition.icon} size={23} />
        </span>
        <div>
          <p className="eyebrow">{category?.label ?? definition.category} · {definition.subtitle}</p>
          <h3>{definition.title}</h3>
          <p>{definition.description}</p>
          <div className="guide-badges">
            <span className={isStructural ? 'guide-badge guide-badge--warn' : 'guide-badge guide-badge--ok'}>
              {isStructural ? <TriangleAlert size={11} /> : <Check size={11} />}
              {guide.implementationLabel}
            </span>
            <span className="guide-badge">{inputs.length} 个输入</span>
            <span className="guide-badge">{outputs.length} 个输出</span>
          </div>
        </div>
      </div>

      <section className="guide-section">
        <h3><Sparkles size={14} /> 工作机制</h3>
        <p>{guide.mechanism}</p>
      </section>

      <div className="guide-columns">
        <section className="guide-section">
          <h3>输入端口</h3>
          {inputs.length ? (
            <div className="guide-port-list">
              {inputs.map((port) => (
                <div key={port.id} className="guide-port-row">
                  <span className="port-type-dot" style={{ background: PORT_TYPES[port.type].color }} />
                  <strong>{port.label}</strong>
                  <em>{port.type}{port.required ? ' · 必填' : ''}</em>
                  <small>可接：{portExamples(port, 'input')}</small>
                </div>
              ))}
            </div>
          ) : (
            <p className="inspector-empty-copy">这是一个起点节点，没有输入端口。</p>
          )}
        </section>
        <section className="guide-section">
          <h3>输出端口</h3>
          {outputs.length ? (
            <div className="guide-port-list">
              {outputs.map((port) => (
                <div key={port.id} className="guide-port-row">
                  <span className="port-type-dot" style={{ background: PORT_TYPES[port.type].color }} />
                  <strong>{port.label}</strong>
                  <em>{port.type}</em>
                  <small>可接：{portExamples(port, 'output')}</small>
                </div>
              ))}
            </div>
          ) : (
            <p className="inspector-empty-copy">这是链路终点，没有输出端口。</p>
          )}
        </section>
      </div>

      <section className="guide-section">
        <h3><HelpCircle size={14} /> 连接教学</h3>
        <p className="guide-connection">{guide.connection}</p>
        {guide.examples ? <p className="guide-example">{guide.examples}</p> : null}
      </section>

      <section className="guide-section">
        <h3>参数速览</h3>
        {definition.fields.length ? (
          <div className="guide-field-list">
            {definition.fields.map((field) => (
              <div key={field.key}>
                <strong>{field.label}</strong>
                <span>{field.type}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="inspector-empty-copy">这个节点没有可编辑参数。</p>
        )}
      </section>

      {isStructural ? (
        <div className="help-tip">
          <TriangleAlert size={14} />
          <p>
            这个节点已经把端口、参数和连接规则展示出来，方便先学习完整工作流结构；
            真实执行需要配置对应的视频 API、ComfyUI 服务或其他后端。
          </p>
        </div>
      ) : null}
    </Modal>
  );
}
