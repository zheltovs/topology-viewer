import { useState } from 'react';
import type { Layer } from '../models';
import type { GdsUnits } from '../parsers';
import { describeGdsUnits } from '../parsers/gdsUnits';
import { useDialogKeys } from './useDialogKeys';

interface GdsImportDialogProps {
  layers: Layer[];
  objectCounts: Map<string, number>;
  hasExistingContent: boolean;
  units?: GdsUnits;
  onConfirm: (selectedLayerIds: string[], clearCanvas: boolean) => void;
  onCancel: () => void;
}

export function GdsImportDialog({ layers, objectCounts, hasExistingContent, units, onConfirm, onCancel }: GdsImportDialogProps) {
  const unitsDisplay = describeGdsUnits(units);
  // The dialog is mounted fresh for every import, so the initializer is
  // enough to select all layers by default
  const [selectedLayerIds, setSelectedLayerIds] = useState<Set<string>>(
    new Set(layers.map(l => l.id))
  );
  const [clearCanvas, setClearCanvas] = useState(true);

  const handleToggleLayer = (layerId: string) => {
    setSelectedLayerIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(layerId)) {
        newSet.delete(layerId);
      } else {
        newSet.add(layerId);
      }
      return newSet;
    });
  };

  const handleSelectAll = () => {
    setSelectedLayerIds(new Set(layers.map(l => l.id)));
  };

  const handleDeselectAll = () => {
    setSelectedLayerIds(new Set());
  };

  const handleConfirm = () => {
    onConfirm(Array.from(selectedLayerIds), clearCanvas);
  };

  const allSelected = selectedLayerIds.size === layers.length;
  const noneSelected = selectedLayerIds.size === 0;

  useDialogKeys(onCancel, noneSelected ? undefined : handleConfirm);

  return (
    <div className="gds-import-overlay" onClick={onCancel}>
      <div className="gds-import-dialog" onClick={e => e.stopPropagation()}>
        <div className="gds-import-header">
          <h2>Import GDS</h2>
          <p className="gds-import-subtitle">Select layers to import</p>
          {unitsDisplay && (
            <p className="gds-import-units" title="Parsed from the GDSII UNITS record">
              {unitsDisplay.full}
            </p>
          )}
        </div>

        <div className="gds-import-toolbar">
          <button
            className="gds-select-btn"
            onClick={handleSelectAll}
            disabled={allSelected}
          >
            Select All
          </button>
          <button
            className="gds-select-btn"
            onClick={handleDeselectAll}
            disabled={noneSelected}
          >
            Deselect All
          </button>
          <span className="gds-import-count">
            Selected: {selectedLayerIds.size} of {layers.length}
          </span>
        </div>

        <div className="gds-import-layers">
          {layers.map(layer => (
            <label
              key={layer.id}
              className={`gds-layer-item ${selectedLayerIds.has(layer.id) ? 'selected' : ''}`}
            >
              <input
                type="checkbox"
                checked={selectedLayerIds.has(layer.id)}
                onChange={() => handleToggleLayer(layer.id)}
              />
              <span
                className="gds-layer-color"
                style={{ backgroundColor: layer.color }}
              />
              <span className="gds-layer-name">{layer.name}</span>
              <span className="gds-layer-objects">
                {objectCounts.get(layer.id) || 0} objects
              </span>
              {layer.gdsLayerNumber !== undefined && (
                <span className="gds-layer-number">
                  #{layer.gdsLayerNumber}
                  {layer.gdsDataType !== undefined ? `/${layer.gdsDataType}` : ''}
                </span>
              )}
            </label>
          ))}
        </div>

        <div className="gds-import-footer">
          {hasExistingContent && (
            <label className="gds-clear-canvas-checkbox">
              <input
                type="checkbox"
                checked={clearCanvas}
                onChange={e => setClearCanvas(e.target.checked)}
              />
              <span>Clear canvas before import</span>
            </label>
          )}
          <div className="gds-import-actions">
            <button
              className="gds-cancel-btn"
              onClick={onCancel}
            >
              Cancel
            </button>
            <button
              className="gds-confirm-btn"
              onClick={handleConfirm}
              disabled={noneSelected}
            >
              {hasExistingContent && !clearCanvas ? 'Append' : 'Import'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
