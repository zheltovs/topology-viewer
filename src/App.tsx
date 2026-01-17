import { useState, useCallback } from 'react';
import { Canvas, SidePanel, Toolbar } from './components';
import { Point, Chain, Contour } from './models';
import type { Shape, Layer } from './models';
import { CommandHistory, AddShapeCommand, RemoveShapeCommand } from './services';
import { useKeyboardShortcuts } from './hooks/useKeyboard';
import { ParserRegistry, Gds2Parser } from './parsers';
import './App.css';

function App() {
  const [shapes, setShapes] = useState<Shape[]>([]);
  const [layers, setLayers] = useState<Layer[]>([]);
  const [selectedShapeIds, setSelectedShapeIds] = useState<string[]>([]);
  const [drawingMode, setDrawingMode] = useState<'chain' | 'contour' | null>(null);
  const [tempPoints, setTempPoints] = useState<Point[]>([]);
  const [showIntersections, setShowIntersections] = useState(false);
  const [commandHistory] = useState(() => {
    const history = new CommandHistory();
    history.setOnStateChange(setShapes);
    return history;
  });
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
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

  // Register keyboard shortcuts
  useKeyboardShortcuts({
    onUndo: handleUndo,
    onRedo: handleRedo,
    onEscape: handleEscape,
    onChainMode: handleChainMode,
    onContourMode: handleContourMode
  });

  // Toggle shape visibility
  const handleToggleVisibility = useCallback((shapeId: string) => {
    const shape = shapes.find(s => s.id === shapeId);
    if (shape) {
      shape.visible = !shape.visible;
      setShapes([...shapes]);
    }
  }, [shapes]);

  // Select shape (toggle if already selected)
  const handleSelectShape = useCallback((shapeId: string) => {
    const shape = shapes.find(s => s.id === shapeId);
    if (shape && shape.selected) {
      // Deselect if already selected
      shape.selected = false;
      setShapes([...shapes]);
      setSelectedShapeIds([]);
    } else {
      // Select new shape
      shapes.forEach(s => s.selected = s.id === shapeId);
      setShapes([...shapes]);
      setSelectedShapeIds([shapeId]);
    }
  }, [shapes]);

  // Select multiple shapes (for layers panel)
  const handleSelectShapes = useCallback((shapeIds: string[]) => {
    shapes.forEach(s => s.selected = shapeIds.includes(s.id));
    setShapes([...shapes]);
    setSelectedShapeIds(shapeIds);
  }, [shapes]);

  // Delete shape
  const handleDeleteShape = useCallback((shapeId: string) => {
    const command = new RemoveShapeCommand(shapes, shapeId);
    commandHistory.executeCommand(command);
    updateHistoryState();
  }, [shapes, commandHistory, updateHistoryState]);

  // Change shape color
  const handleChangeColor = useCallback((shapeId: string, color: string) => {
    const shape = shapes.find(s => s.id === shapeId);
    if (shape) {
      shape.color = color;
      setShapes([...shapes]);
    }
  }, [shapes]);

  // Handle import from file
  const handleImport = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.txt,.csv,.gds,.gds2';

    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      try {
        let newShapes: Shape[] = [];
        let newLayers: Layer[] = [];
        const fileName = file.name.toLowerCase();
        const isGds = fileName.endsWith('.gds') || fileName.endsWith('.gds2');

        if (isGds) {
          const buffer = await file.arrayBuffer();
          const gds2Parser = new Gds2Parser();
          const result = gds2Parser.parseWithLayers(buffer);
          newShapes = result.shapes;
          newLayers = result.layers;
        } else {
          const content = await file.text();
          const lines = content.trim().split('\n');
          const parser = parserRegistry.getParser();

          // First, parse all shapes from the file
          for (const line of lines) {
            if (!line.trim()) continue;

            // Parse points from coordinates
            const points = parser.parsePoints(line.trim());

            if (points.length < 2) {
              console.warn('Skipping line with less than 2 points:', line);
              continue;
            }

            // Auto-detect shape type:
            // If first point equals last point -> contour
            // Otherwise -> chain
            let newShape: Shape;
            const firstPoint = points[0];
            const lastPoint = points[points.length - 1];

            if (firstPoint.equals(lastPoint)) {
              // Contour - first and last points match
              newShape = new Contour(points);
            } else {
              // Chain - first and last points don't match
              newShape = new Chain(points);
            }

            newShapes.push(newShape);
          }
        }

        // Clear existing shapes and add all imported shapes
        if (newShapes.length > 0) {
          // Clear command history and set new shapes directly
          commandHistory.clear();
          setShapes(newShapes);
          setLayers(newLayers);
          setSelectedShapeIds([]);
          updateHistoryState();
        }
      } catch (error) {
        alert(`Error reading file: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    };

    input.click();
  }, [commandHistory, updateHistoryState, parserRegistry]);

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
      />

      <div className="workspace">
        <div className="canvas-container">
          <Canvas
            shapes={shapes}
            onAddPoint={handleAddPoint}
            drawingMode={drawingMode}
            tempPoints={tempPoints}
            showIntersections={showIntersections}
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
    </div>
  );
}

export default App;
