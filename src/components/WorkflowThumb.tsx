import type { StudioEdge, StudioNode } from '../types/studio';
import { getNodeDefinition } from '../lib/nodeRegistry';

interface WorkflowThumbProps {
  nodes: StudioNode[];
  edges: StudioEdge[];
  className?: string;
}

export function WorkflowThumb({ nodes, edges, className = '' }: WorkflowThumbProps) {
  if (!nodes.length) {
    return (
      <div className={`workflow-thumb workflow-thumb--empty ${className}`}>
        <span />
        <span />
        <span />
      </div>
    );
  }
  const items = nodes.filter((node) => node.data.defType !== 'note');
  const xs = items.map((node) => node.position.x);
  const ys = items.map((node) => node.position.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const maxX = Math.max(...xs) + 220;
  const maxY = Math.max(...ys) + 130;
  const width = Math.max(1, maxX - minX);
  const height = Math.max(1, maxY - minY);
  const nodeMap = new Map(items.map((node) => [node.id, node]));

  return (
    <svg
      className={`workflow-thumb ${className}`}
      viewBox={`${minX - 16} ${minY - 16} ${width + 32} ${height + 32}`}
      preserveAspectRatio="xMidYMid meet"
      aria-hidden="true"
    >
      {edges.map((edge) => {
        const source = nodeMap.get(edge.source);
        const target = nodeMap.get(edge.target);
        if (!source || !target) return null;
        return (
          <path
            key={edge.id}
            d={`M ${source.position.x + 200} ${source.position.y + 45} C ${
              (source.position.x + target.position.x) / 2 + 100
            } ${source.position.y + 45}, ${
              (source.position.x + target.position.x) / 2 + 100
            } ${target.position.y + 45}, ${target.position.x} ${target.position.y + 45}`}
            fill="none"
            stroke="#3a4150"
            strokeWidth={2}
          />
        );
      })}
      {items.map((node) => {
        const definition = getNodeDefinition(node.data.defType);
        const isOutput = definition.category === 'output';
        const isGenerator = definition.category === 'generation';
        return (
          <g key={node.id}>
            <rect
              x={node.position.x}
              y={node.position.y}
              width={isOutput || isGenerator ? 190 : 168}
              height={isOutput || isGenerator ? 92 : 74}
              rx={10}
              fill={isGenerator ? '#19182a' : '#14171d'}
              stroke={isGenerator ? '#4b4178' : '#262b35'}
              strokeWidth={1.6}
            />
            <rect
              x={node.position.x + 14}
              y={node.position.y + 14}
              width={14}
              height={14}
              rx={4}
              fill={`${definition.accent}33`}
            />
            <rect
              x={node.position.x + 36}
              y={node.position.y + 18}
              width={82}
              height={7}
              rx={3.5}
              fill="#454d5d"
            />
            <rect
              x={node.position.x + 14}
              y={node.position.y + 44}
              width={isOutput || isGenerator ? 158 : 132}
              height={isOutput || isGenerator ? 32 : 14}
              rx={6}
              fill={isGenerator ? '#272141' : '#1b1f27'}
            />
          </g>
        );
      })}
    </svg>
  );
}
