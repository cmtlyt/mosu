import { useMemo } from 'react';
import type { HistoryTreeSnapshot } from '@cmtlyt/lingshu-toolkit/shared/history-tree';
import styles from './index.module.css';

interface BranchSvgProps<T> {
  snapshot: HistoryTreeSnapshot<T>;
  selectedNodeId: string | null;
  onNodeClick?: (nodeId: string) => void;
  onNodeDoubleClick: (nodeId: string) => void;
}

interface LayoutNode {
  id: string;
  x: number;
  y: number;
  label: string;
  isActive: boolean;
  isSelected: boolean;
}

interface LayoutEdge {
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
}

const NODE_RADIUS = 16;
const LEVEL_HEIGHT = 60;
const SIBLING_GAP = 80;

function computeLevelCounts<T>(snapshot: HistoryTreeSnapshot<T>): Map<number, number> {
  const levelCounts = new Map<number, number>();
  if (!snapshot.rootId) {
    return levelCounts;
  }

  const queue: { id: string; depth: number }[] = [{ id: snapshot.rootId, depth: 0 }];
  while (queue.length > 0) {
    const { id, depth } = queue.shift()!;
    levelCounts.set(depth, (levelCounts.get(depth) ?? 0) + 1);
    const nodeInfo = snapshot.nodes[id];
    if (!nodeInfo) {
      continue;
    }
    for (const childId of nodeInfo.childrenIds ?? []) {
      queue.push({ id: childId, depth: depth + 1 });
    }
  }
  return levelCounts;
}

function computeNodeLayouts<T>(
  snapshot: HistoryTreeSnapshot<T>,
  selectedNodeId: string | null,
  levelCounts: Map<number, number>,
): { nodes: LayoutNode[]; positions: Map<string, { x: number; y: number }> } {
  const nodes: LayoutNode[] = [];
  const positions = new Map<string, { x: number; y: number }>();
  if (!snapshot.rootId) {
    return { nodes, positions };
  }

  const queue: { id: string; depth: number }[] = [{ id: snapshot.rootId, depth: 0 }];
  const levelIndices = new Map<number, number>();

  while (queue.length > 0) {
    const { id, depth } = queue.shift()!;
    const nodeInfo = snapshot.nodes[id];
    if (!nodeInfo) {
      continue;
    }

    const countAtLevel = levelCounts.get(depth) ?? 1;
    const indexAtLevel = levelIndices.get(depth) ?? 0;
    levelIndices.set(depth, indexAtLevel + 1);

    const totalWidth = (countAtLevel - 1) * SIBLING_GAP;
    const x = -totalWidth / 2 + indexAtLevel * SIBLING_GAP + 200;
    const y = depth * LEVEL_HEIGHT + 40;

    positions.set(id, { x, y });
    nodes.push({
      id,
      x,
      y,
      label: (nodeInfo.data as { label?: string })?.label ?? 'Unknown',
      isActive: id === snapshot.currentId,
      isSelected: id === selectedNodeId,
    });

    for (const childId of nodeInfo.childrenIds ?? []) {
      queue.push({ id: childId, depth: depth + 1 });
    }
  }
  return { nodes, positions };
}

function computeEdges<T>(
  snapshot: HistoryTreeSnapshot<T>,
  positions: Map<string, { x: number; y: number }>,
): LayoutEdge[] {
  const edges: LayoutEdge[] = [];
  for (const [id, pos] of positions) {
    const nodeInfo = snapshot.nodes[id];
    if (!nodeInfo) {
      continue;
    }
    for (const childId of nodeInfo.childrenIds ?? []) {
      const childPos = positions.get(childId);
      if (childPos) {
        edges.push({ fromX: pos.x, fromY: pos.y, toX: childPos.x, toY: childPos.y });
      }
    }
  }
  return edges;
}

function layoutTree<T>(
  snapshot: HistoryTreeSnapshot<T>,
  selectedNodeId: string | null,
): { nodes: LayoutNode[]; edges: LayoutEdge[] } {
  if (!snapshot.rootId || !snapshot.nodes[snapshot.rootId]) {
    return { nodes: [], edges: [] };
  }

  const levelCounts = computeLevelCounts(snapshot);
  const { nodes, positions } = computeNodeLayouts(snapshot, selectedNodeId, levelCounts);
  const edges = computeEdges(snapshot, positions);

  return { nodes, edges };
}

export function BranchSvg<T>({ snapshot, selectedNodeId, onNodeClick, onNodeDoubleClick }: BranchSvgProps<T>) {
  const { nodes, edges } = useMemo(() => layoutTree(snapshot, selectedNodeId), [snapshot, selectedNodeId]);

  const svgHeight = Math.max(300, (nodes.length > 0 ? Math.max(...nodes.map((n) => n.y)) : 0) + 80);

  return (
    <svg className={styles.branchSvg} width="100%" height={svgHeight} viewBox={`0 0 400 ${svgHeight}`}>
      {edges.map((edge) => (
        <path
          key={`edge-${edge.fromX}-${edge.fromY}-${edge.toX}-${edge.toY}`}
          d={`M ${edge.fromX} ${edge.fromY} C ${edge.fromX} ${(edge.fromY + edge.toY) / 2}, ${edge.toX} ${(edge.fromY + edge.toY) / 2}, ${edge.toX} ${edge.toY}`}
          fill="none"
          stroke="#94a3b8"
          strokeWidth="2"
        />
      ))}
      {nodes.map((node) => (
        <g
          key={node.id}
          className={styles.branchNode}
          onClick={() => onNodeClick?.(node.id)}
          onDoubleClick={() => onNodeDoubleClick(node.id)}
        >
          <circle
            cx={node.x}
            cy={node.y}
            r={NODE_RADIUS}
            fill={node.isActive ? '#4f86f7' : node.isSelected ? '#fcc419' : '#e2e8f0'}
            stroke={node.isActive ? '#2563eb' : node.isSelected ? '#d97706' : '#94a3b8'}
            strokeWidth="2"
          />
          <text x={node.x} y={node.y + NODE_RADIUS + 16} textAnchor="middle" fontSize="11" fill="#475569">
            {node.label.length > 10 ? `${node.label.slice(0, 10)}…` : node.label}
          </text>
        </g>
      ))}
    </svg>
  );
}
