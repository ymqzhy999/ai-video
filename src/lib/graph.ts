import type { Viewport } from '@xyflow/react';
import type {
  SerializedEdge,
  SerializedNode,
  StudioEdge,
  StudioNode,
  StudioNodeData,
  WorkflowFile,
  WorkflowRecord,
} from '../types/studio';
import { getNodeDefinition, GROUP_DEFINITION, typesCompatible } from './nodeRegistry';
import { deepClone, uid } from './id';

export const NODE_WIDTH = 236;
export const NODE_HEIGHT = 144;

export function createNode(
  defType: string,
  position: { x: number; y: number },
  overrides: Partial<StudioNodeData> = {},
): StudioNode {
  const definition = defType === 'group' ? GROUP_DEFINITION : getNodeDefinition(defType);
  const params = deepClone(definition.defaults);
  const data: StudioNodeData = {
    defType,
    label: definition.title,
    params,
    status: 'idle',
    ...overrides,
  };
  return {
    id: uid('node'),
    type: 'studio',
    position,
    data,
    ...(definition.width ? { width: definition.width } : {}),
  };
}

export function createGroupNode(
  bounds: { x: number; y: number; width: number; height: number },
  label = '分组',
): StudioNode {
  return {
    id: uid('group'),
    type: 'studio',
    position: { x: bounds.x, y: bounds.y },
    data: {
      defType: 'group',
      label,
      params: { text: '', color: '#8b7dff' },
      status: 'idle',
    },
    style: {
      width: Math.max(260, Math.round(bounds.width)),
      height: Math.max(180, Math.round(bounds.height)),
    },
    zIndex: -1,
    selectable: true,
    draggable: true,
    connectable: false,
  };
}

export function nodeSize(node: StudioNode): { width: number; height: number } {
  const styleWidth = typeof node.style?.width === 'number' ? node.style.width : undefined;
  const styleHeight = typeof node.style?.height === 'number' ? node.style.height : undefined;
  return {
    width: node.measured?.width ?? node.width ?? styleWidth ?? getNodeDefinition(node.data.defType).width ?? NODE_WIDTH,
    height: node.measured?.height ?? node.height ?? styleHeight ?? NODE_HEIGHT,
  };
}

export function absolutePosition(
  node: StudioNode,
  allNodes: StudioNode[],
): { x: number; y: number } {
  if (!node.parentId) return { ...node.position };
  const parent = allNodes.find((candidate) => candidate.id === node.parentId);
  if (!parent) return { ...node.position };
  const parentPosition = absolutePosition(parent, allNodes);
  return {
    x: parentPosition.x + node.position.x,
    y: parentPosition.y + node.position.y,
  };
}

export function getSelectionBounds(nodes: StudioNode[], ids: string[]) {
  const selected = nodes.filter((node) => ids.includes(node.id));
  if (!selected.length) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  selected.forEach((node) => {
    const position = absolutePosition(node, nodes);
    const size = nodeSize(node);
    minX = Math.min(minX, position.x);
    minY = Math.min(minY, position.y);
    maxX = Math.max(maxX, position.x + size.width);
    maxY = Math.max(maxY, position.y + size.height);
  });
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

export type AlignMode =
  | 'left'
  | 'centerX'
  | 'right'
  | 'top'
  | 'centerY'
  | 'bottom'
  | 'distributeX'
  | 'distributeY';

export function alignNodes(
  nodes: StudioNode[],
  selectedIds: string[],
  mode: AlignMode,
): StudioNode[] {
  if (selectedIds.length < 2) return nodes;
  const selected = nodes.filter((node) => selectedIds.includes(node.id));
  const bounds = getSelectionBounds(nodes, selectedIds);
  if (!bounds) return nodes;

  const sorted = [...selected].sort((a, b) => {
    const posA = absolutePosition(a, nodes);
    const posB = absolutePosition(b, nodes);
    return mode === 'distributeX' ? posA.x - posB.x : posA.y - posB.y;
  });

  const updates = new Map<string, { x: number; y: number }>();

  if (mode === 'distributeX' || mode === 'distributeY') {
    const isHorizontal = mode === 'distributeX';
    const totalSize = sorted.reduce(
      (sum, node) => sum + (isHorizontal ? nodeSize(node).width : nodeSize(node).height),
      0,
    );
    const available = isHorizontal ? bounds.width : bounds.height;
    const gap = (available - totalSize) / Math.max(1, sorted.length - 1);
    let cursor = isHorizontal ? bounds.x : bounds.y;
    sorted.forEach((node, index) => {
      const absolute = absolutePosition(node, nodes);
      const next = isHorizontal ? { x: cursor, y: absolute.y } : { x: absolute.x, y: cursor };
      updates.set(node.id, next);
      cursor += (isHorizontal ? nodeSize(node).width : nodeSize(node).height) + (index === sorted.length - 1 ? 0 : gap);
    });
  } else {
    selected.forEach((node) => {
      const absolute = absolutePosition(node, nodes);
      const size = nodeSize(node);
      let nextX = absolute.x;
      let nextY = absolute.y;
      if (mode === 'left') nextX = bounds.x;
      if (mode === 'centerX') nextX = bounds.x + bounds.width / 2 - size.width / 2;
      if (mode === 'right') nextX = bounds.x + bounds.width - size.width;
      if (mode === 'top') nextY = bounds.y;
      if (mode === 'centerY') nextY = bounds.y + bounds.height / 2 - size.height / 2;
      if (mode === 'bottom') nextY = bounds.y + bounds.height - size.height;
      updates.set(node.id, { x: nextX, y: nextY });
    });
  }

  return nodes.map((node) => {
    const next = updates.get(node.id);
    if (!next) return node;
    const parent = node.parentId ? nodes.find((candidate) => candidate.id === node.parentId) : null;
    const parentAbsolute = parent ? absolutePosition(parent, nodes) : { x: 0, y: 0 };
    return {
      ...node,
      position: {
        x: Math.round(next.x - parentAbsolute.x),
        y: Math.round(next.y - parentAbsolute.y),
      },
    };
  });
}

export function topologicalOrder(
  nodes: StudioNode[],
  edges: StudioEdge[],
): { order: string[]; cycleNodeIds: string[] } {
  const ids = new Set(nodes.map((node) => node.id));
  const incoming = new Map<string, number>();
  const outgoing = new Map<string, string[]>();
  nodes.forEach((node) => {
    incoming.set(node.id, 0);
    outgoing.set(node.id, []);
  });
  edges.forEach((edge) => {
    if (!ids.has(edge.source) || !ids.has(edge.target)) return;
    incoming.set(edge.target, (incoming.get(edge.target) ?? 0) + 1);
    outgoing.get(edge.source)?.push(edge.target);
  });

  const queue = nodes
    .filter((node) => (incoming.get(node.id) ?? 0) === 0)
    .map((node) => node.id)
    .sort();
  const order: string[] = [];
  while (queue.length) {
    const current = queue.shift() as string;
    order.push(current);
    (outgoing.get(current) ?? []).forEach((target) => {
      const next = (incoming.get(target) ?? 1) - 1;
      incoming.set(target, next);
      if (next === 0) queue.push(target);
    });
  }
  const cycleNodeIds = nodes
    .filter((node) => !order.includes(node.id))
    .map((node) => node.id);
  return { order, cycleNodeIds };
}

export function autoArrange(
  nodes: StudioNode[],
  edges: StudioEdge[],
): { nodes: StudioNode[]; groupsRemoved: number } {
  const groups = nodes.filter((node) => node.data.defType === 'group');
  const detached = nodes
    .filter((node) => node.data.defType !== 'group')
    .map((node) => {
      if (!node.parentId) return node;
      const absolute = absolutePosition(node, nodes);
      return {
        ...node,
        parentId: undefined,
        extent: undefined,
        position: absolute,
      } as StudioNode;
    });

  const executable = detached.filter((node) => node.data.defType !== 'note');
  const notes = detached.filter((node) => node.data.defType === 'note');
  const { order, cycleNodeIds } = topologicalOrder(executable, edges);
  const rank = new Map<string, number>();
  order.forEach((nodeId) => {
    const incoming = edges.filter((edge) => edge.target === nodeId && order.includes(edge.source));
    const nextRank = incoming.length
      ? Math.max(...incoming.map((edge) => (rank.get(edge.source) ?? 0) + 1))
      : 0;
    rank.set(nodeId, nextRank);
  });
  cycleNodeIds.forEach((nodeId) => {
    const maxRank = Math.max(0, ...Array.from(rank.values()));
    rank.set(nodeId, maxRank + 1);
  });

  const columns = new Map<number, StudioNode[]>();
  executable.forEach((node) => {
    const column = rank.get(node.id) ?? 0;
    if (!columns.has(column)) columns.set(column, []);
    columns.get(column)?.push(node);
  });

  const positioned: StudioNode[] = [];
  const columnGap = 312;
  Array.from(columns.keys())
    .sort((a, b) => a - b)
    .forEach((column) => {
      const items = columns.get(column) ?? [];
      const heights = items.map((node) => nodeSize(node).height);
      const totalHeight = heights.reduce((sum, value) => sum + value, 0) + (items.length - 1) * 54;
      let cursor = -totalHeight / 2;
      items
        .sort((a, b) => a.position.y - b.position.y)
        .forEach((node) => {
          positioned.push({
            ...node,
            position: { x: column * columnGap, y: Math.round(cursor) },
          });
          cursor += nodeSize(node).height + 54;
        });
    });

  const maxY = positioned.reduce(
    (value, node) => Math.max(value, node.position.y + nodeSize(node).height),
    0,
  );
  notes.forEach((node, index) => {
    positioned.push({
      ...node,
      position: { x: index * 260, y: maxY + 72 },
    });
  });

  return { nodes: positioned, groupsRemoved: groups.length };
}

export function serializeNodes(nodes: StudioNode[]): SerializedNode[] {
  return nodes.map((node) => ({
    id: node.id,
    type: 'studio',
    position: { x: Math.round(node.position.x), y: Math.round(node.position.y) },
    data: {
      defType: node.data.defType,
      label: node.data.label,
      params: deepClone(node.data.params),
      ...(node.data.note ? { note: node.data.note } : {}),
      ...(node.data.collapsed ? { collapsed: true } : {}),
    },
    ...(node.parentId ? { parentId: node.parentId, extent: 'parent' as const } : {}),
    ...(node.style
      ? {
          style: Object.fromEntries(
            Object.entries(node.style).filter(([, value]) => typeof value === 'string' || typeof value === 'number'),
          ) as Record<string, string | number>,
        }
      : {}),
    ...(node.width ? { width: node.width } : {}),
    ...(node.height ? { height: node.height } : {}),
    ...(node.zIndex !== undefined ? { zIndex: node.zIndex } : {}),
  }));
}

export function serializeEdges(edges: StudioEdge[]): SerializedEdge[] {
  return edges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    sourceHandle: edge.sourceHandle ?? null,
    targetHandle: edge.targetHandle ?? null,
    type: 'studioEdge',
    data: {
      dataType: edge.data?.dataType ?? 'ANY',
      sourcePort: edge.data?.sourcePort ?? edge.sourceHandle ?? '',
      targetPort: edge.data?.targetPort ?? edge.targetHandle ?? '',
    },
  }));
}

export function buildWorkflowFile(
  workflow: WorkflowRecord,
  nodes: StudioNode[],
  edges: StudioEdge[],
  viewport?: Viewport,
): WorkflowFile {
  return {
    schemaVersion: 1,
    app: 'comfyui-workflow-studio',
    version: '1.0.0',
    id: workflow.id,
    name: workflow.name,
    description: workflow.description,
    category: workflow.category,
    tags: workflow.tags,
    createdAt: workflow.createdAt,
    updatedAt: Date.now(),
    nodes: serializeNodes(nodes),
    edges: serializeEdges(edges),
    viewport,
  };
}

export function normalizeNode(raw: unknown, index: number): StudioNode | null {
  if (!raw || typeof raw !== 'object') return null;
  const candidate = raw as Partial<SerializedNode> & {
    data?: Partial<StudioNodeData>;
  };
  const defType = String(candidate.data?.defType ?? 'text-input');
  const definition = defType === 'group' ? GROUP_DEFINITION : getNodeDefinition(defType);
  const position = candidate.position;
  if (!position || typeof position.x !== 'number' || typeof position.y !== 'number') return null;
  const rawParams =
    candidate.data?.params && typeof candidate.data.params === 'object'
      ? deepClone(candidate.data.params)
      : {};
  const params = {
    ...deepClone(definition.defaults),
    ...rawParams,
  };
  // Migrate the old portrait Snap size (768×1024) to the requested export
  // size. The API still receives a near-2:3 request and the result is resized
  // locally by the execution engine.
  if (
    defType === 'agnes-image' &&
    Number(params.width) === 768 &&
    Number(params.height) === 1024
  ) {
    params.width = 1024;
    params.height = 1536;
  }
  if (defType === 'agnes-image' && !Object.prototype.hasOwnProperty.call(rawParams, 'sizePreset')) {
    const presetKey = `${params.width}x${params.height}`;
    params.sizePreset = ['1024x1536', '1024x768', '1536x1024', '1024x1024'].includes(presetKey)
      ? presetKey
      : 'custom';
  }
  return {
    id: String(candidate.id ?? uid(`node${index}`)),
    type: 'studio',
    position: { x: position.x, y: position.y },
    data: {
      defType,
      label: String(candidate.data?.label ?? definition.title),
      params,
      status: 'idle',
      note: typeof candidate.data?.note === 'string' ? candidate.data.note : undefined,
      collapsed: Boolean(candidate.data?.collapsed),
    },
    ...(candidate.parentId ? { parentId: String(candidate.parentId), extent: 'parent' as const } : {}),
    ...(candidate.style && typeof candidate.style === 'object'
      ? { style: candidate.style }
      : {}),
    ...(candidate.width ? { width: candidate.width } : {}),
    ...(candidate.height ? { height: candidate.height } : {}),
    ...(candidate.zIndex !== undefined ? { zIndex: candidate.zIndex } : {}),
    ...(candidate.style && typeof candidate.style.width === 'number'
      ? { width: candidate.style.width }
      : {}),
  };
}

export function normalizeEdge(raw: unknown, nodes: StudioNode[]): StudioEdge | null {
  if (!raw || typeof raw !== 'object') return null;
  const candidate = raw as Partial<SerializedEdge> & {
    data?: { dataType?: string; sourcePort?: string; targetPort?: string };
  };
  const source = String(candidate.source ?? '');
  const target = String(candidate.target ?? '');
  if (!nodes.some((node) => node.id === source) || !nodes.some((node) => node.id === target)) {
    return null;
  }
  if (source === target) return null;
  const sourceNode = nodes.find((node) => node.id === source);
  const targetNode = nodes.find((node) => node.id === target);
  if (!sourceNode || !targetNode) return null;
  const sourceDefinition = getNodeDefinition(sourceNode.data.defType);
  const targetDefinition = getNodeDefinition(targetNode.data.defType);
  const sourcePortId = candidate.sourceHandle ?? candidate.data?.sourcePort;
  const targetPortId = candidate.targetHandle ?? candidate.data?.targetPort;
  const sourcePort = sourceDefinition.outputs.find((port) => port.id === sourcePortId);
  const targetPort = targetDefinition.inputs.find((port) => port.id === targetPortId);
  if (!sourcePort || !targetPort || !typesCompatible(sourcePort.type, targetPort.type)) return null;
  return {
    id: String(candidate.id ?? uid('edge')),
    source,
    target,
    sourceHandle: sourcePort.id,
    targetHandle: targetPort.id,
    type: 'studioEdge',
    data: {
      dataType: sourcePort.type,
      sourcePort: sourcePort.id,
      targetPort: targetPort.id,
    },
  };
}

export function removeGroupNodes(nodes: StudioNode[], groupIds: string[]): StudioNode[] {
  const groups = new Set(groupIds);
  return nodes
    .filter((node) => !groups.has(node.id))
    .map((node) => {
      if (!node.parentId || !groups.has(node.parentId)) return node;
      return {
        ...node,
        parentId: undefined,
        extent: undefined,
        position: absolutePosition(node, nodes),
      };
    });
}

export function dedupeEdges(edges: StudioEdge[]): StudioEdge[] {
  const seen = new Set<string>();
  return edges.filter((edge) => {
    const key = `${edge.target}:${edge.targetHandle}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function getDownstreamNodeIds(
  startId: string,
  edges: StudioEdge[],
): Set<string> {
  const result = new Set<string>([startId]);
  const queue = [startId];
  while (queue.length) {
    const current = queue.shift() as string;
    edges
      .filter((edge) => edge.source === current)
      .forEach((edge) => {
        if (!result.has(edge.target)) {
          result.add(edge.target);
          queue.push(edge.target);
        }
      });
  }
  return result;
}

export function getAncestorNodeIds(startId: string, edges: StudioEdge[]): Set<string> {
  const result = new Set<string>();
  const queue = [startId];
  while (queue.length) {
    const current = queue.shift() as string;
    edges
      .filter((edge) => edge.target === current)
      .forEach((edge) => {
        if (!result.has(edge.source)) {
          result.add(edge.source);
          queue.push(edge.source);
        }
      });
  }
  return result;
}
