import React, { useState, useCallback, useEffect } from 'react';
import type { Shape, Layer } from '../models';
import { ObjectsPanel } from './ObjectsPanel';
import { LayersPanel } from './LayersPanel';
import { tokens } from '../styles';

const MIN_PANEL_WIDTH = 340;
const DEFAULT_PANEL_WIDTH = 340;

interface SidePanelProps {
  // Common
  shapes: Shape[];

  // Objects panel props
  onToggleVisibility: (shapeId: string) => void;
  onSelectShape: (shapeId: string) => void;
  onDeleteShape: (shapeId: string) => void;
  onChangeColor: (shapeId: string, color: string) => void;

  // Layers panel props
  layers: Layer[];
  selectedShapeIds: string[];
  onLayerCreate: (layer: Layer) => void;
  onLayerUpdate: (layerId: string, updates: Partial<Layer>) => void;
  onLayerDelete: (layerId: string) => void;
  onAssignShapesToLayer: (shapeIds: string[], layerId: string) => void;
  onRemoveShapesFromLayer: (shapeIds: string[]) => void;
  onSelectShapes: (shapeIds: string[]) => void;
  onToggleLayerVisibility: (layerId: string) => void;
}

type TabId = 'objects' | 'layers';

const LayersIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="12,2 2,7 12,12 22,7" />
    <polyline points="2,17 12,22 22,17" />
    <polyline points="2,12 12,17 22,12" />
  </svg>
);

const ObjectsIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="7" height="7" />
    <rect x="14" y="3" width="7" height="7" />
    <rect x="14" y="14" width="7" height="7" />
    <rect x="3" y="14" width="7" height="7" />
  </svg>
);

export const SidePanel: React.FC<SidePanelProps> = ({
  shapes,
  onToggleVisibility,
  onSelectShape,
  onDeleteShape,
  onChangeColor,
  layers,
  selectedShapeIds,
  onLayerCreate,
  onLayerUpdate,
  onLayerDelete,
  onAssignShapesToLayer,
  onRemoveShapesFromLayer,
  onSelectShapes,
  onToggleLayerVisibility,
}) => {
  const [activeTab, setActiveTab] = useState<TabId>('objects');
  const [panelWidth, setPanelWidth] = useState(DEFAULT_PANEL_WIDTH);
  const [isResizing, setIsResizing] = useState(false);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  }, []);

  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      const maxWidth = window.innerWidth * 0.4; // 40% max
      const newWidth = window.innerWidth - e.clientX;
      setPanelWidth(Math.max(MIN_PANEL_WIDTH, Math.min(maxWidth, newWidth)));
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing]);

  return (
    <div style={{ ...styles.panel, width: panelWidth }}>
      {/* Resize handle */}
      <div
        style={{
          ...styles.resizeHandle,
          ...(isResizing ? styles.resizeHandleActive : {})
        }}
        onMouseDown={handleMouseDown}
      />
      {/* Tab bar */}
      <div style={styles.tabBar}>
        <button
          style={{
            ...styles.tab,
            ...(activeTab === 'objects' ? styles.tabActive : {})
          }}
          onClick={() => setActiveTab('objects')}
        >
          <ObjectsIcon />
          <span>Objects</span>
          <span style={styles.tabBadge}>{shapes.length}</span>
        </button>
        <button
          style={{
            ...styles.tab,
            ...(activeTab === 'layers' ? styles.tabActive : {})
          }}
          onClick={() => setActiveTab('layers')}
        >
          <LayersIcon />
          <span>Layers</span>
          <span style={styles.tabBadge}>{layers.length}</span>
        </button>
      </div>

      {/* Tab content */}
      <div style={styles.tabContent}>
        {activeTab === 'objects' && (
          <ObjectsPanel
            shapes={shapes}
            onToggleVisibility={onToggleVisibility}
            onSelectShape={onSelectShape}
            onDeleteShape={onDeleteShape}
            onChangeColor={onChangeColor}
          />
        )}
        {activeTab === 'layers' && (
          <LayersPanel
            layers={layers}
            shapes={shapes}
            selectedShapeIds={selectedShapeIds}
            onLayerCreate={onLayerCreate}
            onLayerUpdate={onLayerUpdate}
            onLayerDelete={onLayerDelete}
            onAssignShapesToLayer={onAssignShapesToLayer}
            onRemoveShapesFromLayer={onRemoveShapesFromLayer}
            onSelectShapes={onSelectShapes}
            onToggleLayerVisibility={onToggleLayerVisibility}
          />
        )}
      </div>
    </div>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  panel: {
    position: 'relative',
    height: '100%',
    backgroundColor: tokens.colors.bg.secondary,
    borderLeft: `1px solid ${tokens.colors.border.subtle}`,
    display: 'flex',
    flexDirection: 'column',
    fontFamily: tokens.typography.fontFamily.sans,
    flexShrink: 0,
  },
  resizeHandle: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: '4px',
    cursor: 'ew-resize',
    backgroundColor: 'transparent',
    transition: 'background-color 0.15s',
    zIndex: 10,
  },
  resizeHandleActive: {
    backgroundColor: tokens.colors.accent.primary,
  },
  tabBar: {
    display: 'flex',
    borderBottom: `1px solid ${tokens.colors.border.subtle}`,
    backgroundColor: tokens.colors.bg.tertiary,
  },
  tab: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: tokens.spacing.xs,
    padding: `${tokens.spacing.md} ${tokens.spacing.sm}`,
    border: 'none',
    borderBottom: '2px solid transparent',
    backgroundColor: 'transparent',
    color: tokens.colors.text.tertiary,
    fontSize: tokens.typography.fontSize.sm,
    fontWeight: tokens.typography.fontWeight.medium,
    cursor: 'pointer',
    transition: `all ${tokens.transitions.fast}`,
  },
  tabActive: {
    color: tokens.colors.text.primary,
    borderBottomColor: tokens.colors.accent.primary,
    backgroundColor: tokens.colors.bg.secondary,
  },
  tabBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: '18px',
    height: '18px',
    padding: '0 5px',
    fontSize: tokens.typography.fontSize.xs,
    backgroundColor: tokens.colors.bg.elevated,
    borderRadius: '9px',
  },
  tabContent: {
    flex: 1,
    overflow: 'hidden',
  },
};
