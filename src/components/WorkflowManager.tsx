import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Clock3,
  Copy,
  Download,
  FileJson,
  FolderOpen,
  Plus,
  Search,
  Star,
  Trash2,
  Upload,
  Workflow,
  Pencil,
  Check,
  X,
} from 'lucide-react';
import { useStudioStore } from '../store/studioStore';
import { Modal } from './ui/Modal';
import { WorkflowThumb } from './WorkflowThumb';
import { WORKFLOW_CATEGORIES } from '../data/sampleWorkflows';
import { relativeTime } from '../lib/format';

type Filter = '全部' | '最近' | '收藏' | (string & {});

export function WorkflowManager() {
  const activeModal = useStudioStore((state) => state.ui.activeModal);
  const workflows = useStudioStore((state) => state.workflows);
  const activeId = useStudioStore((state) => state.activeWorkflowId);
  const currentNodes = useStudioStore((state) => state.nodes);
  const currentEdges = useStudioStore((state) => state.edges);
  const closeModal = useStudioStore((state) => state.closeModal);
  const openWorkflow = useStudioStore((state) => state.openWorkflow);
  const newWorkflow = useStudioStore((state) => state.newWorkflow);
  const duplicateWorkflow = useStudioStore((state) => state.duplicateWorkflow);
  const deleteWorkflow = useStudioStore((state) => state.deleteWorkflow);
  const renameWorkflow = useStudioStore((state) => state.renameWorkflow);
  const toggleFavorite = useStudioStore((state) => state.toggleWorkflowFavorite);
  const exportWorkflow = useStudioStore((state) => state.exportWorkflow);
  const saveAs = useStudioStore((state) => state.saveAs);
  const currentWorkflowName = useStudioStore((state) => state.workflowName);
  const importWorkflowJson = useStudioStore((state) => state.importWorkflowJson);
  const toast = useStudioStore((state) => state.toast);
  const setUI = useStudioStore((state) => state.setUI);
  const [filter, setFilter] = useState<Filter>('全部');
  const [query, setQuery] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [saveAsName, setSaveAsName] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const open = activeModal === 'workflows';

  useEffect(() => {
    if (!open) {
      setFilter('全部');
      setSaveAsName(null);
      setQuery('');
      setEditingId(null);
      setDeleteId(null);
    }
  }, [open]);

  const displayWorkflows = useMemo(
    () =>
      workflows.map((workflow) =>
        workflow.id === activeId
          ? { ...workflow, nodes: currentNodes, edges: currentEdges }
          : workflow,
      ),
    [workflows, activeId, currentNodes, currentEdges],
  );

  const categories = useMemo(() => {
    const list = new Set<string>([...WORKFLOW_CATEGORIES.filter((category) => category !== '全部')]);
    displayWorkflows.forEach((workflow) => {
      if (workflow.category) list.add(workflow.category);
    });
    return ['全部', '最近', '收藏', ...Array.from(list)];
  }, [displayWorkflows]);

  const counts = useMemo(() => {
    const result: Record<string, number> = { 全部: displayWorkflows.length, 最近: displayWorkflows.filter((workflow) => workflow.lastOpenedAt).length, 收藏: displayWorkflows.filter((workflow) => workflow.favorite).length };
    displayWorkflows.forEach((workflow) => {
      result[workflow.category] = (result[workflow.category] ?? 0) + 1;
    });
    return result;
  }, [displayWorkflows]);

  const filtered = useMemo(() => {
    let list = [...displayWorkflows];
    if (filter === '最近') {
      list = list
        .filter((workflow) => workflow.lastOpenedAt)
        .sort((a, b) => (b.lastOpenedAt ?? 0) - (a.lastOpenedAt ?? 0));
    } else if (filter === '收藏') {
      list = list.filter((workflow) => workflow.favorite);
    } else if (filter !== '全部') {
      list = list.filter((workflow) => workflow.category === filter);
    } else {
      list.sort((a, b) => b.updatedAt - a.updatedAt);
    }
    const search = query.trim().toLowerCase();
    if (search) {
      list = list.filter((workflow) =>
        [workflow.name, workflow.description, workflow.category, ...workflow.tags]
          .join(' ')
          .toLowerCase()
          .includes(search),
      );
    }
    return list;
  }, [displayWorkflows, filter, query]);

  const deleteTarget = displayWorkflows.find((workflow) => workflow.id === deleteId);

  const startRename = (id: string, name: string) => {
    setEditingId(id);
    setEditName(name);
  };

  const commitRename = () => {
    if (!editingId) return;
    renameWorkflow(editingId, editName);
    setEditingId(null);
    toast({ type: 'success', title: '工作流已重命名' });
  };

  const handleImportFile = async (file: File) => {
    if (!file.name.toLowerCase().endsWith('.json')) {
      toast({ type: 'error', title: '请选择 JSON 工作流文件' });
      return;
    }
    setImporting(true);
    try {
      const text = await file.text();
      const result = await importWorkflowJson(text);
      if (!result.ok) {
        toast({ type: 'error', title: '导入失败', description: result.message });
      }
    } catch {
      toast({ type: 'error', title: '文件读取失败' });
    } finally {
      setImporting(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={closeModal}
      title="工作流库"
      subtitle="保存、导入和组织你的节点工作流。JSON 是唯一的数据格式。"
      eyebrow="WORKFLOW LIBRARY"
      icon={<Workflow size={18} />}
      size="xl"
      className="workflow-modal"
      footer={
        deleteTarget ? (
          <div className="delete-confirm">
            <span>
              删除「<strong>{deleteTarget.name}</strong>」？工作流数据将无法恢复。
            </span>
            <button type="button" className="btn btn--ghost" onClick={() => setDeleteId(null)}>
              取消
            </button>
            <button
              type="button"
              className="btn btn--danger"
              onClick={() => {
                void deleteWorkflow(deleteTarget.id);
                setDeleteId(null);
              }}
            >
              删除工作流
            </button>
          </div>
        ) : (
          <>
            <button
              type="button"
              className="btn btn--ghost"
              onClick={() => fileRef.current?.click()}
              disabled={importing}
            >
              <Upload size={14} />
              {importing ? '导入中…' : '导入 JSON'}
            </button>
            <span className="modal-footer-spacer" />
            <button type="button" className="btn btn--ghost" onClick={closeModal}>
              关闭
            </button>
            <button type="button" className="btn btn--primary" onClick={() => void newWorkflow()}>
              <Plus size={14} />
              新建工作流
            </button>
          </>
        )
      }
    >
      <input
        ref={fileRef}
        type="file"
        accept="application/json,.json"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void handleImportFile(file);
          event.target.value = '';
        }}
      />
      <div className="workflow-manager">
        <aside className="workflow-categories">
          {categories.map((category) => (
            <button
              key={category}
              type="button"
              className={filter === category ? 'is-active' : ''}
              onClick={() => setFilter(category)}
            >
              {category === '收藏' ? <Star size={13} /> : category === '最近' ? <Clock3 size={13} /> : <FolderOpen size={13} />}
              <span>{category}</span>
              <em>{counts[category] ?? 0}</em>
            </button>
          ))}
          <div className="workflow-categories__hint">
            <FileJson size={14} />
            <p>工作流包含节点、位置、参数、连接与版本信息。导出的 JSON 可以再次导入。</p>
          </div>
        </aside>

        <div className="workflow-main">
          <div className="workflow-toolbar">
            <div className="workflow-search">
              <Search size={14} />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="搜索工作流名称、标签…"
              />
              {query ? (
                <button type="button" onClick={() => setQuery('')} aria-label="清除搜索">
                  <X size={12} />
                </button>
              ) : null}
            </div>
            <button
              type="button"
              className="workflow-save-as"
              onClick={() => setSaveAsName(currentWorkflowName)}
            >
              另存为
            </button>
            <span className="workflow-count">{filtered.length} 个工作流</span>
          </div>

          {saveAsName !== null ? (
            <div className="workflow-save-as-row">
              <label htmlFor="save-as-name">另存当前工作流为</label>
              <input
                id="save-as-name"
                autoFocus
                value={saveAsName}
                onChange={(event) => setSaveAsName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && saveAsName.trim()) {
                    void saveAs(saveAsName);
                  }
                  if (event.key === 'Escape') setSaveAsName(null);
                }}
              />
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                onClick={() => setSaveAsName(null)}
              >
                取消
              </button>
              <button
                type="button"
                className="btn btn--primary btn--sm"
                disabled={!saveAsName.trim()}
                onClick={() => void saveAs(saveAsName)}
              >
                保存副本
              </button>
            </div>
          ) : null}

          {filtered.length ? (
            <div className="workflow-grid">
              {filtered.map((workflow) => {
                const isActive = workflow.id === activeId;
                return (
                  <article
                    key={workflow.id}
                    className={`workflow-card ${isActive ? 'is-active' : ''}`}
                    role="button"
                    tabIndex={0}
                    aria-label={`打开工作流 ${workflow.name}`}
                    onClick={() => {
                      if (editingId === workflow.id) return;
                      void openWorkflow(workflow.id);
                    }}
                    onKeyDown={(event) => {
                      if (editingId === workflow.id) return;
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        void openWorkflow(workflow.id);
                      }
                    }}
                  >
                    <div className="workflow-card__preview">
                      <WorkflowThumb nodes={workflow.nodes} edges={workflow.edges} />
                      {isActive ? <span className="workflow-card__active">当前</span> : null}
                      <button
                        type="button"
                        className={`workflow-card__star ${workflow.favorite ? 'is-on' : ''}`}
                        onClick={(event) => {
                          event.stopPropagation();
                          toggleFavorite(workflow.id);
                        }}
                        aria-label={workflow.favorite ? '取消收藏' : '收藏工作流'}
                      >
                        <Star size={13} fill={workflow.favorite ? 'currentColor' : 'none'} />
                      </button>
                    </div>
                    <div className="workflow-card__body">
                      {editingId === workflow.id ? (
                        <div className="workflow-rename" onClick={(event) => event.stopPropagation()}>
                          <input
                            autoFocus
                            value={editName}
                            onChange={(event) => setEditName(event.target.value)}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter') commitRename();
                              if (event.key === 'Escape') setEditingId(null);
                            }}
                          />
                          <button type="button" onClick={commitRename} aria-label="确认重命名">
                            <Check size={13} />
                          </button>
                        </div>
                      ) : (
                        <h3>{workflow.name}</h3>
                      )}
                      <p>{workflow.description || '没有说明。'}</p>
                      <div className="workflow-card__meta">
                        <span>{workflow.category}</span>
                        <span>{workflow.nodes.length} 节点</span>
                        <span>{workflow.edges.length} 连接</span>
                        <span>{relativeTime(workflow.updatedAt)}</span>
                      </div>
                      {workflow.tags.length ? (
                        <div className="workflow-card__tags">
                          {workflow.tags.slice(0, 3).map((tag) => (
                            <span key={tag}>{tag}</span>
                          ))}
                        </div>
                      ) : null}
                    </div>
                    <div className="workflow-card__actions">
                      <button
                        type="button"
                        title="重命名"
                        onClick={(event) => {
                          event.stopPropagation();
                          startRename(workflow.id, workflow.name);
                        }}
                      >
                        <Pencil size={13} />
                      </button>
                      <button
                        type="button"
                        title="复制工作流"
                        onClick={(event) => {
                          event.stopPropagation();
                          void duplicateWorkflow(workflow.id);
                        }}
                      >
                        <Copy size={13} />
                      </button>
                      <button
                        type="button"
                        title="导出 JSON"
                        onClick={(event) => {
                          event.stopPropagation();
                          exportWorkflow(workflow.id);
                        }}
                      >
                        <Download size={13} />
                      </button>
                      <button
                        type="button"
                        title="删除"
                        className="is-danger"
                        onClick={(event) => {
                          event.stopPropagation();
                          setDeleteId(workflow.id);
                        }}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="workflow-empty">
              <FolderOpen size={26} />
              <strong>没有匹配的工作流</strong>
              <p>换个分类或关键词，或者新建一个空白工作流。</p>
              <button
                type="button"
                className="btn btn--soft"
                onClick={() => {
                  setFilter('全部');
                  setQuery('');
                }}
              >
                清除筛选
              </button>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
