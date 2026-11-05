import { memo } from 'react';
import { EdgeLabelRenderer, getBezierPath, type EdgeProps } from '@xyflow/react';
import { Trash2 } from 'lucide-react';
import type { StudioEdge } from '../types/studio';
import { PORT_TYPES } from '../types/studio';
import { useStudioStore } from '../store/studioStore';

function StudioEdgeComponent({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  selected,
}: EdgeProps<StudioEdge>) {
  const deleteEdge = useStudioStore((state) => state.deleteEdge);
  const isRunning = useStudioStore((state) => {
    const edge = state.edges.find((candidate) => candidate.id === id);
    if (!edge) return false;
    const source = state.nodes.find((node) => node.id === edge.source);
    const target = state.nodes.find((node) => node.id === edge.target);
    return source?.data.status === 'running' || target?.data.status === 'running';
  });
  const dataType = data?.dataType ?? 'ANY';
  const color = PORT_TYPES[dataType].color;
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    curvature: 0.28,
  });
  const markerId = `edge-arrow-${id}`;

  return (
    <>
      <defs>
        <marker
          id={markerId}
          viewBox="0 0 10 10"
          refX="8"
          refY="5"
          markerWidth="7"
          markerHeight="7"
          orient="auto-start-reverse"
        >
          <path d="M 0 1 L 9 5 L 0 9 z" fill={color} />
        </marker>
      </defs>
      <path
        d={edgePath}
        fill="none"
        stroke="transparent"
        strokeWidth={16}
        className="studio-edge__hit"
      />
      {selected ? (
        <path
          d={edgePath}
          fill="none"
          stroke={color}
          strokeWidth={6}
          opacity={0.16}
          strokeLinecap="round"
        />
      ) : null}
      <path
        d={edgePath}
        fill="none"
        stroke={color}
        strokeWidth={selected ? 2.2 : 1.6}
        strokeLinecap="round"
        markerEnd={`url(#${markerId})`}
        className={`studio-edge__path ${isRunning ? 'is-running' : ''} ${selected ? 'is-selected' : ''}`}
        style={{ opacity: selected ? 1 : 0.78 }}
      />
      {selected ? (
        <EdgeLabelRenderer>
          <div
            className="edge-label"
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              borderColor: `${color}55`,
            }}
            onPointerDown={(event) => event.stopPropagation()}
          >
            <span style={{ background: color }} className="edge-label__dot" />
            <span>{PORT_TYPES[dataType].label}</span>
            <button
              type="button"
              className="edge-label__delete"
              onClick={(event) => {
                event.stopPropagation();
                deleteEdge(id);
              }}
              aria-label="删除连接"
              title="删除连接"
            >
              <Trash2 size={11} />
            </button>
          </div>
        </EdgeLabelRenderer>
      ) : null}
    </>
  );
}

export const StudioEdgeView = memo(StudioEdgeComponent);
