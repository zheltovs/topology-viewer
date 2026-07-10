import { useState } from 'react';

interface TextImportDialogProps {
  fileName: string;
  shapeCount: number;
  layerName: string;
  onConfirm: (clearCanvas: boolean) => void;
  onCancel: () => void;
}

export function TextImportDialog({ fileName, shapeCount, layerName, onConfirm, onCancel }: TextImportDialogProps) {
  const [clearCanvas, setClearCanvas] = useState(true);

  return (
    <div className="gds-import-overlay" onClick={onCancel}>
      <div className="gds-import-dialog" onClick={e => e.stopPropagation()}>
        <div className="gds-import-header">
          <h2>Import Text File</h2>
          <p className="gds-import-subtitle">
            {fileName}: {shapeCount} shape{shapeCount === 1 ? '' : 's'} will be imported into layer "{layerName}"
          </p>
        </div>

        <div className="gds-import-footer">
          <label
            className="gds-clear-canvas-checkbox"
            title="Removes all existing shapes and layers"
          >
            <input
              type="checkbox"
              checked={clearCanvas}
              onChange={e => setClearCanvas(e.target.checked)}
            />
            <span>Clear canvas before import</span>
          </label>
          <div className="gds-import-actions">
            <button className="gds-cancel-btn" onClick={onCancel}>
              Cancel
            </button>
            <button className="gds-confirm-btn" onClick={() => onConfirm(clearCanvas)}>
              {clearCanvas ? 'Import' : 'Append'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
