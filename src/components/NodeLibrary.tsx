import { useMemo, useState } from 'react';
import {
  Blocks,
  BookOpenText,
  Boxes,
  ChevronDown,
  ChevronRight,
  Clapperboard,
  Cpu,
  Download,
  FileOutput,
  Hash,
  Image as ImageIcon,
  MessageSquareText,
  Plus,
  Search,
  SlidersHorizontal,
  Sparkles,
  Star,
  Type,
  Video,
  X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useStudioStore } from '../store/studioStore';
import { searchNodes } from '../lib/nodeRegistry';
import { NODE_CATEGORIES, type NodeCategoryId, type NodeDefinition } from '../types/studio';
import { NodeIcon } from './NodeIcon';
import { PORT_TYPES } from '../types/studio';

const CATEGORY_ICONS: Record<NodeCategoryId, LucideIcon> = {
  input: Download,
  text: Type,
  image: ImageIcon,
  model: Boxes,
  prompt: MessageSquareText,
  generation: Sparkles,
  processing: SlidersHorizontal,
  sampling: Cpu,
  params: Hash,
  output: FileOutput,
  storyboard: BookOpenText,
  video: Video,
  custom: Blocks,
};

type LibraryTab = 'all' | 'favorites' | 'recent';

export function NodeLibrary() {
  const nodes = useStudioStore((state) => state.nodes);
  const recentNodes = useStudioStore((state) => state.recentNodes);
  const favoriteNodes = useStudioStore((state) => state.favoriteNodes);
  const addNodeAtCenter = useStudioStore((state) => state.addNodeAtCenter);
  const toggleFavoriteNode = useStudioStore((state) => state.toggleFavoriteNode);
  const openNodeGuide = useStudioStore((state) => state.openNodeGuide);
  const addRecentNode = useStudioStore((state) => state.addRecentNode);
  const leftOpen = useStudioStore((state) => state.ui.leftOpen);
  const setUI = useStudioStore((state) => state.setUI);
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState<LibraryTab>('all');
  const [collapsed, setCollapsed] = useState<Set<NodeCategoryId>>(new Set());

  const filtered = useMemo(() => searchNodes(query), [query]);
  const filteredMap = useMemo(
    () => new Map(filtered.map((definition) => [definition.type, definition])),
    [filtered],
  );

  const favoriteDefinitions = favoriteNodes
    .map((type) => filtered.find((definition) => definition.type === type))
    .filter((definition): definition is NodeDefinition => Boolean(definition));
  const recentDefinitions = recentNodes
    .map((type) => filtered.find((definition) => definition.type === type))
    .filter((definition): definition is NodeDefinition => Boolean(definition));

  const toggleCategory = (category: NodeCategoryId) => {
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  };

  const handleAdd = (definition: NodeDefinition) => {
    addRecentNode(definition.type);
    addNodeAtCenter(definition.type);
    setUI({ leftOpen: false });
  };

  const renderCard = (definition: NodeDefinition, dragEnabled = true) => {
    const isFavorite = favoriteNodes.includes(definition.type);
    return (
      <div
        key={definition.type}
        className="library-card"
        role="button"
        tabIndex={0}
        draggable={dragEnabled}
        onDragStart={(event) => {
          addRecentNode(definition.type);
          event.dataTransfer.setData('application/x-comfy-node', definition.type);
          event.dataTransfer.setData('text/plain', definition.type);
          event.dataTransfer.effectAllowed = 'copy';
          event.currentTarget.classList.add('is-dragging');
        }}
        onDragEnd={(event) => event.currentTarget.classList.remove('is-dragging')}
        onClick={() => handleAdd(definition)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            handleAdd(definition);
          }
        }}
        title={definition.description}
      >
        <span
          className="library-card__icon"
          style={{
            color: definition.accent,
            background: `${definition.accent}16`,
            borderColor: `${definition.accent}2b`,
          }}
        >
          <NodeIcon name={definition.icon} size={15} />
        </span>
        <span className="library-card__text">
          <span className="library-card__title-row">
            <strong>{definition.title}</strong>
            <span className="library-card__type">{definition.subtitle}</span>
          </span>
          <span className="library-card__description">{definition.description}</span>
          <span className="library-card__meta">
            {definition.inputs.length} 入 · {definition.outputs.length} 出
            {definition.outputs.length ? (
              <span className="library-card__ports">
                {definition.outputs.map((port) => (
                  <i
                    key={port.id}
                    style={{ background: PORT_TYPES[port.type].color }}
                    title={`${port.label} · ${PORT_TYPES[port.type].label}`}
                  />
                ))}
              </span>
            ) : null}
          </span>
        </span>
        <span className="library-card__actions">
          <button
            type="button"
            className="library-card__guide"
            onClick={(event) => {
              event.stopPropagation();
              openNodeGuide(definition.type);
            }}
            aria-label={`查看 ${definition.title} 的教学`}
            title="工作机制与连接教学"
          >
            <BookOpenText size={12} />
          </button>
          <button
            type="button"
            className={`library-card__star ${isFavorite ? 'is-on' : ''}`}
            onClick={(event) => {
              event.stopPropagation();
              toggleFavoriteNode(definition.type);
            }}
            aria-label={isFavorite ? '取消收藏' : '收藏节点'}
          >
            <Star size={12} fill={isFavorite ? 'currentColor' : 'none'} />
          </button>
          <button
            type="button"
            className="library-card__add"
            onClick={(event) => {
              event.stopPropagation();
              handleAdd(definition);
            }}
            aria-label={`添加 ${definition.title}`}
          >
            <Plus size={13} />
          </button>
        </span>
      </div>
    );
  };

  const totalVisible = filtered.length;
  const currentOnCanvas = nodes.length;

  return (
    <aside className={`node-library ${leftOpen ? 'is-open' : ''}`} aria-label="节点资源面板">
      <header className="node-library__header">
        <div>
          <p className="eyebrow">NODE LIBRARY</p>
          <h2>节点资源</h2>
        </div>
        <button
          type="button"
          className="icon-btn icon-btn--ghost node-library__close"
          onClick={() => setUI({ leftOpen: false })}
          aria-label="关闭节点库"
        >
          <X size={17} />
        </button>
      </header>

      <div className="node-library__search">
        <Search size={14} />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="搜索节点、端口或参数…"
          spellCheck={false}
          aria-label="搜索节点"
        />
        {query ? (
          <button type="button" onClick={() => setQuery('')} aria-label="清除搜索">
            <X size={13} />
          </button>
        ) : (
          <kbd>/</kbd>
        )}
      </div>

      <div className="segmented node-library__tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'all'}
          className={tab === 'all' ? 'is-active' : ''}
          onClick={() => setTab('all')}
        >
          全部
          <span>{filtered.length}</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'favorites'}
          className={tab === 'favorites' ? 'is-active' : ''}
          onClick={() => setTab('favorites')}
        >
          收藏
          <span>{favoriteNodes.length}</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'recent'}
          className={tab === 'recent' ? 'is-active' : ''}
          onClick={() => setTab('recent')}
        >
          最近
          <span>{recentNodes.length}</span>
        </button>
      </div>

      <div className="node-library__scroll">
        {tab === 'all' ? (
          query ? (
            <section className="library-flat">
              <div className="library-section-title">
                <span>搜索结果</span>
                <em>{totalVisible}</em>
              </div>
              {filtered.length ? (
                filtered.map((definition) => renderCard(definition))
              ) : (
                <div className="library-empty">
                  <Search size={22} />
                  <strong>没有匹配的节点</strong>
                  <p>试试「图像」「Agnes」「文本」等关键词。</p>
                </div>
              )}
            </section>
          ) : (
            <>
              {recentDefinitions.length ? (
                <section className="library-recent-strip">
                  <div className="library-section-title">
                    <span>最近使用</span>
                    <em>{recentDefinitions.length}</em>
                  </div>
                  <div className="recent-chips">
                    {recentDefinitions.slice(0, 4).map((definition) => (
                      <button
                        key={definition.type}
                        type="button"
                        className="recent-chip"
                        onClick={() => handleAdd(definition)}
                        title={definition.title}
                      >
                        <span style={{ color: definition.accent }}>
                          <NodeIcon name={definition.icon} size={13} />
                        </span>
                        {definition.title}
                      </button>
                    ))}
                  </div>
                </section>
              ) : null}

              {NODE_CATEGORIES.map((category) => {
                const definitions = filtered.filter(
                  (definition) => definition.category === category.id,
                );
                if (!definitions.length) return null;
                const CategoryIcon = CATEGORY_ICONS[category.id];
                const isCollapsed = collapsed.has(category.id);
                return (
                  <section key={category.id} className="library-category">
                    <button
                      type="button"
                      className="library-category__header"
                      onClick={() => toggleCategory(category.id)}
                      aria-expanded={!isCollapsed}
                    >
                      <span className="library-category__chevron">
                        {isCollapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
                      </span>
                      <CategoryIcon size={13} />
                      <span>{category.label}</span>
                      <em>{definitions.length}</em>
                    </button>
                    {!isCollapsed ? (
                      <div className="library-category__body">
                        {definitions.map((definition) => renderCard(definition))}
                      </div>
                    ) : null}
                  </section>
                );
              })}
            </>
          )
        ) : tab === 'favorites' ? (
          <section className="library-flat">
            <div className="library-section-title">
              <span>收藏节点</span>
              <em>{favoriteDefinitions.length}</em>
            </div>
            {favoriteDefinitions.length ? (
              favoriteDefinitions.map((definition) => renderCard(definition))
            ) : (
              <div className="library-empty">
                <Star size={22} />
                <strong>还没有收藏节点</strong>
                <p>悬停节点卡片，点击星标即可固定常用节点。</p>
              </div>
            )}
          </section>
        ) : (
          <section className="library-flat">
            <div className="library-section-title">
              <span>最近使用</span>
              <em>{recentDefinitions.length}</em>
            </div>
            {recentDefinitions.length ? (
              recentDefinitions.map((definition) => renderCard(definition))
            ) : (
              <div className="library-empty">
                <Sparkles size={22} />
                <strong>暂无使用记录</strong>
                <p>添加或拖拽节点后，这里会保留最近记录。</p>
              </div>
            )}
          </section>
        )}

        <footer className="node-library__footer">
          <span>
            <i />
            {currentOnCanvas} 个节点在画布
          </span>
          <span>{totalVisible} 个可用</span>
        </footer>
      </div>
    </aside>
  );
}
