import { useState } from 'react';

export interface TextImportFileInfo {
  fileName: string;
  layerName: string;
  shapeCount: number;
}

interface TextImportDialogProps {
  files: TextImportFileInfo[];
  onConfirm: (clearCanvas: boolean) => void;
  onCancel: () => void;
}

export function TextImportDialog({ files, onConfirm, onCancel }: TextImportDialogProps) {
  const [clearCanvas, setClearCanvas] = useState(true);

  const single = files.length === 1;
  const totalShapes = files.reduce((sum, f) => sum + f.shapeCount, 0);

  return (
    <div className="gds-import-overlay" onClick={onCancel}>
      <div className="gds-import-dialog" onClick={e => e.stopPropagation()}>
        <div className="gds-import-header">
          <h2>Import Text File{single ? '' : 's'}</h2>
          <p className="gds-import-subtitle">
            {single
              ? `${files[0].fileName}: ${files[0].shapeCount} shape${files[0].shapeCount === 1 ? '' : 's'} will be imported into layer "${files[0].layerName}"`
              : `${files.length} files (${totalShapes} shapes), each into its own layer`}
          </p>
        </div>

        {!single && (
          <div className="gds-import-layers">
            {files.map((file, i) => (
              <div key={`${file.fileName}_${i}`} className="gds-layer-item">
                <span className="gds-layer-name">{file.fileName}</span>
                <span className="gds-layer-objects">
                  {file.shapeCount} shape{file.shapeCount === 1 ? '' : 's'} → "{file.layerName}"
                </span>
              </div>
            ))}
          </div>
        )}

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
