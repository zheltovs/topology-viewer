import { useState, useCallback, useMemo, useRef } from 'react';
import { Canvas, SidePanel, Toolbar, GdsImportDialog, TextImportDialog } from './components';
import type { CanvasHandle } from './components';
import { Point, Chain, Contour, createLayer, uniqueLayerName, LAYER_COLORS } from './models';
import type { Shape, Layer } from './models';
import { CommandHistory, AddShapeCommand, RemoveShapesCommand } from './services';
import { useKeyboardShortcuts } from './hooks/useKeyboard';
import { DefaultShapeParser, Gds2Parser } from './parsers';
import type { GdsUnits } from './parsers';
import './App.css';

export interface GridSettings {
  enabled: boolean;
  windowX: number;
  windowY: number;
  stepX: number; // 0 = adjacent (same as windowX)
  stepY: number; // 0 = adjacent (same as windowY)
}

// State for GDS import dialog
interface GdsImportState {
  isOpen: boolean;
  layers: Layer[];
  objectCounts: Map<string, number>;
  fileBuffer: ArrayBuffer | null;
  units?: GdsUnits;
}

// A parsed text file waiting to be imported; each file becomes its own layer
interface ParsedTextFile {
  fileName: string;
  layerBaseName: string;
  shapes: Shape[];
  skippedLines: number;
}

// State for text import dialog (shapes already parsed, waiting for user decision)
interface TextImportState {
  isOpen: boolean;
  files: ParsedTextFile[];
}

// Line-based text formats accepted by the text import path
const TEXT_EXTENSIONS = /\.(txt|csv)$/i;

// Stateless, safe to share across renders
const textParser = new DefaultShapeParser();

function App() {
  const [shapes, setShapes] = useState<Shape[]>([]);
  const [layers, setLayers] = useState<Layer[]>([]);
  const [selectedShapeIds, setSelectedShapeIds] = useState<string[]>([]);
  const [drawingMode, setDrawingMode] = useState<'chain' | 'contour' | null>(null);
  const [tempPoints, setTempPoints] = useState<Point[]>([]);
  const [showIntersections, setShowIntersections] = useState(false);
  const [isComputingIntersections, setIsComputingIntersections] = useState(false);
  const [intersectionCount, setIntersectionCount] = useState<number | null>(null);
  const [showStats, setShowStats] = useState(false);
  const [commandHistory] = useState(() => {
    const history = new CommandHistory();
    // setShapes is stable; commands are applied as functional state updates
    history.setOnStateChange(setShapes);
    return history;
  });
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [scaleFactor, setScaleFactor] = useState(1);
  const canvasRef = useRef<CanvasHandle>(null);
  const [gridSettings, setGridSettings] = useState<GridSettings>({
    enabled: false,
    windowX: 100,
    windowY: 100,
    stepX: 0,
    stepY: 0,
  });
  const [gdsImportState, setGdsImportState] = useState<GdsImportState>({
    isOpen: false,
    layers: [],
    objectCounts: new Map(),
    fileBuffer: null
  });
  const [textImportState, setTextImportState] = useState<TextImportState>({
    isOpen: false,
    files: []
  });
  const [units, setUnits] = useState<GdsUnits | undefined>(undefined);
  const [isDragging, setIsDragging] = useState(false);
  const dragCounterRef = useRef(0);

  // Selection filtered down to shapes that still exist (undo/redo can remove
  // selected shapes; ids are kept in state and simply ignored while dead)
  const liveSelectedIds = useMemo(() => {
    if (selectedShapeIds.length === 0) return selectedShapeIds;
    const ids = new Set(shapes.map(s => s.id));
    const next = selectedShapeIds.filter(id => ids.has(id));
    return next.length === selectedShapeIds.length ? selectedShapeIds : next;
  }, [shapes, selectedShapeIds]);

  // Update undo/redo state
  const updateHistoryState = useCallback(() => {
    setCanUndo(commandHistory.canUndo());
    setCanRedo(commandHistory.canRedo());
  }, [commandHistory]);

  // Fit the canvas view; pass the shapes explicitly when they were just set
  // in the same tick (the canvas prop still holds the previous list then)
  const requestFitView = useCallback((shapesToFit?: Shape[]) => {
    canvasRef.current?.fitView(shapesToFit);
  }, []);

  const handleFitView = useCallback(() => {
    requestFitView();
  }, [requestFitView]);

  // Handle adding a point
  const handleAddPoint = useCallback((point: Point) => {
    setTempPoints(prev => [...prev, point]);
  }, []);

  // Finish drawing shape
  const finishDrawing = useCallback(() => {
    // A chain needs 2 points, a contour needs 3 to be a real polygon
    const minPoints = drawingMode === 'contour' ? 3 : 2;
    if (tempPoints.length < minPoints) {
      setTempPoints([]);
      return;
    }

    let newShape: Shape;

    if (drawingMode === 'chain') {
      newShape = new Chain(tempPoints);
    } else if (drawingMode === 'contour') {
      newShape = new Contour(tempPoints);
    } else {
      return;
    }

    commandHistory.executeCommand(new AddShapeCommand(newShape));
    setTempPoints([]);
    updateHistoryState();
  }, [tempPoints, drawingMode, commandHistory, updateHistoryState]);

  // Keyboard handlers - memoized to prevent hook dependency recreation
  const handleUndo = useCallback(() => {
    if (commandHistory.undo()) {
      updateHistoryState();
    }
  }, [commandHistory, updateHistoryState]);

  const handleRedo = useCallback(() => {
    if (commandHistory.redo()) {
      updateHistoryState();
    }
  }, [commandHistory, updateHistoryState]);

  // Esc finishes the current shape; a second Esc (no points) leaves drawing mode
  const handleEscape = useCallback(() => {
    if (!drawingMode) return;
    if (tempPoints.length > 0) {
      finishDrawing();
    } else {
      setDrawingMode(null);
    }
  }, [drawingMode, tempPoints.length, finishDrawing]);

  const handleChainMode = useCallback(() => {
    setDrawingMode(prev => prev === 'chain' ? null : 'chain');
    setTempPoints([]);
  }, []);

  const handleContourMode = useCallback(() => {
    setDrawingMode(prev => prev === 'contour' ? null : 'contour');
    setTempPoints([]);
  }, []);

  const handleToggleStats = useCallback(() => {
    setShowStats(prev => !prev);
  }, []);

  // Delete all currently selected shapes (one undoable step)
  const handleDeleteSelected = useCallback(() => {
    if (liveSelectedIds.length === 0) return;
    commandHistory.executeCommand(new RemoveShapesCommand(liveSelectedIds));
    setSelectedShapeIds([]);
    updateHistoryState();
  }, [liveSelectedIds, commandHistory, updateHistoryState]);

  // Register keyboard shortcuts
  useKeyboardShortcuts({
    onUndo: handleUndo,
    onRedo: handleRedo,
    onEscape: handleEscape,
    onChainMode: handleChainMode,
    onContourMode: handleContourMode,
    onToggleStats: handleToggleStats,
    onFitView: handleFitView,
    onDeleteSelected: handleDeleteSelected
  });

  // Toggle shape visibility
  const handleToggleVisibility = useCallback((shapeId: string) => {
    setShapes(prev => prev.map(s =>
      s.id === shapeId ? { ...s, visible: !s.visible } : s
    ));
  }, []);

  // Select shape (toggle if already selected)
  const handleSelectShape = useCallback((shapeId: string) => {
    setSelectedShapeIds(prev => prev.includes(shapeId) ? [] : [shapeId]);
  }, []);

  // Select multiple shapes (for layers panel)
  const handleSelectShapes = useCallback((shapeIds: string[]) => {
    setSelectedShapeIds(shapeIds);
  }, []);

  // Delete shape
  const handleDeleteShape = useCallback((shapeId: string) => {
    commandHistory.executeCommand(new RemoveShapesCommand([shapeId]));
    setSelectedShapeIds(prev => prev.includes(shapeId) ? prev.filter(id => id !== shapeId) : prev);
    updateHistoryState();
  }, [commandHistory, updateHistoryState]);

  // Change shape color
  const handleChangeColor = useCallback((shapeId: string, color: string) => {
    setShapes(prev => prev.map(s =>
      s.id === shapeId ? { ...s, color } : s
    ));
  }, []);

  // Apply coordinate scale divisor to all shapes
  const scaleFactorRef = useRef(1);
  const handleApplyScale = useCallback((newDivisor: number) => {
    const oldDivisor = scaleFactorRef.current;
    const ratio = oldDivisor / newDivisor;
    scaleFactorRef.current = newDivisor;
    setScaleFactor(newDivisor);
    const rescaled = shapes.map(shape => ({
      ...shape,
      points: shape.points.map(p => new Point(p.x * ratio, p.y * ratio)),
    }));
    setShapes(rescaled);
    requestFitView(rescaled);
  }, [shapes, requestFitView]);

  // Divides shape points in place by the current display divisor, so appended
  // raw coordinates land in the same scale as the already-rescaled scene
  const applyCurrentScale = useCallback((importedShapes: Shape[]) => {
    const divisor = scaleFactorRef.current;
    if (divisor === 1) return importedShapes;
    for (const shape of importedShapes) {
      shape.points = shape.points.map(p => new Point(p.x / divisor, p.y / divisor));
    }
    return importedShapes;
  }, []);

  // Apply parsed text files: each file goes into its own new layer, optionally clearing the canvas
  const applyTextImport = useCallback((files: ParsedTextFile[], clearCanvas: boolean) => {
    const existingNames = clearCanvas ? new Set<string>() : new Set(layers.map(l => l.name));
    let colorIndex = clearCanvas ? 0 : layers.length;
    const newLayers: Layer[] = [];
    const newShapes: Shape[] = [];

    for (const file of files) {
      const layer = createLayer(
        uniqueLayerName(file.layerBaseName, existingNames),
        LAYER_COLORS[colorIndex++ % LAYER_COLORS.length]
      );
      existingNames.add(layer.name);

      for (const shape of file.shapes) {
        shape.layerId = layer.id;
        shape.color = layer.color;
      }

      newLayers.push(layer);
      newShapes.push(...file.shapes);
    }

    if (clearCanvas) {
      commandHistory.clear();
      scaleFactorRef.current = 1;
      setScaleFactor(1);
      setShapes(newShapes);
      setLayers(newLayers);
      setUnits(undefined);
      setSelectedShapeIds([]);
      updateHistoryState();
      requestFitView(newShapes);
    } else {
      applyCurrentScale(newShapes);
      setLayers(prev => [...prev, ...newLayers]);
      setShapes(prev => [...prev, ...newShapes]);
      setSelectedShapeIds([]);
      requestFitView([...shapes, ...newShapes]);
    }
  }, [layers, shapes, commandHistory, updateHistoryState, applyCurrentScale, requestFitView]);

  // Parse a text file into shapes (one shape per line). Invalid lines are
  // skipped and counted instead of failing the whole file.
  const parseTextFile = useCallback(async (file: File): Promise<ParsedTextFile> => {
    const content = await file.text();
    const lines = content.split('\n');
    const newShapes: Shape[] = [];
    let skippedLines = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      let points: Point[];
      try {
        points = textParser.parsePoints(line);
      } catch (error) {
        skippedLines++;
        console.warn(`${file.name}:${i + 1}: line skipped — ${error instanceof Error ? error.message : error}`);
        continue;
      }

      if (points.length < 2) {
        skippedLines++;
        console.warn(`${file.name}:${i + 1}: line skipped — less than 2 points`);
        continue;
      }

      const firstPoint = points[0];
      const lastPoint = points[points.length - 1];
      newShapes.push(firstPoint.equals(lastPoint) ? new Contour(points) : new Chain(points));
    }

    return {
      fileName: file.name,
      layerBaseName: file.name.replace(/\.[^.]+$/, '') || 'Imported',
      shapes: newShapes,
      skippedLines
    };
  }, []);

  // Process imported files (shared by click-import and drag-and-drop).
  // A single file may be GDS or text; multiple files are supported for text only.
  const handleFiles = useCallback(async (inputFiles: File[]) => {
    try {
      if (inputFiles.length === 0) return;

      if (inputFiles.length === 1) {
        const file = inputFiles[0];
        const fileName = file.name.toLowerCase();

        if (fileName.endsWith('.gds') || fileName.endsWith('.gds2')) {
          // For GDS files, show layer selection dialog first
          const buffer = await file.arrayBuffer();
          const gds2Parser = new Gds2Parser();
          const layerInfo = gds2Parser.scanLayers(buffer);

          setGdsImportState({
            isOpen: true,
            layers: layerInfo.layers,
            objectCounts: layerInfo.objectCounts,
            fileBuffer: buffer,
            units: layerInfo.units
          });
          return;
        }
      }

      // Multiple files: only line-based text formats are supported
      let textFiles = inputFiles;
      if (inputFiles.length > 1) {
        textFiles = inputFiles.filter(f => TEXT_EXTENSIONS.test(f.name));
        const skipped = inputFiles.filter(f => !textFiles.includes(f));
        if (skipped.length > 0) {
          alert(`Multiple file import supports .txt/.csv only. Skipped: ${skipped.map(f => f.name).join(', ')}`);
        }
        if (textFiles.length === 0) return;
      }

      const parsedFiles = await Promise.all(textFiles.map(parseTextFile));
      const totalShapes = parsedFiles.reduce((sum, f) => sum + f.shapes.length, 0);
      const totalSkipped = parsedFiles.reduce((sum, f) => sum + f.skippedLines, 0);

      if (totalShapes === 0) {
        alert(totalSkipped > 0
          ? `Nothing imported: ${totalSkipped} invalid line(s) skipped. See the browser console for details.`
          : 'Nothing imported: no shapes found in the selected file(s).');
        return;
      }
      if (totalSkipped > 0) {
        alert(`Imported with warnings: ${totalSkipped} invalid line(s) skipped. See the browser console for details.`);
      }

      const nonEmptyFiles = parsedFiles.filter(f => f.shapes.length > 0);

      if (shapes.length > 0 || layers.length > 0) {
        // Existing content: ask the user whether to clear the canvas
        setTextImportState({ isOpen: true, files: nonEmptyFiles });
      } else {
        applyTextImport(nonEmptyFiles, true);
      }
    } catch (error) {
      alert(`Error reading file: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }, [shapes.length, layers.length, applyTextImport, parseTextFile]);

  // Handle text import dialog confirmation
  const handleTextImportConfirm = useCallback((clearCanvas: boolean) => {
    applyTextImport(textImportState.files, clearCanvas);
    setTextImportState({ isOpen: false, files: [] });
  }, [textImportState.files, applyTextImport]);

  // Handle text import dialog cancellation
  const handleTextImportCancel = useCallback(() => {
    setTextImportState({ isOpen: false, files: [] });
  }, []);

  // Handle import from file (button click)
  const handleImport = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.txt,.csv,.gds,.gds2';
    input.multiple = true;
    input.onchange = async (e) => {
      const files = (e.target as HTMLInputElement).files;
      if (files) await handleFiles(Array.from(files));
    };
    input.click();
  }, [handleFiles]);

  // Drag-and-drop handlers
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dragCounterRef.current += 1;
    if (dragCounterRef.current === 1) setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dragCounterRef.current -= 1;
    if (dragCounterRef.current === 0) setIsDragging(false);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    dragCounterRef.current = 0;
    setIsDragging(false);
    await handleFiles(Array.from(e.dataTransfer.files));
  }, [handleFiles]);

  // Handle GDS import confirmation
  const handleGdsImportConfirm = useCallback((selectedLayerIds: string[], clearCanvas: boolean) => {
    if (!gdsImportState.fileBuffer || selectedLayerIds.length === 0) {
      setGdsImportState({ isOpen: false, layers: [], objectCounts: new Map(), fileBuffer: null });
      return;
    }

    try {
      const gds2Parser = new Gds2Parser();
      const allowedLayerIds = new Set(selectedLayerIds);
      const layerMap = new Map<string, Layer>(gdsImportState.layers.map(l => [l.id, l]));

      const result = gds2Parser.parseWithLayerFilter(
        gdsImportState.fileBuffer,
        allowedLayerIds,
        layerMap
      );

      if (result.shapes.length > 0) {
        setUnits(result.units);
        if (clearCanvas) {
          commandHistory.clear();
          scaleFactorRef.current = 1;
          setScaleFactor(1);
          setShapes(result.shapes);
          setLayers(result.layers);
          setSelectedShapeIds([]);
          updateHistoryState();
          requestFitView(result.shapes);
        } else {
          // Append mode: all new layers are independent — just ensure unique names
          applyCurrentScale(result.shapes);
          setLayers(prevLayers => {
            const existingNames = new Set(prevLayers.map(l => l.name));

            const uniqueLayers = result.layers.map(newLayer => {
              const name = uniqueLayerName(newLayer.name, existingNames);
              existingNames.add(name);
              return name === newLayer.name ? newLayer : { ...newLayer, name };
            });

            return [...prevLayers, ...uniqueLayers];
          });
          setShapes(prevShapes => [...prevShapes, ...result.shapes]);
          setSelectedShapeIds([]);
          requestFitView([...shapes, ...result.shapes]);
        }
      } else {
        alert('No shapes found on the selected layers.');
      }
    } catch (error) {
      alert(`Error importing GDS: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    setGdsImportState({ isOpen: false, layers: [], objectCounts: new Map(), fileBuffer: null });
  }, [gdsImportState.fileBuffer, gdsImportState.layers, shapes, commandHistory, updateHistoryState, applyCurrentScale, requestFitView]);

  // Handle GDS import cancellation
  const handleGdsImportCancel = useCallback(() => {
    setGdsImportState({ isOpen: false, layers: [], objectCounts: new Map(), fileBuffer: null });
  }, []);

  // Handle export to file
  const handleExport = useCallback(() => {
    if (shapes.length === 0) {
      alert('No shapes to export');
      return;
    }

    const lines = shapes.map(shape => {
      const coords = shape.points
        .map(p => `${p.x}, ${p.y}`)
        .join(', ');
      return coords;
    });

    const content = lines.join('\n');
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    link.download = 'shapes.txt';
    link.click();

    URL.revokeObjectURL(url);
  }, [shapes]);

  // Layer management handlers
  const handleLayerCreate = useCallback((layer: Layer) => {
    setLayers(prev => [...prev, layer]);
  }, []);

  const handleLayerUpdate = useCallback((layerId: string, updates: Partial<Layer>) => {
    setLayers(prev => prev.map(layer =>
      layer.id === layerId ? { ...layer, ...updates } : layer
    ));

    // If color changed, update all shapes in this layer
    if (updates.color) {
      setShapes(prev => prev.map(shape =>
        shape.layerId === layerId ? { ...shape, color: updates.color! } : shape
      ));
    }

    // If visibility changed, update all shapes in this layer
    if (updates.visible !== undefined) {
      setShapes(prev => prev.map(shape =>
        shape.layerId === layerId ? { ...shape, visible: updates.visible! } : shape
      ));
    }
  }, []);

  const handleLayerDelete = useCallback((layerId: string) => {
    // Remove layer but keep shapes (unassign them)
    setLayers(prev => prev.filter(l => l.id !== layerId));
    setShapes(prev => prev.map(shape =>
      shape.layerId === layerId ? { ...shape, layerId: undefined } : shape
    ));
  }, []);

  const handleAssignShapesToLayer = useCallback((shapeIds: string[], layerId: string) => {
    const layer = layers.find(l => l.id === layerId);
    if (!layer) return;

    setShapes(prev => prev.map(shape =>
      shapeIds.includes(shape.id)
        ? { ...shape, layerId, color: layer.color }
        : shape
    ));
  }, [layers]);

  const handleRemoveShapesFromLayer = useCallback((shapeIds: string[]) => {
    setShapes(prev => prev.map(shape =>
      shapeIds.includes(shape.id)
        ? { ...shape, layerId: undefined }
        : shape
    ));
  }, []);

  const handleToggleLayerVisibility = useCallback((layerId: string) => {
    const layer = layers.find(l => l.id === layerId);
    const newVisible = layer ? !layer.visible : true;

    setLayers(prev => prev.map(l =>
      l.id === layerId ? { ...l, visible: newVisible } : l
    ));
    setShapes(prev => prev.map(shape =>
      shape.layerId === layerId ? { ...shape, visible: newVisible } : shape
    ));
  }, [layers]);

  // Intersection state relayed from the canvas to the toolbar
  const handleIntersectionComputingChange = useCallback((computing: boolean) => {
    setIsComputingIntersections(computing);
    if (computing) setIntersectionCount(null);
  }, []);

  const handleIntersectionsFound = useCallback((count: number) => {
    setIntersectionCount(count);
  }, []);

  return (
    <div className="app">
      <Toolbar
        drawingMode={drawingMode}
        onSetDrawingMode={(mode) => {
          setDrawingMode(mode);
          setTempPoints([]);
        }}
        onImport={handleImport}
        onExport={handleExport}
        canUndo={canUndo}
        canRedo={canRedo}
        onUndo={handleUndo}
        onRedo={handleRedo}
        showIntersections={showIntersections}
        onToggleIntersections={() => setShowIntersections(!showIntersections)}
        isComputingIntersections={isComputingIntersections}
        intersectionCount={intersectionCount}
        onFitView={handleFitView}
        scaleFactor={scaleFactor}
        onApplyScale={handleApplyScale}
        gridSettings={gridSettings}
        onGridSettingsChange={setGridSettings}
        units={units}
      />

      <div className="workspace">
        <div
          className="canvas-container"
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
        >
          {isDragging && (
            <div className="drop-overlay">
              <div className="drop-overlay-content">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="17 8 12 3 7 8" />
                  <line x1="12" y1="3" x2="12" y2="15" />
                </svg>
                <span>Drop GDS or TXT file to import</span>
              </div>
            </div>
          )}
          <Canvas
            ref={canvasRef}
            shapes={shapes}
            selectedShapeIds={liveSelectedIds}
            onAddPoint={handleAddPoint}
            drawingMode={drawingMode}
            tempPoints={tempPoints}
            showIntersections={showIntersections}
            showStats={showStats}
            onIntersectionComputingChange={handleIntersectionComputingChange}
            onIntersectionsFound={handleIntersectionsFound}
            gridSettings={gridSettings}
          />
        </div>

        <SidePanel
          shapes={shapes}
          onToggleVisibility={handleToggleVisibility}
          onSelectShape={handleSelectShape}
          onDeleteShape={handleDeleteShape}
          onChangeColor={handleChangeColor}
          layers={layers}
          selectedShapeIds={liveSelectedIds}
          onLayerCreate={handleLayerCreate}
          onLayerUpdate={handleLayerUpdate}
          onLayerDelete={handleLayerDelete}
          onAssignShapesToLayer={handleAssignShapesToLayer}
          onRemoveShapesFromLayer={handleRemoveShapesFromLayer}
          onSelectShapes={handleSelectShapes}
          onToggleLayerVisibility={handleToggleLayerVisibility}
        />
      </div>

      {textImportState.isOpen && (
        <TextImportDialog
          files={textImportState.files.map(f => ({
            fileName: f.fileName,
            layerName: f.layerBaseName,
            shapeCount: f.shapes.length
          }))}
          onConfirm={handleTextImportConfirm}
          onCancel={handleTextImportCancel}
        />
      )}

      {gdsImportState.isOpen && (
        <GdsImportDialog
          layers={gdsImportState.layers}
          objectCounts={gdsImportState.objectCounts}
          hasExistingContent={shapes.length > 0 || layers.length > 0}
          units={gdsImportState.units}
          onConfirm={handleGdsImportConfirm}
          onCancel={handleGdsImportCancel}
        />
      )}
    </div>
  );
}

export default App;
