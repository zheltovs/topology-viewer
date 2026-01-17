import React, { useState, useCallback } from 'react';
import type { Shape, Layer } from '../models';
import { ShapeType, LAYER_COLORS, createLayer, DEFAULT_LAYER_ID } from '../models';
import { tokens } from '../styles';

interface LayersPanelProps {
  layers: Layer[];
  shapes: Shape[];
  selectedShapeIds: string[];
  onLayerCreate: (layer: Layer) => void;
  onLayerUpdate: (layerId: string, updates: Partial<Layer>) => void;
  onLayerDelete: (layerId: string) => void;
  onAssignShapesToLayer: (shapeIds: string[], layerId: string) => void;
  onRemoveShapesFromLayer: (shapeIds: string[]) => void;
  onSelectShapes: (shapeIds: string[]) => void;
  onToggleLayerVisibility: (layerId: string) => void;
}

// Icon components
const PlusIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="5" x2="12" y2="19" />
    <line x1="5" y1="12" x2="19" y2="12" />
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
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3,6 5,6 21,6" />
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
  </svg>
);

const EditIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
  </svg>
);

const ChevronDownIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="6,9 12,15 18,9" />
  </svg>
);

const ChevronRightIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="9,18 15,12 9,6" />
  </svg>
);

const CheckIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20,6 9,17 4,12" />
  </svg>
);

const ContourIcon = ({ color = 'currentColor' }: { color?: string }) => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="12,2 22,8.5 22,15.5 12,22 2,15.5 2,8.5" />
  </svg>
);

const ChainIcon = ({ color = 'currentColor' }: { color?: string }) => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 20L8 12L12 16L16 8L20 4" />
  </svg>
);

const PointIcon = ({ color = 'currentColor' }: { color?: string }) => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3" fill={color} />
  </svg>
);

const MoveIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 9l-3 3 3 3" />
    <path d="M9 5l3-3 3 3" />
    <path d="M15 19l3 3-3 3" />
    <path d="M19 9l3 3-3 3" />
    <line x1="2" y1="12" x2="22" y2="12" />
    <line x1="12" y1="2" x2="12" y2="22" />
  </svg>
);

export const LayersPanel: React.FC<LayersPanelProps> = ({
  layers,
  shapes,
  selectedShapeIds,
  onLayerCreate,
  onLayerUpdate,
  onLayerDelete,
  onAssignShapesToLayer,
  onRemoveShapesFromLayer,
  onSelectShapes,
  onToggleLayerVisibility,
}) => {
  const [expandedLayers, setExpandedLayers] = useState<Set<string>>(new Set());
  const [editingLayerId, setEditingLayerId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [showColorPicker, setShowColorPicker] = useState<string | null>(null);
  const [assignMode, setAssignMode] = useState<string | null>(null); // layerId for assigning selected shapes

  // Get shapes for a specific layer
  const getShapesForLayer = useCallback((layerId: string) => {
    return shapes.filter(s => s.layerId === layerId);
  }, [shapes]);

  // Get unassigned shapes (shapes without a layer)
  const unassignedShapes = shapes.filter(s => !s.layerId || !layers.find(l => l.id === s.layerId));

  // Toggle layer expansion
  const toggleLayerExpanded = (layerId: string) => {
    setExpandedLayers(prev => {
      const next = new Set(prev);
      if (next.has(layerId)) {
        next.delete(layerId);
      } else {
        next.add(layerId);
      }
      return next;
    });
  };

  // Start editing layer name
  const startEditing = (layer: Layer) => {
    setEditingLayerId(layer.id);
    setEditingName(layer.name);
  };

  // Save edited name
  const saveEditing = () => {
    if (editingLayerId && editingName.trim()) {
      onLayerUpdate(editingLayerId, { name: editingName.trim() });
    }
    setEditingLayerId(null);
    setEditingName('');
  };

  // Cancel editing
  const cancelEditing = () => {
    setEditingLayerId(null);
    setEditingName('');
  };

  // Create new layer
  const handleCreateLayer = () => {
    const colorIndex = layers.length % LAYER_COLORS.length;
    const layer = createLayer(`New Layer ${layers.length + 1}`, LAYER_COLORS[colorIndex]);
    onLayerCreate(layer);
    setExpandedLayers(prev => new Set([...prev, layer.id]));
  };

  // Handle color change
  const handleColorChange = (layerId: string, color: string) => {
    onLayerUpdate(layerId, { color });
    setShowColorPicker(null);
  };

  // Toggle shape selection in layer view
  const handleShapeClick = (shapeId: string, event: React.MouseEvent) => {
    if (event.ctrlKey || event.metaKey) {
      // Multi-select with Ctrl/Cmd
      if (selectedShapeIds.includes(shapeId)) {
        onSelectShapes(selectedShapeIds.filter(id => id !== shapeId));
      } else {
        onSelectShapes([...selectedShapeIds, shapeId]);
      }
    } else if (event.shiftKey && selectedShapeIds.length > 0) {
      // Range select with Shift
      const allShapeIds = shapes.map(s => s.id);
      const lastSelectedIndex = allShapeIds.indexOf(selectedShapeIds[selectedShapeIds.length - 1]);
      const currentIndex = allShapeIds.indexOf(shapeId);
      const start = Math.min(lastSelectedIndex, currentIndex);
      const end = Math.max(lastSelectedIndex, currentIndex);
      const rangeIds = allShapeIds.slice(start, end + 1);
      onSelectShapes([...new Set([...selectedShapeIds, ...rangeIds])]);
    } else {
      // Single select
      onSelectShapes([shapeId]);
    }
  };

  // Select all shapes in a layer
  const selectAllInLayer = (layerId: string) => {
    const layerShapeIds = getShapesForLayer(layerId).map(s => s.id);
    onSelectShapes(layerShapeIds);
  };

  // Assign selected shapes to layer
  const handleAssignSelected = (layerId: string) => {
    if (selectedShapeIds.length > 0) {
      onAssignShapesToLayer(selectedShapeIds, layerId);
      setAssignMode(null);
    }
  };

  // Remove selected shapes from their layers
  const handleRemoveSelectedFromLayers = () => {
    onRemoveShapesFromLayer(selectedShapeIds);
  };

  return (
    <div style={styles.panel}>
      {/* Header with actions */}
      <div style={styles.header}>
        <div style={styles.headerTitle}>
          <span>Layers</span>
          <span style={styles.layerCount}>{layers.length}</span>
        </div>
        <button
          style={styles.addButton}
          onClick={handleCreateLayer}
          title="Create new layer"
        >
          <PlusIcon />
        </button>
      </div>

      {/* Selection actions */}
      {selectedShapeIds.length > 0 && (
        <div style={styles.selectionBar}>
          <span style={styles.selectionText}>
            {selectedShapeIds.length} selected
          </span>
          <div style={styles.selectionActions}>
            <div style={styles.assignDropdown}>
              <button
                style={styles.actionBtn}
                onClick={() => setAssignMode(assignMode ? null : 'open')}
                title="Assign to layer"
              >
                <MoveIcon />
                <span>Assign</span>
              </button>
              {assignMode && (
                <div style={styles.dropdownMenu}>
                  {layers.map(layer => (
                    <button
                      key={layer.id}
                      style={styles.dropdownItem}
                      onClick={() => handleAssignSelected(layer.id)}
                    >
                      <div style={{ ...styles.colorDot, backgroundColor: layer.color }} />
                      <span>{layer.name}</span>
                    </button>
                  ))}
                  {layers.length === 0 && (
                    <div style={styles.dropdownEmpty}>No layers. Create one first.</div>
                  )}
                </div>
              )}
            </div>
            <button
              style={styles.actionBtn}
              onClick={handleRemoveSelectedFromLayers}
              title="Remove from layer"
            >
              <TrashIcon />
            </button>
          </div>
        </div>
      )}

      {/* Layers list */}
      <div style={styles.layersList}>
        {layers.length === 0 && unassignedShapes.length === 0 && (
          <div style={styles.emptyState}>
            <div style={styles.emptyIcon}>
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.5 }}>
                <polygon points="12,2 2,7 12,12 22,7" />
                <polyline points="2,17 12,22 22,17" />
                <polyline points="2,12 12,17 22,12" />
              </svg>
            </div>
            <div style={styles.emptyTitle}>No layers yet</div>
            <div style={styles.emptyText}>
              Create layers to organize your shapes. Import from GDS2 to auto-create layers.
            </div>
            <button style={styles.createButton} onClick={handleCreateLayer}>
              <PlusIcon />
              <span>Create Layer</span>
            </button>
          </div>
        )}

        {layers.map(layer => {
          const layerShapes = getShapesForLayer(layer.id);
          const isExpanded = expandedLayers.has(layer.id);
          const isEditing = editingLayerId === layer.id;
          const contourCount = layerShapes.filter(s => s.type === ShapeType.CONTOUR).length;
          const chainCount = layerShapes.filter(s => s.type === ShapeType.CHAIN).length;

          return (
            <div key={layer.id} style={styles.layerItem}>
              {/* Layer header */}
              <div
                style={{
                  ...styles.layerHeader,
                  ...(isExpanded ? styles.layerHeaderExpanded : {})
                }}
              >
                <button
                  style={styles.expandBtn}
                  onClick={() => toggleLayerExpanded(layer.id)}
                >
                  {isExpanded ? <ChevronDownIcon /> : <ChevronRightIcon />}
                </button>

                {/* Color picker */}
                <div style={styles.colorPickerWrapper}>
                  <button
                    style={{ ...styles.colorBtn, backgroundColor: layer.color }}
                    onClick={() => setShowColorPicker(showColorPicker === layer.id ? null : layer.id)}
                    title="Change layer color"
                  />
                  {showColorPicker === layer.id && (
                    <div style={styles.colorPickerPopup}>
                      {LAYER_COLORS.map(color => (
                        <button
                          key={color}
                          style={{
                            ...styles.colorOption,
                            backgroundColor: color,
                            ...(layer.color === color ? styles.colorOptionActive : {})
                          }}
                          onClick={() => handleColorChange(layer.id, color)}
                        />
                      ))}
                    </div>
                  )}
                </div>

                {/* Layer name */}
                <div style={styles.layerInfo} onClick={() => toggleLayerExpanded(layer.id)}>
                  {isEditing ? (
                    <input
                      style={styles.editInput}
                      value={editingName}
                      onChange={e => setEditingName(e.target.value)}
                      onBlur={saveEditing}
                      onKeyDown={e => {
                        if (e.key === 'Enter') saveEditing();
                        if (e.key === 'Escape') cancelEditing();
                      }}
                      autoFocus
                      onClick={e => e.stopPropagation()}
                    />
                  ) : (
                    <>
                      <span style={styles.layerName}>{layer.name}</span>
                      <span style={styles.layerMeta}>
                        <span style={styles.layerStat}><ContourIcon color={layer.color} />{contourCount}</span>
                        <span style={styles.layerStat}><ChainIcon color={layer.color} />{chainCount}</span>
                        <span style={styles.layerStat}><PointIcon color={tokens.colors.text.tertiary} />{layerShapes.reduce((sum, s) => sum + s.points.length, 0)}</span>
                        {layer.gdsLayerNumber !== undefined && (
                          <span style={styles.gdsNumber}>GDS: {layer.gdsLayerNumber}</span>
                        )}
                      </span>
                    </>
                  )}
                </div>

                {/* Layer actions */}
                <div style={styles.layerActions}>
                  <button
                    style={styles.iconBtn}
                    onClick={() => onToggleLayerVisibility(layer.id)}
                    title={layer.visible ? 'Hide layer' : 'Show layer'}
                  >
                    {layer.visible ? <EyeIcon /> : <EyeOffIcon />}
                  </button>
                  <button
                    style={styles.iconBtn}
                    onClick={() => startEditing(layer)}
                    title="Rename layer"
                  >
                    <EditIcon />
                  </button>
                  {layer.id !== DEFAULT_LAYER_ID && (
                    <button
                      style={{ ...styles.iconBtn, ...styles.deleteBtn }}
                      onClick={() => onLayerDelete(layer.id)}
                      title="Delete layer"
                    >
                      <TrashIcon />
                    </button>
                  )}
                </div>
              </div>

              {/* Layer shapes */}
              {isExpanded && (
                <div style={styles.layerContent}>
                  {layerShapes.length === 0 ? (
                    <div style={styles.noShapes}>
                      No shapes in this layer.
                      {selectedShapeIds.length > 0 && (
                        <button
                          style={styles.assignHereBtn}
                          onClick={() => handleAssignSelected(layer.id)}
                        >
                          Assign {selectedShapeIds.length} selected here
                        </button>
                      )}
                    </div>
                  ) : (
                    <>
                      <div style={styles.layerStats}>
                        {contourCount > 0 && (
                          <span style={styles.statBadge}>
                            <ContourIcon color={layer.color} /> {contourCount}
                          </span>
                        )}
                        {chainCount > 0 && (
                          <span style={styles.statBadge}>
                            <ChainIcon color={layer.color} /> {chainCount}
                          </span>
                        )}
                        <button
                          style={styles.selectAllBtn}
                          onClick={() => selectAllInLayer(layer.id)}
                        >
                          Select all
                        </button>
                      </div>
                      <div style={styles.shapeList}>
                        {layerShapes.map((shape, idx) => (
                          <div
                            key={shape.id}
                            style={{
                              ...styles.shapeItem,
                              ...(selectedShapeIds.includes(shape.id) ? styles.shapeItemSelected : {})
                            }}
                            onClick={(e) => handleShapeClick(shape.id, e)}
                          >
                            {selectedShapeIds.includes(shape.id) && (
                              <span style={styles.checkMark}><CheckIcon /></span>
                            )}
                            {shape.type === ShapeType.CONTOUR
                              ? <ContourIcon color={layer.color} />
                              : <ChainIcon color={layer.color} />
                            }
                            <span style={styles.shapeName}>
                              {shape.type === ShapeType.CONTOUR ? 'Contour' : 'Chain'} {idx + 1}
                            </span>
                            <span style={styles.shapePoints}>{shape.points.length} pts</span>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {/* Unassigned shapes section */}
        {unassignedShapes.length > 0 && (
          <div style={styles.layerItem}>
            <div
              style={{
                ...styles.layerHeader,
                ...(expandedLayers.has('__unassigned__') ? styles.layerHeaderExpanded : {}),
                backgroundColor: 'rgba(255,255,255,0.02)'
              }}
            >
              <button
                style={styles.expandBtn}
                onClick={() => toggleLayerExpanded('__unassigned__')}
              >
                {expandedLayers.has('__unassigned__') ? <ChevronDownIcon /> : <ChevronRightIcon />}
              </button>
              <div style={{ ...styles.colorBtn, backgroundColor: '#666', cursor: 'default' }} />
              <div style={styles.layerInfo} onClick={() => toggleLayerExpanded('__unassigned__')}>
                <span style={styles.layerName}>Unassigned</span>
                <span style={styles.layerMeta}>{unassignedShapes.length} shapes</span>
              </div>
            </div>
            {expandedLayers.has('__unassigned__') && (
              <div style={styles.layerContent}>
                <div style={styles.shapeList}>
                  {unassignedShapes.map((shape, idx) => (
                    <div
                      key={shape.id}
                      style={{
                        ...styles.shapeItem,
                        ...(selectedShapeIds.includes(shape.id) ? styles.shapeItemSelected : {})
                      }}
                      onClick={(e) => handleShapeClick(shape.id, e)}
                    >
                      {selectedShapeIds.includes(shape.id) && (
                        <span style={styles.checkMark}><CheckIcon /></span>
                      )}
                      {shape.type === ShapeType.CONTOUR
                        ? <ContourIcon color={shape.color} />
                        : <ChainIcon color={shape.color} />
                      }
                      <span style={styles.shapeName}>
                        {shape.type === ShapeType.CONTOUR ? 'Contour' : 'Chain'} {idx + 1}
                      </span>
                      <span style={styles.shapePoints}>{shape.points.length} pts</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer hint */}
      <div style={styles.footer}>
        <span style={styles.footerText}>
          <kbd>Ctrl</kbd><span>+click to multi-select</span> <span style={styles.footerDot}>•</span> <kbd>Shift</kbd><span>+click for range</span>
        </span>
      </div>
    </div>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  panel: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
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
  layerCount: {
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
  addButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '28px',
    height: '28px',
    border: `1px solid ${tokens.colors.border.default}`,
    borderRadius: tokens.radius.md,
    backgroundColor: 'transparent',
    color: tokens.colors.text.secondary,
    cursor: 'pointer',
    transition: `all ${tokens.transitions.fast}`,
  },
  selectionBar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: `${tokens.spacing.sm} ${tokens.spacing.lg}`,
    backgroundColor: tokens.colors.accent.infoBg,
    borderBottom: `1px solid ${tokens.colors.border.subtle}`,
  },
  selectionText: {
    fontSize: tokens.typography.fontSize.sm,
    color: tokens.colors.accent.primary,
    fontWeight: tokens.typography.fontWeight.medium,
  },
  selectionActions: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacing.sm,
  },
  assignDropdown: {
    position: 'relative',
  },
  actionBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    padding: '4px 8px',
    border: `1px solid ${tokens.colors.border.default}`,
    borderRadius: tokens.radius.sm,
    backgroundColor: 'transparent',
    color: tokens.colors.text.secondary,
    fontSize: tokens.typography.fontSize.xs,
    cursor: 'pointer',
    transition: `all ${tokens.transitions.fast}`,
  },
  dropdownMenu: {
    position: 'absolute',
    top: '100%',
    right: 0,
    marginTop: '4px',
    minWidth: '160px',
    backgroundColor: tokens.colors.bg.elevated,
    border: `1px solid ${tokens.colors.border.default}`,
    borderRadius: tokens.radius.md,
    boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
    zIndex: 100,
    overflow: 'hidden',
  },
  dropdownItem: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacing.sm,
    width: '100%',
    padding: `${tokens.spacing.sm} ${tokens.spacing.md}`,
    border: 'none',
    backgroundColor: 'transparent',
    color: tokens.colors.text.primary,
    fontSize: tokens.typography.fontSize.sm,
    textAlign: 'left',
    cursor: 'pointer',
    transition: `background ${tokens.transitions.fast}`,
  },
  dropdownEmpty: {
    padding: tokens.spacing.md,
    fontSize: tokens.typography.fontSize.sm,
    color: tokens.colors.text.tertiary,
    textAlign: 'center',
  },
  colorDot: {
    width: '12px',
    height: '12px',
    borderRadius: '3px',
    flexShrink: 0,
  },
  layersList: {
    flex: 1,
    overflowY: 'auto',
    padding: tokens.spacing.sm,
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
    marginBottom: tokens.spacing.md,
    color: tokens.colors.text.tertiary,
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
    marginBottom: tokens.spacing.lg,
  },
  createButton: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacing.sm,
    padding: `${tokens.spacing.sm} ${tokens.spacing.lg}`,
    border: `1px solid ${tokens.colors.accent.primary}`,
    borderRadius: tokens.radius.md,
    backgroundColor: 'transparent',
    color: tokens.colors.accent.primary,
    fontSize: tokens.typography.fontSize.sm,
    fontWeight: tokens.typography.fontWeight.medium,
    cursor: 'pointer',
    transition: `all ${tokens.transitions.fast}`,
  },
  layerItem: {
    marginBottom: tokens.spacing.xs,
    borderRadius: tokens.radius.md,
    overflow: 'hidden',
    border: `1px solid ${tokens.colors.border.subtle}`,
    backgroundColor: tokens.colors.bg.tertiary,
  },
  layerHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacing.sm,
    padding: tokens.spacing.md,
    cursor: 'pointer',
    transition: `background ${tokens.transitions.fast}`,
  },
  layerHeaderExpanded: {
    backgroundColor: tokens.colors.bg.elevated,
    borderBottom: `1px solid ${tokens.colors.border.subtle}`,
  },
  expandBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '20px',
    height: '20px',
    border: 'none',
    background: 'none',
    color: tokens.colors.text.tertiary,
    cursor: 'pointer',
    padding: 0,
  },
  colorPickerWrapper: {
    position: 'relative',
  },
  colorBtn: {
    width: '16px',
    height: '16px',
    borderRadius: '4px',
    border: '1px solid rgba(255,255,255,0.2)',
    cursor: 'pointer',
    flexShrink: 0,
  },
  colorPickerPopup: {
    position: 'absolute',
    top: '100%',
    left: 0,
    marginTop: '4px',
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    gap: '4px',
    padding: tokens.spacing.sm,
    backgroundColor: tokens.colors.bg.elevated,
    border: `1px solid ${tokens.colors.border.default}`,
    borderRadius: tokens.radius.md,
    boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
    zIndex: 100,
  },
  colorOption: {
    width: '24px',
    height: '24px',
    borderRadius: '4px',
    border: '2px solid transparent',
    cursor: 'pointer',
    transition: `all ${tokens.transitions.fast}`,
  },
  colorOptionActive: {
    borderColor: 'white',
    transform: 'scale(1.1)',
  },
  layerInfo: {
    flex: 1,
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  },
  layerName: {
    fontSize: tokens.typography.fontSize.sm,
    fontWeight: tokens.typography.fontWeight.medium,
    color: tokens.colors.text.primary,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  layerMeta: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacing.sm,
    fontSize: tokens.typography.fontSize.xs,
    color: tokens.colors.text.tertiary,
  },
  layerStat: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '2px',
  },
  gdsNumber: {
    padding: '1px 6px',
    backgroundColor: tokens.colors.bg.secondary,
    borderRadius: '3px',
  },
  editInput: {
    width: '100%',
    padding: '4px 8px',
    border: `1px solid ${tokens.colors.accent.primary}`,
    borderRadius: tokens.radius.sm,
    backgroundColor: tokens.colors.bg.primary,
    color: tokens.colors.text.primary,
    fontSize: tokens.typography.fontSize.sm,
    outline: 'none',
  },
  layerActions: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
  },
  iconBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '24px',
    height: '24px',
    border: 'none',
    borderRadius: tokens.radius.sm,
    backgroundColor: 'transparent',
    color: tokens.colors.text.tertiary,
    cursor: 'pointer',
    transition: `all ${tokens.transitions.fast}`,
  },
  deleteBtn: {
    color: tokens.colors.text.tertiary,
  },
  layerContent: {
    padding: tokens.spacing.sm,
    backgroundColor: tokens.colors.bg.secondary,
  },
  noShapes: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: tokens.spacing.sm,
    padding: tokens.spacing.md,
    fontSize: tokens.typography.fontSize.sm,
    color: tokens.colors.text.tertiary,
    textAlign: 'center',
  },
  assignHereBtn: {
    padding: `${tokens.spacing.xs} ${tokens.spacing.md}`,
    border: `1px dashed ${tokens.colors.accent.primary}`,
    borderRadius: tokens.radius.sm,
    backgroundColor: 'transparent',
    color: tokens.colors.accent.primary,
    fontSize: tokens.typography.fontSize.xs,
    cursor: 'pointer',
    transition: `all ${tokens.transitions.fast}`,
  },
  layerStats: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacing.md,
    padding: `${tokens.spacing.xs} ${tokens.spacing.sm}`,
    marginBottom: tokens.spacing.xs,
  },
  statBadge: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    fontSize: tokens.typography.fontSize.xs,
    color: tokens.colors.text.secondary,
  },
  selectAllBtn: {
    marginLeft: 'auto',
    padding: '2px 8px',
    border: 'none',
    borderRadius: tokens.radius.sm,
    backgroundColor: 'transparent',
    color: tokens.colors.accent.primary,
    fontSize: tokens.typography.fontSize.xs,
    cursor: 'pointer',
  },
  shapeList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
    maxHeight: '200px',
    overflowY: 'auto',
  },
  shapeItem: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacing.sm,
    padding: `${tokens.spacing.xs} ${tokens.spacing.sm}`,
    borderRadius: tokens.radius.sm,
    cursor: 'pointer',
    transition: `background ${tokens.transitions.fast}`,
  },
  shapeItemSelected: {
    backgroundColor: tokens.colors.accent.infoBg,
  },
  checkMark: {
    color: tokens.colors.accent.primary,
  },
  shapeName: {
    flex: 1,
    fontSize: tokens.typography.fontSize.xs,
    color: tokens.colors.text.secondary,
  },
  shapePoints: {
    fontSize: tokens.typography.fontSize.xs,
    color: tokens.colors.text.tertiary,
  },
  footer: {
    padding: tokens.spacing.sm,
    borderTop: `1px solid ${tokens.colors.border.subtle}`,
    backgroundColor: tokens.colors.bg.tertiary,
  },
  footerText: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '4px',
    fontSize: tokens.typography.fontSize.xs,
    color: tokens.colors.text.tertiary,
    width: '100%',
  },
  footerDot: {
    margin: '0 4px',
  },
};
