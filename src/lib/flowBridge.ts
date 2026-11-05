import type { ReactFlowInstance } from '@xyflow/react';
import type { StudioEdge, StudioNode } from '../types/studio';

let instance: ReactFlowInstance<StudioNode, StudioEdge> | null = null;

export function setFlowInstance(next: ReactFlowInstance<StudioNode, StudioEdge> | null): void {
  instance = next;
}

export function getFlowInstance(): ReactFlowInstance<StudioNode, StudioEdge> | null {
  return instance;
}

export function fitCanvasView(duration = 420): void {
  void instance?.fitView({ padding: 0.18, duration, maxZoom: 1.05 });
}

export function zoomCanvas(direction: 'in' | 'out'): void {
  if (!instance) return;
  if (direction === 'in') {
    void instance.zoomIn({ duration: 180 });
  } else {
    void instance.zoomOut({ duration: 180 });
  }
}

export function resetCanvasZoom(): void {
  void instance?.zoomTo(1, { duration: 220 });
}

export function focusCanvasNode(nodeId: string): void {
  if (!instance) return;
  const node = instance.getNode(nodeId);
  if (!node) return;
  const width = node.measured?.width ?? 240;
  const height = node.measured?.height ?? 150;
  void instance.setCenter(
    node.position.x + width / 2,
    node.position.y + height / 2,
    { zoom: Math.max(0.7, Math.min(1.15, instance.getZoom())), duration: 480 },
  );
}

export function screenCenterToFlow(): { x: number; y: number } {
  if (!instance) return { x: 260, y: 220 };
  const bounds = document.querySelector('.canvas-stage')?.getBoundingClientRect();
  const x = bounds ? bounds.left + bounds.width / 2 : window.innerWidth / 2;
  const y = bounds ? bounds.top + bounds.height / 2 : window.innerHeight / 2;
  return instance.screenToFlowPosition({ x, y });
}

export function currentZoom(): number {
  return instance?.getZoom() ?? 1;
}
