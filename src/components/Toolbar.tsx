import React from 'react';
import { tokens } from '../styles';

interface ToolbarProps {
  drawingMode: 'chain' | 'contour' | null;
  onSetDrawingMode: (mode: 'chain' | 'contour' | null) => void;
  onImport: () => void;
  onExport: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  showIntersections?: boolean;
  onToggleIntersections?: () => void;
  isComputingIntersections?: boolean;
}

// Icon components for clean, modern look
const ChainIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 20L8 12L12 16L16 8L20 4" />
    <circle cx="4" cy="20" r="2" fill="currentColor" />
    <circle cx="8" cy="12" r="2" fill="currentColor" />
    <circle cx="12" cy="16" r="2" fill="currentColor" />
    <circle cx="16" cy="8" r="2" fill="currentColor" />
    <circle cx="20" cy="4" r="2" fill="currentColor" />
  </svg>
);

const ContourIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="12,2 22,8.5 22,15.5 12,22 2,15.5 2,8.5" />
  </svg>
);

const UndoIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 7v6h6" />
    <path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13" />
  </svg>
);

const RedoIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 7v6h-6" />
    <path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3L21 13" />
  </svg>
);

const ImportIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="7,10 12,15 17,10" />
    <line x1="12" y1="15" x2="12" y2="3" />
  </svg>
);

const ExportIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="17,8 12,3 7,8" />
    <line x1="12" y1="3" x2="12" y2="15" />
  </svg>
);

const IntersectionIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3" fill="currentColor" />
    <line x1="12" y1="2" x2="12" y2="6" />
    <line x1="12" y1="18" x2="12" y2="22" />
    <line x1="2" y1="12" x2="6" y2="12" />
    <line x1="18" y1="12" x2="22" y2="12" />
  </svg>
);

export const Toolbar: React.FC<ToolbarProps> = ({
  drawingMode,
  onSetDrawingMode,
  onImport,
  onExport,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  showIntersections = false,
  onToggleIntersections,
  isComputingIntersections = false
}) => {
  return (
    <div style={styles.toolbar}>
      {/* Logo / Brand */}
      <div style={styles.brand}>
        <div style={styles.logo}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <path d="M12 2L2 7v10l10 5 10-5V7L12 2z" stroke={tokens.colors.accent.primary} strokeWidth="2" fill="none"/>
            <path d="M12 22V12" stroke={tokens.colors.accent.primary} strokeWidth="2"/>
            <path d="M2 7l10 5 10-5" stroke={tokens.colors.accent.primary} strokeWidth="2"/>
          </svg>
        </div>
        <span style={styles.brandText}>Topology Viewer</span>
      </div>

      <div style={styles.divider} />

      {/* Drawing Tools */}
      <div style={styles.toolGroup}>
        <span style={styles.groupLabel}>Draw</span>
        <div style={styles.buttonGroup}>
          <button
            className={`toolbar-btn ${drawingMode === 'chain' ? 'active' : ''}`}
            onClick={() => onSetDrawingMode(drawingMode === 'chain' ? null : 'chain')}
            title="Draw Chain (Ctrl+1)"
          >
            <ChainIcon />
            <span>Chain</span>
          </button>

          <button
            className={`toolbar-btn ${drawingMode === 'contour' ? 'active-contour' : ''}`}
            onClick={() => onSetDrawingMode(drawingMode === 'contour' ? null : 'contour')}
            title="Draw Contour (Ctrl+2)"
          >
            <ContourIcon />
            <span>Contour</span>
          </button>
        </div>
      </div>

      <div style={styles.divider} />

      {/* History */}
      <div style={styles.toolGroup}>
        <span style={styles.groupLabel}>History</span>
        <div style={styles.buttonGroup}>
          <button
            className="toolbar-icon-btn"
            onClick={onUndo}
            disabled={!canUndo}
            title="Undo (Ctrl+Z)"
          >
            <UndoIcon />
          </button>

          <button
            className="toolbar-icon-btn"
            onClick={onRedo}
            disabled={!canRedo}
            title="Redo (Ctrl+Y)"
          >
            <RedoIcon />
          </button>
        </div>
      </div>

      <div style={styles.divider} />

      {/* View Controls */}
      {onToggleIntersections && (
        <div style={styles.toolGroup}>
          <span style={styles.groupLabel}>View</span>
          <div style={styles.buttonGroup}>
            <button
              className={`toolbar-btn ${showIntersections ? 'active-intersections' : ''}`}
              onClick={onToggleIntersections}
              title="Show/Hide Intersections"
            >
              <IntersectionIcon />
              <span>Intersections</span>
            </button>
          </div>
        </div>
      )}

      <div style={styles.divider} />

      {/* Import / Export */}
      <div style={styles.toolGroup}>
        <span style={styles.groupLabel}>File</span>
        <div style={styles.buttonGroup}>
          <button
            className="toolbar-btn"
            onClick={onImport}
            title="Import from file (.txt, .csv, .gds, .gds2)"
          >
            <ImportIcon />
            <span>Import</span>
          </button>
          <button
            className="toolbar-btn"
            onClick={onExport}
            title="Export to file"
          >
            <ExportIcon />
            <span>Export</span>
          </button>
        </div>
      </div>

      {/* Intersection Computing Progress */}
      {isComputingIntersections && (
        <div className="intersection-progress-container">
          <div className="intersection-progress-bar">
            <div className="intersection-progress-fill" />
          </div>
          <span className="intersection-progress-label">Working...</span>
        </div>
      )}

      {/* Status / Hints */}
      <div style={styles.statusArea}>
        {drawingMode && (
          <div style={styles.hint}>
            <div style={styles.hintDot} />
            <span>
              Click to add points • Press <kbd>Esc</kbd> to finish
              {drawingMode === 'contour' && ' (auto-close)'}
            </span>
          </div>
        )}
      </div>
    </div>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  toolbar: {
    height: tokens.components.toolbar.height,
    backgroundColor: tokens.colors.bg.secondary,
    borderBottom: `1px solid ${tokens.colors.border.subtle}`,
    display: 'flex',
    alignItems: 'center',
    padding: `0 ${tokens.spacing.md}`,
    gap: tokens.spacing.md,
    fontFamily: tokens.typography.fontFamily.sans,
  },
  brand: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacing.sm,
  },
  logo: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandText: {
    fontSize: tokens.typography.fontSize.md,
    fontWeight: tokens.typography.fontWeight.semibold,
    color: tokens.colors.text.primary,
    letterSpacing: '-0.02em',
  },
  divider: {
    width: '1px',
    height: '16px',
    backgroundColor: tokens.colors.border.subtle,
    margin: '0 4px',
  },
  toolGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacing.xs,
  },
  groupLabel: {
    display: 'none',
  },
  buttonGroup: {
    display: 'flex',
    gap: tokens.spacing.xs,
  },
  button: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    padding: '4px 8px',
    height: tokens.components.button.height.md,
    backgroundColor: 'transparent',
    border: `1px solid ${tokens.colors.border.default}`,
    borderRadius: '4px',
    color: tokens.colors.text.secondary,
    fontSize: '11px',
    fontWeight: tokens.typography.fontWeight.medium,
    fontFamily: 'inherit',
    cursor: 'pointer',
    transition: `all ${tokens.transitions.normal}`,
    outline: 'none',
  },
  iconButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: tokens.components.button.height.md,
    height: tokens.components.button.height.md,
    backgroundColor: 'transparent',
    border: `1px solid ${tokens.colors.border.default}`,
    borderRadius: '4px',
    color: tokens.colors.text.secondary,
    cursor: 'pointer',
    transition: `all ${tokens.transitions.normal}`,
    outline: 'none',
  },
  buttonActive: {
    backgroundColor: tokens.colors.accent.primary,
    borderColor: tokens.colors.accent.primary,
    color: tokens.colors.text.primary,
    boxShadow: tokens.shadows.glow.primary,
  },
  buttonActiveContour: {
    backgroundColor: tokens.colors.accent.success,
    borderColor: tokens.colors.accent.success,
    color: tokens.colors.text.primary,
    boxShadow: tokens.shadows.glow.success,
  },
  buttonActiveIntersections: {
    backgroundColor: '#ff0000',
    borderColor: '#ff0000',
    color: '#ffffff',
    boxShadow: '0 0 12px rgba(255, 0, 0, 0.4)',
  },
  buttonDisabled: {
    opacity: 0.35,
    cursor: 'not-allowed',
    pointerEvents: 'none' as const,
  },
  statusArea: {
    marginLeft: 'auto',
    display: 'flex',
    alignItems: 'center',
  },
  hint: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacing.sm,
    padding: `${tokens.spacing.sm} ${tokens.spacing.md}`,
    backgroundColor: tokens.colors.bg.tertiary,
    borderRadius: tokens.radius.md,
    fontSize: tokens.typography.fontSize.sm,
    color: tokens.colors.text.secondary,
  },
  hintDot: {
    width: '6px',
    height: '6px',
    borderRadius: '50%',
    backgroundColor: tokens.colors.accent.danger,
    animation: 'pulse 2s infinite',
  },
};
