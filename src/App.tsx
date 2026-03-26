import { useState, useCallback, useRef } from 'react';
import { Canvas, SidePanel, Toolbar, GdsImportDialog } from './components';
import { Point, Chain, Contour } from './models';
import type { Shape, Layer } from './models';
import { CommandHistory, AddShapeCommand, RemoveShapeCommand } from './services';
import { useKeyboardShortcuts } from './hooks/useKeyboard';
import { ParserRegistry, Gds2Parser } from './parsers';
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
}

function App() {
  const [shapes, setShapes] = useState<Shape[]>([]);
  const [layers, setLayers] = useState<Layer[]>([]);
  const [selectedShapeIds, setSelectedShapeIds] = useState<string[]>([]);
  const [drawingMode, setDrawingMode] = useState<'chain' | 'contour' | null>(null);
  const [tempPoints, setTempPoints] = useState<Point[]>([]);
  const [showIntersections, setShowIntersections] = useState(false);
  const [isComputingIntersections, setIsComputingIntersections] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [commandHistory] = useState(() => {
    const history = new CommandHistory();
    history.setOnStateChange(setShapes);
    return history;
  });
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [scaleFactor, setScaleFactor] = useState(1);
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
  const [isDragging, setIsDragging] = useState(false);
  const dragCounterRef = useRef(0);
  const parserRegistry = new ParserRegistry();

  // Update undo/redo state
  const updateHistoryState = useCallback(() => {
    setCanUndo(commandHistory.canUndo());
    setCanRedo(commandHistory.canRedo());
  }, [commandHistory]);

  // Handle adding a point
  const handleAddPoint = useCallback((point: Point) => {
    setTempPoints(prev => [...prev, point]);
  }, []);

  // Finish drawing shape
  const finishDrawing = useCallback(() => {
    if (tempPoints.length < 2) {
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

    const command = new AddShapeCommand(shapes, newShape);
    commandHistory.executeCommand(command);
    setTempPoints([]);
    updateHistoryState();
  }, [tempPoints, drawingMode, shapes, commandHistory, updateHistoryState]);

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

  const handleEscape = useCallback(() => {
    if (drawingMode) {
      finishDrawing();
    }
  }, [drawingMode, finishDrawing]);

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

  // Register keyboard shortcuts
  useKeyboardShortcuts({
    onUndo: handleUndo,
    onRedo: handleRedo,
    onEscape: handleEscape,
    onChainMode: handleChainMode,
    onContourMode: handleContourMode,
    onToggleStats: handleToggleStats
  });

  // Toggle shape visibility
  const handleToggleVisibility = useCallback((shapeId: string) => {
    setShapes(prev => prev.map(s =>
      s.id === shapeId ? { ...s, visible: !s.visible } : s
    ));
  }, []);

  // Select shape (toggle if already selected)
  const handleSelectShape = useCallback((shapeId: string) => {
    setSelectedShapeIds(prevIds => {
      const isAlreadySelected = prevIds.includes(shapeId);
      if (isAlreadySelected) {
        setShapes(prev => prev.map(s => ({ ...s, selected: false })));
        return [];
      } else {
        setShapes(prev => prev.map(s => s.id === shapeId ? { ...s, selected: true } : { ...s, selected: false }));
        return [shapeId];
      }
    });
  }, []);

  // Select multiple shapes (for layers panel)
  const handleSelectShapes = useCallback((shapeIds: string[]) => {
    setShapes(prev => prev.map(s => ({ ...s, selected: shapeIds.includes(s.id) })));
    setSelectedShapeIds(shapeIds);
  }, []);

  // Delete shape
  const handleDeleteShape = useCallback((shapeId: string) => {
    const command = new RemoveShapeCommand(shapes, shapeId);
    commandHistory.executeCommand(command);
    updateHistoryState();
  }, [shapes, commandHistory, updateHistoryState]);

  // Change shape color
  const handleChangeColor = useCallback((shapeId: string, color: string) => {
    setShapes(prev => prev.map(s =>
      s.id === shapeId ? { ...s, color } : s
    ));
  }, []);

  // Process a single imported file (shared by click-import and drag-and-drop)
  const handleFile = useCallback(async (file: File) => {
    try {
      const fileName = file.name.toLowerCase();
      const isGds = fileName.endsWith('.gds') || fileName.endsWith('.gds2');

      if (isGds) {
        // For GDS files, show layer selection dialog first
        const buffer = await file.arrayBuffer();
        const gds2Parser = new Gds2Parser();
        const layerInfo = gds2Parser.scanLayers(buffer);

        setGdsImportState({
          isOpen: true,
          layers: layerInfo.layers,
          objectCounts: layerInfo.objectCounts,
          fileBuffer: buffer
        });
      } else {
        // For other files, import directly
        const content = await file.text();
        const lines = content.trim().split('\n');
        const parser = parserRegistry.getParser();
        const newShapes: Shape[] = [];

        for (const line of lines) {
          if (!line.trim()) continue;

          const points = parser.parsePoints(line.trim());

          if (points.length < 2) {
            console.warn('Skipping line with less than 2 points:', line);
            continue;
          }

          let newShape: Shape;
          const firstPoint = points[0];
          const lastPoint = points[points.length - 1];

          if (firstPoint.equals(lastPoint)) {
            newShape = new Contour(points);
          } else {
            newShape = new Chain(points);
          }

          newShapes.push(newShape);
        }

        if (newShapes.length > 0) {
          commandHistory.clear();
          setShapes(newShapes);
          setLayers([]);
          setSelectedShapeIds([]);
          updateHistoryState();
        }
      }
    } catch (error) {
      alert(`Error reading file: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }, [commandHistory, updateHistoryState, parserRegistry]);

  // Apply coordinate scale divisor to all shapes
  const scaleFactorRef = useRef(1);
  const handleApplyScale = useCallback((newDivisor: number) => {
    const oldDivisor = scaleFactorRef.current;
    const ratio = oldDivisor / newDivisor;
    scaleFactorRef.current = newDivisor;
    setScaleFactor(newDivisor);
    setShapes(prev => prev.map(shape => ({
      ...shape,
      points: shape.points.map(p => new Point(p.x * ratio, p.y * ratio)),
    })));
  }, []);

  // Handle import from file (button click)
  const handleImport = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.txt,.csv,.gds,.gds2';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) await handleFile(file);
    };
    input.click();
  }, [handleFile]);

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
    const file = e.dataTransfer.files[0];
    if (file) await handleFile(file);
  }, [handleFile]);

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
        if (clearCanvas) {
          commandHistory.clear();
          setShapes(result.shapes);
          setLayers(result.layers);
          setSelectedShapeIds([]);
          updateHistoryState();
        } else {
          // Append mode: all new layers are independent — just ensure unique names
          setLayers(prevLayers => {
            const existingNames = new Set(prevLayers.map(l => l.name));

            const uniqueLayers = result.layers.map(newLayer => {
              if (!existingNames.has(newLayer.name)) {
                existingNames.add(newLayer.name);
                return newLayer;
              }
              let counter = 2;
              let candidate = `${newLayer.name} (${counter})`;
              while (existingNames.has(candidate)) {
                counter++;
                candidate = `${newLayer.name} (${counter})`;
              }
              existingNames.add(candidate);
              return { ...newLayer, name: candidate };
            });

            return [...prevLayers, ...uniqueLayers];
          });
          setShapes(prevShapes => [...prevShapes, ...result.shapes]);
          setSelectedShapeIds([]);
        }
      }
    } catch (error) {
      alert(`Error importing GDS: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    setGdsImportState({ isOpen: false, layers: [], objectCounts: new Map(), fileBuffer: null });
  }, [gdsImportState.fileBuffer, gdsImportState.layers, commandHistory, updateHistoryState]);

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
    setLayers(prev => prev.map(layer =>
      layer.id === layerId ? { ...layer, visible: !layer.visible } : layer
    ));

    // Also toggle visibility of all shapes in this layer
    setShapes(prev => {
      const layer = layers.find(l => l.id === layerId);
      const newVisible = layer ? !layer.visible : true;
      return prev.map(shape =>
        shape.layerId === layerId ? { ...shape, visible: newVisible } : shape
      );
    });
  }, [layers]);

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
        scaleFactor={scaleFactor}
        onApplyScale={handleApplyScale}
        gridSettings={gridSettings}
        onGridSettingsChange={setGridSettings}
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
            shapes={shapes}
            onAddPoint={handleAddPoint}
            drawingMode={drawingMode}
            tempPoints={tempPoints}
            showIntersections={showIntersections}
            showStats={showStats}
            onIntersectionComputingChange={setIsComputingIntersections}
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
          selectedShapeIds={selectedShapeIds}
          onLayerCreate={handleLayerCreate}
          onLayerUpdate={handleLayerUpdate}
          onLayerDelete={handleLayerDelete}
          onAssignShapesToLayer={handleAssignShapesToLayer}
          onRemoveShapesFromLayer={handleRemoveShapesFromLayer}
          onSelectShapes={handleSelectShapes}
          onToggleLayerVisibility={handleToggleLayerVisibility}
        />
      </div>

      {gdsImportState.isOpen && (
        <GdsImportDialog
          layers={gdsImportState.layers}
          objectCounts={gdsImportState.objectCounts}
          hasExistingContent={shapes.length > 0 || layers.length > 0}
          onConfirm={handleGdsImportConfirm}
          onCancel={handleGdsImportCancel}
        />
      )}
    </div>
  );
}

export default App;
