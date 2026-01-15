import React from 'react';
import type { Shape } from '../models';
import { ShapeType } from '../models';

interface ObjectsPanelProps {
  shapes: Shape[];
  onToggleVisibility: (shapeId: string) => void;
  onSelectShape: (shapeId: string) => void;
  onDeleteShape: (shapeId: string) => void;
}

export const ObjectsPanel: React.FC<ObjectsPanelProps> = ({
  shapes,
  onToggleVisibility,
  onSelectShape,
  onDeleteShape
}) => {
  return (
    <div style={styles.panel}>
      <div style={styles.header}>
        <h3 style={styles.title}>Objects</h3>
        <div style={styles.count}>{shapes.length} items</div>
      </div>

      <div style={styles.list}>
        {shapes.length === 0 ? (
          <div style={styles.emptyState}>
            No objects yet. Start drawing!
          </div>
        ) : (
          shapes.map(shape => (
            <div
              key={shape.id}
              style={{
                ...styles.item,
                ...(shape.selected ? styles.itemSelected : {})
              }}
              onClick={() => onSelectShape(shape.id)}
            >
              <div style={styles.itemIcon}>
                {shape.type === ShapeType.CHAIN ? '📏' : '⬡'}
              </div>

              <div style={styles.itemInfo}>
                <div style={styles.itemName}>{shape.name}</div>
                <div style={styles.itemDetails}>
                  {shape.type === ShapeType.CHAIN ? 'Chain' : 'Contour'} • {shape.points.length} points
                </div>
              </div>

              <div style={styles.itemActions}>
                <button
                  style={styles.actionButton}
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleVisibility(shape.id);
                  }}
                  title={shape.visible ? 'Hide' : 'Show'}
                >
                  {shape.visible ? '👁️' : '👁️‍🗨️'}
                </button>

                <button
                  style={styles.actionButton}
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteShape(shape.id);
                  }}
                  title="Delete"
                >
                  🗑️
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  panel: {
    width: '280px',
    height: '100%',
    backgroundColor: '#f5f5f5',
    borderLeft: '1px solid #ddd',
    display: 'flex',
    flexDirection: 'column',
    fontFamily: 'system-ui, -apple-system, sans-serif'
  },
  header: {
    padding: '16px',
    borderBottom: '1px solid #ddd',
    backgroundColor: '#fff'
  },
  title: {
    margin: '0 0 4px 0',
    fontSize: '16px',
    fontWeight: '600',
    color: '#333'
  },
  count: {
    fontSize: '12px',
    color: '#666'
  },
  list: {
    flex: 1,
    overflowY: 'auto',
    padding: '8px'
  },
  emptyState: {
    padding: '32px 16px',
    textAlign: 'center',
    color: '#999',
    fontSize: '14px'
  },
  item: {
    display: 'flex',
    alignItems: 'center',
    padding: '12px',
    marginBottom: '4px',
    backgroundColor: '#fff',
    borderRadius: '6px',
    border: '1px solid #e0e0e0',
    cursor: 'pointer',
    transition: 'all 0.2s'
  },
  itemSelected: {
    backgroundColor: '#e3f2fd',
    borderColor: '#2196f3'
  },
  itemIcon: {
    fontSize: '20px',
    marginRight: '12px'
  },
  itemInfo: {
    flex: 1,
    minWidth: 0
  },
  itemName: {
    fontSize: '14px',
    fontWeight: '500',
    color: '#333',
    marginBottom: '2px',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis'
  },
  itemDetails: {
    fontSize: '12px',
    color: '#666'
  },
  itemActions: {
    display: 'flex',
    gap: '4px'
  },
  actionButton: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    padding: '4px 8px',
    fontSize: '16px',
    borderRadius: '4px',
    transition: 'background-color 0.2s'
  }
};
