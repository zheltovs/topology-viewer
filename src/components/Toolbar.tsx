import React, { useState, useRef, useEffect } from 'react';
import { tokens } from '../styles';
import type { GridSettings } from '../App';
import type { GdsUnits } from '../parsers';
import { describeGdsUnits } from '../parsers/gdsUnits';

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
  intersectionCount?: number | null;
  onFitView: () => void;
  scaleFactor: number;
  onApplyScale: (divisor: number) => void;
  gridSettings: GridSettings;
  onGridSettingsChange: (s: GridSettings) => void;
  units?: GdsUnits;
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

const FitIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M8 3H5a2 2 0 0 0-2 2v3" />
    <path d="M21 8V5a2 2 0 0 0-2-2h-3" />
    <path d="M3 16v3a2 2 0 0 0 2 2h3" />
    <path d="M16 21h3a2 2 0 0 0 2-2v-3" />
    <rect x="9" y="9" width="6" height="6" />
  </svg>
);

const GearIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
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
  isComputingIntersections = false,
  intersectionCount = null,
  onFitView,
  scaleFactor,
  onApplyScale,
  gridSettings,
  onGridSettingsChange,
  units,
}) => {
  // null = not editing; the input then mirrors the current scaleFactor, so an
  // external reset (e.g. import with "clear canvas") shows up immediately
  const [scaleInput, setScaleInput] = useState<string | null>(null);
  const scaleValue = scaleInput ?? String(scaleFactor);
  const unitsDisplay = describeGdsUnits(units);

  // Local string state for grid inputs
  const [gwX, setGwX] = useState(String(gridSettings.windowX));
  const [gwY, setGwY] = useState(String(gridSettings.windowY));
  const [gsX, setGsX] = useState(gridSettings.stepX > 0 ? String(gridSettings.stepX) : '');
  const [gsY, setGsY] = useState(gridSettings.stepY > 0 ? String(gridSettings.stepY) : '');

  // Grid settings popover
  const [showGridPopover, setShowGridPopover] = useState(false);
  const gridPopoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showGridPopover) return;

    const handleMouseDown = (event: MouseEvent) => {
      if (gridPopoverRef.current && !gridPopoverRef.current.contains(event.target as Node)) {
        setShowGridPopover(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setShowGridPopover(false);
    };

    document.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [showGridPopover]);

  const applyScale = () => {
    const val = parseFloat(scaleValue);
    if (!isNaN(val) && val > 0 && val !== scaleFactor) {
      onApplyScale(val);
    }
    setScaleInput(null);
  };

  const handleScaleKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') applyScale();
  };

  const applyGridField = (field: 'windowX' | 'windowY' | 'stepX' | 'stepY', raw: string) => {
    const val = parseFloat(raw);
    const numVal = isNaN(val) || val < 0 ? 0 : val;
    onGridSettingsChange({ ...gridSettings, [field]: numVal });
  };

  const gridField = (
    field: 'windowX' | 'windowY' | 'stepX' | 'stepY',
    value: string,
    setValue: (v: string) => void,
    placeholder: string,
    title: string
  ) => (
    <input
      type="number" min="0" step="any"
      value={value}
      placeholder={placeholder}
      onChange={e => setValue(e.target.value)}
      onBlur={() => applyGridField(field, value)}
      onKeyDown={e => { if (e.key === 'Enter') applyGridField(field, value); }}
      style={styles.gridInput}
      title={title}
    />
  );

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
      <div style={styles.toolGroup}>
        <div style={styles.buttonGroup}>
          <button
            className="toolbar-icon-btn"
            onClick={onFitView}
            title="Fit view to shapes (Home)"
          >
            <FitIcon />
          </button>
          {onToggleIntersections && (
            <button
              className={`toolbar-btn ${showIntersections ? 'active-intersections' : ''}`}
              onClick={onToggleIntersections}
              title="Show/Hide Intersections"
            >
              <IntersectionIcon />
              <span>Intersections</span>
            </button>
          )}
        </div>
      </div>

      <div style={styles.divider} />

      {/* Scale Factor */}
      <div style={styles.toolGroup}>
        <span style={styles.scaleLabel}>Scale ÷</span>
        <input
          type="number"
          min="0.000001"
          step="any"
          value={scaleValue}
          onChange={e => setScaleInput(e.target.value)}
          onKeyDown={handleScaleKey}
          onBlur={applyScale}
          style={styles.scaleInput}
          title="Divide all coordinates by this value and redraw (Enter to apply)"
        />
      </div>

      <div style={styles.divider} />

      {/* Window Grid */}
      <div style={styles.toolGroup}>
        <label style={styles.gridCheckLabel}>
          <input
            type="checkbox"
            checked={gridSettings.enabled}
            onChange={e => {
              onGridSettingsChange({ ...gridSettings, enabled: e.target.checked });
              // First enable usually means "configure it" — open the settings
              if (e.target.checked) setShowGridPopover(true);
            }}
            style={styles.gridCheckbox}
          />
          <span style={styles.scaleLabel}>Grid</span>
        </label>
        {gridSettings.enabled && (
          <div style={styles.gridPopoverAnchor} ref={gridPopoverRef}>
            <button
              className={`toolbar-icon-btn ${showGridPopover ? 'active' : ''}`}
              onClick={() => setShowGridPopover(prev => !prev)}
              title="Grid settings"
            >
              <GearIcon />
            </button>
            {showGridPopover && (
              <div style={styles.gridPopover}>
                <div style={styles.gridPopoverRow}>
                  <span style={styles.gridPopoverLabel}>Window</span>
                  {gridField('windowX', gwX, setGwX, '', 'Window width (world units)')}
                  <span style={styles.scaleLabel}>×</span>
                  {gridField('windowY', gwY, setGwY, '', 'Window height (world units)')}
                </div>
                <div style={styles.gridPopoverRow}>
                  <span style={styles.gridPopoverLabel}>Step</span>
                  {gridField('stepX', gsX, setGsX, gwX || '=', 'Step X (default: same as window width)')}
                  <span style={styles.scaleLabel}>×</span>
                  {gridField('stepY', gsY, setGsY, gwY || '=', 'Step Y (default: same as window height)')}
                </div>
                <div style={styles.gridPopoverHint}>
                  Empty step = windows are adjacent
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <div style={styles.divider} />

      {/* Import / Export */}
      <div style={styles.toolGroup}>
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
        {showIntersections && !isComputingIntersections && intersectionCount !== null && (
          <div
            style={{
              ...styles.unitsBadge,
              ...(intersectionCount > 0 ? styles.intersectionsHot : styles.intersectionsClean),
            }}
            title="Point crossings and collinear overlaps between visible shapes"
          >
            {intersectionCount > 0
              ? `${intersectionCount} intersection${intersectionCount === 1 ? '' : 's'}`
              : 'No intersections'}
          </div>
        )}
        {unitsDisplay && (
          <div
            style={styles.unitsBadge}
            title={`GDSII UNITS — ${unitsDisplay.full}\nCoordinates are displayed in raw DB units.`}
          >
            {unitsDisplay.short}
          </div>
        )}
        {drawingMode && (
          <div style={styles.hint}>
            <div style={styles.hintDot} />
            <span>
              Click to add points • <kbd>Esc</kbd> finishes{drawingMode === 'contour' && ' (auto-close)'} • <kbd>Esc</kbd> again exits
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
    whiteSpace: 'nowrap' as const,
  },
  divider: {
    width: '1px',
    height: '16px',
    backgroundColor: tokens.colors.border.subtle,
    margin: '0 4px',
    flexShrink: 0,
  },
  toolGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacing.xs,
  },
  buttonGroup: {
    display: 'flex',
    gap: tokens.spacing.xs,
  },
  statusArea: {
    marginLeft: 'auto',
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacing.sm,
    minWidth: 0,
  },
  unitsBadge: {
    padding: `${tokens.spacing.sm} ${tokens.spacing.md}`,
    backgroundColor: tokens.colors.bg.tertiary,
    border: `1px solid ${tokens.colors.border.subtle}`,
    borderRadius: tokens.radius.md,
    fontSize: tokens.typography.fontSize.sm,
    fontFamily: tokens.typography.fontFamily.mono,
    color: tokens.colors.text.secondary,
    whiteSpace: 'nowrap' as const,
  },
  intersectionsHot: {
    color: '#ff6b6b',
    borderColor: 'rgba(255, 0, 0, 0.35)',
    backgroundColor: 'rgba(255, 0, 0, 0.08)',
  },
  intersectionsClean: {
    color: tokens.colors.accent.success,
    borderColor: 'rgba(0, 186, 124, 0.35)',
    backgroundColor: 'rgba(0, 186, 124, 0.08)',
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
    whiteSpace: 'nowrap' as const,
  },
  hintDot: {
    width: '6px',
    height: '6px',
    borderRadius: '50%',
    backgroundColor: tokens.colors.accent.danger,
    animation: 'pulse 2s infinite',
    flexShrink: 0,
  },
  scaleLabel: {
    fontSize: tokens.typography.fontSize.sm,
    color: tokens.colors.text.secondary,
    whiteSpace: 'nowrap' as const,
  },
  scaleInput: {
    width: '72px',
    height: tokens.components.button.height.md,
    padding: '0 6px',
    background: tokens.colors.bg.tertiary,
    border: `1px solid ${tokens.colors.border.default}`,
    borderRadius: '4px',
    color: tokens.colors.text.primary,
    fontSize: tokens.typography.fontSize.sm,
    fontFamily: tokens.typography.fontFamily.mono,
    outline: 'none',
  },
  gridCheckLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    cursor: 'pointer',
    userSelect: 'none' as const,
  },
  gridCheckbox: {
    width: '14px',
    height: '14px',
    accentColor: tokens.colors.accent.primary,
    cursor: 'pointer',
    flexShrink: 0,
  },
  gridPopoverAnchor: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
  },
  gridPopover: {
    position: 'absolute',
    top: 'calc(100% + 10px)',
    left: '-8px',
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacing.sm,
    padding: tokens.spacing.md,
    backgroundColor: tokens.colors.bg.elevated,
    border: `1px solid ${tokens.colors.border.default}`,
    borderRadius: tokens.radius.md,
    boxShadow: '0 8px 24px rgba(0, 0, 0, 0.5)',
    zIndex: 500,
  },
  gridPopoverRow: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacing.xs,
  },
  gridPopoverLabel: {
    width: '52px',
    fontSize: tokens.typography.fontSize.sm,
    color: tokens.colors.text.secondary,
    flexShrink: 0,
  },
  gridPopoverHint: {
    fontSize: tokens.typography.fontSize.xs,
    color: tokens.colors.text.tertiary,
    whiteSpace: 'nowrap' as const,
  },
  gridInput: {
    width: '64px',
    height: tokens.components.button.height.md,
    padding: '0 5px',
    background: tokens.colors.bg.tertiary,
    border: `1px solid ${tokens.colors.border.default}`,
    borderRadius: '4px',
    color: tokens.colors.text.primary,
    fontSize: tokens.typography.fontSize.sm,
    fontFamily: tokens.typography.fontFamily.mono,
    outline: 'none',
  },
};
