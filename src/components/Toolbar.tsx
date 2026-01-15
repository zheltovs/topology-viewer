import React from 'react';

interface ToolbarProps {
  drawingMode: 'chain' | 'contour' | null;
  onSetDrawingMode: (mode: 'chain' | 'contour' | null) => void;
  onImport: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
}

export const Toolbar: React.FC<ToolbarProps> = ({
  drawingMode,
  onSetDrawingMode,
  onImport,
  canUndo,
  canRedo,
  onUndo,
  onRedo
}) => {
  return (
    <div style={styles.toolbar}>
      <div style={styles.section}>
        <button
          style={{
            ...styles.button,
            ...(drawingMode === 'chain' ? styles.buttonActive : {})
          }}
          onClick={() => onSetDrawingMode(drawingMode === 'chain' ? null : 'chain')}
          title="Draw Chain (Ctrl+1)"
        >
          📏 Chain
        </button>

        <button
          style={{
            ...styles.button,
            ...(drawingMode === 'contour' ? styles.buttonActive : {})
          }}
          onClick={() => onSetDrawingMode(drawingMode === 'contour' ? null : 'contour')}
          title="Draw Contour (Ctrl+2) - Press Esc to finish"
        >
          ⬡ Contour
        </button>
      </div>

      <div style={styles.separator}></div>

      <div style={styles.section}>
        <button
          style={{
            ...styles.button,
            ...(canUndo ? {} : styles.buttonDisabled)
          }}
          onClick={onUndo}
          disabled={!canUndo}
          title="Undo (Ctrl+Z)"
        >
          ↶ Undo
        </button>

        <button
          style={{
            ...styles.button,
            ...(canRedo ? {} : styles.buttonDisabled)
          }}
          onClick={onRedo}
          disabled={!canRedo}
          title="Redo (Ctrl+Y)"
        >
          ↷ Redo
        </button>
      </div>

      <div style={styles.separator}></div>

      <div style={styles.section}>
        <button
          style={styles.button}
          onClick={onImport}
          title="Import from file"
        >
          📥 Import
        </button>
      </div>

      <div style={styles.info}>
        {drawingMode === 'contour' && (
          <span>💡 Click to add points, press <kbd>Esc</kbd> to finish contour</span>
        )}
        {drawingMode === 'chain' && (
          <span>💡 Click to add points, press <kbd>Esc</kbd> to finish</span>
        )}
      </div>
    </div>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  toolbar: {
    height: '56px',
    backgroundColor: '#fff',
    borderBottom: '1px solid #ddd',
    display: 'flex',
    alignItems: 'center',
    padding: '0 16px',
    gap: '12px',
    fontFamily: 'system-ui, -apple-system, sans-serif'
  },
  section: {
    display: 'flex',
    gap: '8px'
  },
  separator: {
    width: '1px',
    height: '32px',
    backgroundColor: '#ddd'
  },
  button: {
    padding: '8px 16px',
    backgroundColor: '#fff',
    border: '1px solid #ddd',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: '500',
    transition: 'all 0.2s',
    display: 'flex',
    alignItems: 'center',
    gap: '6px'
  },
  buttonActive: {
    backgroundColor: '#2196f3',
    color: '#fff',
    borderColor: '#2196f3'
  },
  buttonDisabled: {
    opacity: 0.4,
    cursor: 'not-allowed'
  },
  info: {
    marginLeft: 'auto',
    fontSize: '13px',
    color: '#666',
    display: 'flex',
    alignItems: 'center'
  }
};
