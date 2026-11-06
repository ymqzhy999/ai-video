import { useEffect, useState, type ReactNode } from 'react';
import {
  ArrowRight,
  BookOpen,
  Check,
  CircleHelp,
  Command,
  GitBranch,
  KeyRound,
  Layers,
  Link2,
  MousePointer2,
  Play,
  Settings,
  Sparkles,
  SquareDashed,
  Type,
  Workflow,
  Zap,
} from 'lucide-react';
import { useStudioStore } from '../store/studioStore';
import { Modal } from './ui/Modal';
import { PORT_TYPES } from '../types/studio';

type HelpTab = 'start' | 'concepts' | 'shortcuts';

const PROGRESS_KEY = 'comfyui-studio:learning-progress';

const LESSONS = [
  {
    id: 'open-sample',
    title: '打开并运行一个示例',
    description: '在工作流库打开「Aurora / 电影感宇航员」，点击顶部执行，观察节点依次亮起。',
  },
  {
    id: 'read-node',
    title: '读懂一个节点',
    description: '点击任意节点，在右侧查看它的输入、输出、参数，以及端口颜色代表的类型。',
  },
  {
    id: 'edit-prompt',
    title: '修改提示词',
    description: '找到「提示词」节点，把主体换成你想画的东西，再执行一次。',
  },
  {
    id: 'seed',
    title: '固定种子与随机种子',
    description: '在「随机种子」节点切换「每次执行随机」，对比两次输出是否变化。',
  },
  {
    id: 'connect',
    title: '自己连接一条线',
    description: '添加一个「负向提示词」，把它的文本输出连到生成节点的负向输入。',
  },
  {
    id: 'real-api',
    title: '配置 Key 尝试真实生成',
    description: '在设置里填写 Agnes 与 DeepSeek Key。学习阶段不配置也完全不影响使用。',
  },
  {
    id: 'node-guide',
    title: '长按节点看工作机制',
    description: '长按画布上的任意节点，或点节点库右侧的书本图标，查看端口、机制和连接示例。',
  },
  {
    id: 'video-nodes',
    title: '认识视频链路',
    description: '打开「首帧到视频 / Wan I2V」示例，观察首帧、Wan 图生视频、视频合成和视频输出如何连接。',
  },
];

function loadProgress(): string[] {
  try {
    const raw = localStorage.getItem(PROGRESS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

export function HelpModal() {
  const activeModal = useStudioStore((state) => state.ui.activeModal);
  const closeModal = useStudioStore((state) => state.closeModal);
  const openModal = useStudioStore((state) => state.openModal);
  const openWorkflow = useStudioStore((state) => state.openWorkflow);
  const workflows = useStudioStore((state) => state.workflows);
  const [tab, setTab] = useState<HelpTab>('start');
  const [completed, setCompleted] = useState<string[]>([]);
  const open = activeModal === 'help';

  useEffect(() => {
    if (open) setCompleted(loadProgress());
  }, [open]);

  const toggleLesson = (id: string) => {
    setCompleted((current) => {
      const next = current.includes(id) ? current.filter((item) => item !== id) : [...current, id];
      try {
        localStorage.setItem(PROGRESS_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  const progress = Math.round((completed.length / LESSONS.length) * 100);

  return (
    <Modal
      open={open}
      onClose={closeModal}
      title="学习中心"
      subtitle="用一条可运行的工作流，理解节点、连接、参数与执行。"
      eyebrow="LEARN COMFYUI"
      icon={<BookOpen size={18} />}
      size="lg"
      className="help-modal"
      footer={
        <>
          <button type="button" className="btn btn--ghost" onClick={closeModal}>
            关闭
          </button>
          <span className="modal-footer-spacer" />
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => openModal('settings')}
          >
            <Settings size={14} />
            前往设置
          </button>
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => {
              const sample = workflows.find((workflow) => workflow.id === 'wf_aurora_astronaut');
              if (sample) {
                void openWorkflow(sample.id).then(() => {
                  window.setTimeout(() => {
                    void useStudioStore.getState().runAll();
                  }, 500);
                });
              } else {
                openModal('workflows');
              }
            }}
          >
            <Zap size={14} />
            打开示例并执行
          </button>
        </>
      }
    >
      <div className="help-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'start'}
          className={tab === 'start' ? 'is-active' : ''}
          onClick={() => setTab('start')}
        >
          <Sparkles size={13} />
          快速入门
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'concepts'}
          className={tab === 'concepts' ? 'is-active' : ''}
          onClick={() => setTab('concepts')}
        >
          <Layers size={13} />
          核心概念
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'shortcuts'}
          className={tab === 'shortcuts' ? 'is-active' : ''}
          onClick={() => setTab('shortcuts')}
        >
          <Command size={13} />
          快捷键
        </button>
      </div>

      <div className="help-content">
        {tab === 'start' ? (
          <>
            <div className="help-intro">
              <div className="help-intro__diagram">
                <span className="mini-node mini-node--text">提示词</span>
                <span className="mini-edge" />
                <span className="mini-node mini-node--gen">Agnes 生成</span>
                <span className="mini-edge" />
                <span className="mini-node mini-node--out">输出</span>
              </div>
              <div>
                <p className="eyebrow">THE 60-SECOND MODEL</p>
                <h3>节点 → 连接 → 执行 → 结果</h3>
                <p>
                  节点负责一件事，连线把上一个节点的输出交给下一个节点。执行时，引擎会先检查连接和参数，再按依赖顺序逐个运行。
                </p>
              </div>
            </div>

            <div className="learning-progress">
              <div className="learning-progress__head">
                <span>入门练习</span>
                <em>{progress}%</em>
              </div>
              <div className="learning-progress__bar">
                <span style={{ width: `${progress}%` }} />
              </div>
            </div>

            <div className="lesson-list">
              {LESSONS.map((lesson, index) => {
                const done = completed.includes(lesson.id);
                return (
                  <button
                    key={lesson.id}
                    type="button"
                    className={`lesson-row ${done ? 'is-done' : ''}`}
                    onClick={() => toggleLesson(lesson.id)}
                  >
                    <span className="lesson-row__check">{done ? <Check size={13} /> : index + 1}</span>
                    <span className="lesson-row__content">
                      <strong>{lesson.title}</strong>
                      <p>{lesson.description}</p>
                    </span>
                    <span className="lesson-row__hint">{done ? '已完成' : '标记完成'}</span>
                  </button>
                );
              })}
            </div>

            <div className="help-tip">
              <Sparkles size={14} />
              <p>
                <strong>先跑起来，再看参数。</strong>
                不必一开始理解所有节点。打开示例，修改一句提示词，点击执行，观察发生了什么，这是最快的学习路径。
              </p>
            </div>
          </>
        ) : null}

        {tab === 'concepts' ? (
          <>
            <div className="concept-grid">
              <ConceptCard icon={SquareDashed} title="Node / 节点">
                工作流里的一块积木，负责一个具体任务，例如写提示词、读取图片、调用生成模型。
              </ConceptCard>
              <ConceptCard icon={Link2} title="Edge / 连接">
                把源节点的输出端口连接到目标节点的输入端口。连接代表数据流方向。
              </ConceptCard>
              <ConceptCard icon={Type} title="Port / 端口">
                节点两侧的小圆点。左侧是输入，右侧是输出。颜色代表数据类型。
              </ConceptCard>
              <ConceptCard icon={GitBranch} title="DAG / 依赖顺序">
                工作流必须是有向无环图。执行引擎会从没有上游依赖的节点开始，依次运行。
              </ConceptCard>
              <ConceptCard icon={Layers} title="Checkpoint / 模型">
                生成图像的基础模型。模型节点只提供模型引用，真正画图的是生成或采样节点。
              </ConceptCard>
              <ConceptCard icon={Workflow} title="Sampler / 采样器">
                控制扩散过程。步数、CFG、采样器与调度器会影响细节和风格。
              </ConceptCard>
              <ConceptCard icon={Sparkles} title="Prompt / 提示词">
                用文字描述画面。正向提示词写“想要什么”，负向提示词写“不希望出现什么”。
              </ConceptCard>
              <ConceptCard icon={KeyRound} title="API / 真实生成">
                配置 Key 后，生成节点向服务商发起请求。未配置时用模拟模式学习流程，输出会带 SIMULATION 标记。
              </ConceptCard>
            </div>

            <div className="help-section-block">
              <h3>端口类型与颜色</h3>
              <div className="port-type-table">
                {Object.entries(PORT_TYPES).map(([key, meta]) => (
                  <div key={key}>
                    <span className="port-type-dot" style={{ background: meta.color }} />
                    <strong>{key}</strong>
                    <span>{meta.label}</span>
                    <em>{meta.description}</em>
                  </div>
                ))}
              </div>
            </div>

            <div className="help-section-block">
              <h3>模拟执行与真实执行</h3>
              <div className="compare-grid">
                <div>
                  <span className="compare-tag">模拟</span>
                  <strong>学习模式</strong>
                  <p>不调用生成 API，按真实依赖顺序执行，输出为带水印的演示图。日志会明确写出「模拟」。</p>
                </div>
                <div>
                  <span className="compare-tag compare-tag--live">真实</span>
                  <strong>API 模式</strong>
                  <p>配置 Agnes / DeepSeek Key 后发起真实请求。成功返回真实图像和文本，失败会定位到节点。</p>
                </div>
              </div>
            </div>

            <div className="help-tip">
              <CircleHelp size={14} />
              <p>
                <strong>连接不上？</strong>
                先看端口颜色是否一致，再看目标端口的必填项。不同类型的数据不能连接，例如图像不能直接接到文本输入。
              </p>
            </div>
          </>
        ) : null}

        {tab === 'shortcuts' ? (
          <div className="shortcut-groups">
            <div className="shortcut-group">
              <h3>
                <MousePointer2 size={14} /> 画布与节点
              </h3>
              <ShortcutRow keys="拖动空白处" action="框选多个节点（框选工具）" />
              <ShortcutRow keys="右键拖动 / 滚轮" action="平移画布 / 缩放" />
              <ShortcutRow keys="Shift / ⌘ + 点击" action="多选节点" />
              <ShortcutRow keys="双击节点" action="打开属性面板" />
              <ShortcutRow keys="⌘ A" action="全选节点" />
              <ShortcutRow keys="⌫ / Delete" action="删除所选节点或连接" />
            </div>
            <div className="shortcut-group">
              <h3>
                <Command size={14} /> 工作流
              </h3>
              <ShortcutRow keys="⌘ S" action="保存当前工作流" />
              <ShortcutRow keys="⌘ Z / ⇧⌘ Z" action="撤销 / 重做" />
              <ShortcutRow keys="⌘ C / ⌘ V" action="复制 / 粘贴节点" />
              <ShortcutRow keys="⌘ D" action="直接复制所选节点" />
              <ShortcutRow keys="⌘ N" action="新建工作流" />
              <ShortcutRow keys="⌘ O" action="打开工作流库" />
            </div>
            <div className="shortcut-group">
              <h3>
                <Play size={14} /> 执行
              </h3>
              <ShortcutRow keys="⌘ Enter" action="执行整个工作流" />
              <ShortcutRow keys="⌘ ." action="停止执行" />
              <ShortcutRow keys="右键节点" action="运行此节点 / 从这里继续" />
              <ShortcutRow keys="Esc" action="关闭面板或对话框" />
            </div>
            <div className="help-tip help-tip--compact">
              <ArrowRight size={14} />
              <p>移动端没有键盘快捷键，请使用底部导航和顶部菜单完成同样操作。</p>
            </div>
          </div>
        ) : null}
      </div>
    </Modal>
  );
}

function ConceptCard({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof SquareDashed;
  title: string;
  children: ReactNode;
}) {
  return (
    <article className="concept-card">
      <span>
        <Icon size={15} />
      </span>
      <h3>{title}</h3>
      <p>{children}</p>
    </article>
  );
}

function ShortcutRow({ keys, action }: { keys: string; action: string }) {
  return (
    <div className="shortcut-row">
      <kbd>{keys}</kbd>
      <span>{action}</span>
    </div>
  );
}
