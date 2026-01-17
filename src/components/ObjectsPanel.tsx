import React, { memo, useState, useEffect, useRef, useCallback, useMemo } from 'react';
import type { Shape } from '../models';
import { ShapeType } from '../models';
import { tokens } from '../styles';

// Virtualization constants
const ITEM_HEIGHT = 88; // Height of each item in pixels (including margin)
const OVERSCAN = 5; // Number of items to render outside viewport

interface ObjectsPanelProps {
  shapes: Shape[];
  onToggleVisibility: (shapeId: string) => void;
  onSelectShape: (shapeId: string) => void;
  onDeleteShape: (shapeId: string) => void;
  onChangeColor: (shapeId: string, color: string) => void;
}

// Preset colors for shapes
const SHAPE_COLORS = [
  '#1d9bf0', // Blue
  '#00ba7c', // Green
  '#f4212e', // Red
  '#ffad1f', // Orange
  '#794bc4', // Purple
  '#f91880', // Pink
  '#00d4aa', // Teal
  '#ffd400', // Yellow
];

// Icon components
const ChainIcon = ({ color = 'currentColor' }: { color?: string }) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 20L8 12L12 16L16 8L20 4" />
  </svg>
);

const ContourIcon = ({ color = 'currentColor' }: { color?: string }) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="12,2 22,8.5 22,15.5 12,22 2,15.5 2,8.5" />
  </svg>
);

const EyeIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

const EyeOffIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
    <line x1="1" y1="1" x2="23" y2="23" />
  </svg>
);

const TrashIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3,6 5,6 21,6" />
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
  </svg>
);

// Memoized shape item component to prevent unnecessary re-renders
interface ShapeItemProps {
  shape: Shape;
  index: number;
  onToggleVisibility: (shapeId: string) => void;
  onSelectShape: (shapeId: string) => void;
  onDeleteShape: (shapeId: string) => void;
  onChangeColor: (shapeId: string, color: string) => void;
}

const ShapeItem = memo<ShapeItemProps>(({
  shape,
  index,
  onToggleVisibility,
  onSelectShape,
  onDeleteShape,
  onChangeColor
}) => {
  return (
    <div
      key={`${shape.id}-${shape.selected}`}
      style={{
        ...styles.item,
        ...(shape.selected ? styles.itemSelected : {}),
      }}
      onClick={() => onSelectShape(shape.id)}
    >
      <div
        style={{
          ...styles.itemIcon,
          backgroundColor: `${shape.color}20`,
        }}
      >
        {shape.type === ShapeType.CHAIN
          ? <ChainIcon color={shape.color} />
          : <ContourIcon color={shape.color} />
        }
      </div>

      <div style={styles.itemInfo}>
        <div style={styles.itemName}>
          {shape.type === ShapeType.CHAIN ? 'Chain' : 'Contour'} {index + 1}
        </div>
        <div style={styles.itemDetails}>
          {shape.points.length} points
        </div>

        {/* Color picker */}
        <div style={styles.colorPicker}>
          {SHAPE_COLORS.map(color => (
            <button
              key={color}
              style={{
                ...styles.colorButton,
                backgroundColor: color,
                ...(shape.color === color ? styles.colorButtonActive : {}),
                ...(shape.layerId ? styles.colorButtonDisabled : {}),
              }}
              onClick={(e) => {
                e.stopPropagation();
                if (!shape.layerId) {
                  onChangeColor(shape.id, color);
                }
              }}
              title={shape.layerId ? 'Remove from layer to change color' : 'Change color'}
              disabled={!!shape.layerId}
            />
          ))}
        </div>
      </div>

      <div style={styles.itemActions}>
        <button
          className={`action-btn ${shape.visible ? '' : 'muted'}`}
          onClick={(e) => {
            e.stopPropagation();
            onToggleVisibility(shape.id);
          }}
          title={shape.visible ? 'Hide' : 'Show'}
        >
          {shape.visible ? <EyeIcon /> : <EyeOffIcon />}
        </button>

        <button
          className="action-btn danger"
          onClick={(e) => {
            e.stopPropagation();
            onDeleteShape(shape.id);
          }}
          title="Delete"
        >
          <TrashIcon />
        </button>
      </div>
    </div>
  );
}, (prevProps, nextProps) => {
  // Custom comparison: only re-render if these specific properties changed
  return (
    prevProps.shape.id === nextProps.shape.id &&
    prevProps.shape.selected === nextProps.shape.selected &&
    prevProps.shape.visible === nextProps.shape.visible &&
    prevProps.shape.color === nextProps.shape.color &&
    prevProps.shape.layerId === nextProps.shape.layerId &&
    prevProps.shape.points.length === nextProps.shape.points.length &&
    prevProps.index === nextProps.index
  );
});

ShapeItem.displayName = 'ShapeItem';

export const ObjectsPanel: React.FC<ObjectsPanelProps> = ({
  shapes,
  onToggleVisibility,
  onSelectShape,
  onDeleteShape,
  onChangeColor,
}) => {
  // Virtualization state
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [containerHeight, setContainerHeight] = useState(0);

  // Update container height on mount and resize
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const updateHeight = () => {
      setContainerHeight(container.clientHeight);
    };

    updateHeight();

    const resizeObserver = new ResizeObserver(updateHeight);
    resizeObserver.observe(container);

    return () => resizeObserver.disconnect();
  }, []);

  // Handle scroll
  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop);
  }, []);

  // Calculate visible range with overscan
  const { startIndex, visibleShapes, offsetY } = useMemo(() => {
    // Calculate visible range
    const start = Math.max(0, Math.floor(scrollTop / ITEM_HEIGHT) - OVERSCAN);
    const visibleCount = Math.ceil(containerHeight / ITEM_HEIGHT) + OVERSCAN * 2;
    const end = Math.min(shapes.length, start + visibleCount);
    
    return {
      startIndex: start,
      visibleShapes: shapes.slice(start, end),
      offsetY: start * ITEM_HEIGHT,
    };
  }, [shapes, scrollTop, containerHeight]);

  const totalHeight = shapes.length * ITEM_HEIGHT;

  return (
    <div style={styles.panel}>
      {/* Header */}
      <div style={styles.header}>
        <div style={styles.headerTitle}>
          <span>Objects</span>
          <span style={styles.itemCount}>{shapes.length}</span>
        </div>
        {shapes.length > 50 && (
          <span style={styles.virtualizedHint}>
            Showing {visibleShapes.length} of {shapes.length}
          </span>
        )}
      </div>

      {/* List with virtualization */}
      <div 
        ref={containerRef}
        style={styles.list}
        onScroll={handleScroll}
      >
        {shapes.length === 0 ? (
          <div style={styles.emptyState}>
            <div style={styles.emptyIcon}>
              <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke={tokens.colors.text.tertiary} strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="7" height="7" />
                <rect x="14" y="3" width="7" height="7" />
                <rect x="14" y="14" width="7" height="7" />
                <rect x="3" y="14" width="7" height="7" />
              </svg>
            </div>
            <div style={styles.emptyTitle}>No objects yet</div>
            <div style={styles.emptyText}>
              Start by drawing a chain or contour, or import shapes from a file.
            </div>

            <div style={styles.shortcuts}>
              <div style={styles.shortcutTitle}>Keyboard shortcuts</div>
              <div style={styles.shortcutItem}>
                <kbd style={styles.kbd}>Ctrl+1</kbd>
                <span>Draw chain</span>
              </div>
              <div style={styles.shortcutItem}>
                <kbd style={styles.kbd}>Ctrl+2</kbd>
                <span>Draw contour</span>
              </div>
              <div style={styles.shortcutItem}>
                <kbd style={styles.kbd}>Esc</kbd>
                <span>Finish drawing</span>
              </div>
              <div style={styles.shortcutItem}>
                <kbd style={styles.kbd}>Ctrl+Z</kbd>
                <span>Undo</span>
              </div>
              <div style={styles.shortcutItem}>
                <kbd style={styles.kbd}>Ctrl+Y</kbd>
                <span>Redo</span>
              </div>
            </div>

            <div style={styles.tip}>
              <div style={styles.tipIcon}>💡</div>
              <div style={styles.tipText}>Use mouse wheel to zoom, drag to pan</div>
            </div>
          </div>
        ) : (
          /* Virtual list container */
          <div style={{ height: totalHeight, position: 'relative' }}>
            {/* Positioned container for visible items */}
            <div style={{ 
              position: 'absolute', 
              top: offsetY, 
              left: 0, 
              right: 0 
            }}>
              {visibleShapes.map((shape, localIndex) => (
                <ShapeItem
                  key={shape.id}
                  shape={shape}
                  index={startIndex + localIndex}
                  onToggleVisibility={onToggleVisibility}
                  onSelectShape={onSelectShape}
                  onDeleteShape={onDeleteShape}
                  onChangeColor={onChangeColor}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      {shapes.length > 0 && (
        <div style={styles.footer}>
          <span style={styles.footerText}>
            Use <kbd>Ctrl+Z</kbd> to undo
          </span>
        </div>
      )}
    </div>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  panel: {
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    fontFamily: tokens.typography.fontFamily.sans,
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: `${tokens.spacing.md} ${tokens.spacing.lg}`,
    borderBottom: `1px solid ${tokens.colors.border.subtle}`,
    backgroundColor: tokens.colors.bg.tertiary,
  },
  headerTitle: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacing.sm,
    fontSize: tokens.typography.fontSize.md,
    fontWeight: tokens.typography.fontWeight.semibold,
    color: tokens.colors.text.primary,
  },
  itemCount: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: '20px',
    height: '20px',
    padding: '0 6px',
    fontSize: tokens.typography.fontSize.xs,
    fontWeight: tokens.typography.fontWeight.medium,
    color: tokens.colors.text.secondary,
    backgroundColor: tokens.colors.bg.elevated,
    borderRadius: '10px',
  },
  virtualizedHint: {
    fontSize: tokens.typography.fontSize.xs,
    color: tokens.colors.text.tertiary,
  },
  list: {
    flex: 1,
    overflowY: 'auto',
    padding: tokens.spacing.md,
  },
  emptyState: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: tokens.spacing.xxxl,
    textAlign: 'center',
  },
  emptyIcon: {
    marginBottom: tokens.spacing.lg,
    opacity: 0.5,
  },
  emptyTitle: {
    fontSize: tokens.typography.fontSize.md,
    fontWeight: tokens.typography.fontWeight.medium,
    color: tokens.colors.text.secondary,
    marginBottom: tokens.spacing.sm,
  },
  emptyText: {
    fontSize: tokens.typography.fontSize.sm,
    color: tokens.colors.text.tertiary,
    lineHeight: tokens.typography.lineHeight.relaxed,
    marginBottom: tokens.spacing.xl,
  },
  shortcuts: {
    width: '100%',
    backgroundColor: tokens.colors.bg.tertiary,
    borderRadius: tokens.radius.md,
    padding: tokens.spacing.md,
    marginBottom: tokens.spacing.lg,
  },
  shortcutTitle: {
    fontSize: tokens.typography.fontSize.xs,
    fontWeight: tokens.typography.fontWeight.semibold,
    color: tokens.colors.text.tertiary,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    marginBottom: tokens.spacing.sm,
  },
  shortcutItem: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: `${tokens.spacing.xs} 0`,
    fontSize: tokens.typography.fontSize.sm,
    color: tokens.colors.text.secondary,
  },
  kbd: {
    display: 'inline-block',
    padding: `2px ${tokens.spacing.xs}`,
    backgroundColor: tokens.colors.bg.elevated,
    border: `1px solid ${tokens.colors.border.default}`,
    borderRadius: tokens.radius.sm,
    fontFamily: tokens.typography.fontFamily.mono,
    fontSize: tokens.typography.fontSize.xs,
    color: tokens.colors.text.primary,
  },
  tip: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacing.sm,
    padding: tokens.spacing.md,
    backgroundColor: tokens.colors.accent.infoBg,
    borderRadius: tokens.radius.md,
    width: '100%',
  },
  tipIcon: {
    fontSize: tokens.typography.fontSize.md,
  },
  tipText: {
    fontSize: tokens.typography.fontSize.sm,
    color: tokens.colors.text.secondary,
  },
  item: {
    display: 'flex',
    alignItems: 'center',
    padding: tokens.spacing.md,
    marginBottom: tokens.spacing.sm,
    backgroundColor: tokens.colors.bg.tertiary,
    borderRadius: tokens.radius.lg,
    border: `1px solid ${tokens.colors.border.subtle}`,
    cursor: 'pointer',
    transition: `all ${tokens.transitions.normal}`,
    outline: 'none',
  },
  itemSelected: {
    backgroundColor: tokens.colors.bg.elevated,
    borderColor: tokens.colors.accent.primary,
    boxShadow: `0 0 0 1px ${tokens.colors.accent.primary}`,
  },
  itemIcon: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '32px',
    height: '32px',
    borderRadius: tokens.radius.md,
    marginRight: tokens.spacing.md,
  },
  itemInfo: {
    flex: 1,
    minWidth: 0,
  },
  itemName: {
    fontSize: tokens.typography.fontSize.md,
    fontWeight: tokens.typography.fontWeight.medium,
    color: tokens.colors.text.primary,
    marginBottom: '2px',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  itemDetails: {
    fontSize: tokens.typography.fontSize.sm,
    color: tokens.colors.text.tertiary,
    marginBottom: tokens.spacing.xs,
  },
  colorPicker: {
    display: 'flex',
    gap: '4px',
    marginTop: tokens.spacing.xs,
  },
  colorButton: {
    width: '14px',
    height: '14px',
    borderRadius: '3px',
    border: '1px solid rgba(255, 255, 255, 0.15)',
    cursor: 'pointer',
    transition: `all ${tokens.transitions.fast}`,
    padding: 0,
  },
  colorButtonActive: {
    boxShadow: '0 0 0 2px rgba(255, 255, 255, 0.3)',
    transform: 'scale(1.15)',
  },
  colorButtonDisabled: {
    opacity: 0.3,
    cursor: 'not-allowed',
  },
  itemActions: {
    display: 'flex',
    gap: tokens.spacing.xs,
  },
  actionButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '32px',
    height: '32px',
    background: 'none',
    border: 'none',
    borderRadius: tokens.radius.md,
    color: tokens.colors.text.secondary,
    cursor: 'pointer',
    transition: `all ${tokens.transitions.fast}`,
  },
  actionButtonMuted: {
    color: tokens.colors.text.tertiary,
    opacity: 0.5,
  },
  deleteButton: {
    color: tokens.colors.text.tertiary,
  },
  footer: {
    padding: tokens.spacing.md,
    borderTop: `1px solid ${tokens.colors.border.subtle}`,
    backgroundColor: tokens.colors.bg.tertiary,
  },
  footerText: {
    fontSize: tokens.typography.fontSize.xs,
    color: tokens.colors.text.tertiary,
  },
};
