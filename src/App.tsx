import { useState, useCallback, useEffect } from 'react';
import { Canvas, ObjectsPanel, Toolbar } from './components';
import { Point, Chain, Contour } from './models';
import type { Shape } from './models';
import { CommandHistory, AddShapeCommand, RemoveShapeCommand } from './services';
import { useKeyboardShortcuts } from './hooks/useKeyboard';
import { ParserRegistry } from './parsers';
import './App.css';

function App() {
  const [shapes, setShapes] = useState<Shape[]>([]);
  const [drawingMode, setDrawingMode] = useState<'chain' | 'contour' | null>(null);
  const [tempPoints, setTempPoints] = useState<Point[]>([]);
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

  // Handle shift key release for contour auto-close
  useKeyboardShortcuts({
    onUndo: () => {
      if (commandHistory.undo()) {
        updateHistoryState();
      }
    },
    onRedo: () => {
      if (commandHistory.redo()) {
        updateHistoryState();
      }
    },
    onEscape: () => {
      if (drawingMode) {
        finishDrawing();
      }
    },
    onChainMode: () => {
      setDrawingMode(prev => prev === 'chain' ? null : 'chain');
      setTempPoints([]);
    },
    onContourMode: () => {
      setDrawingMode(prev => prev === 'contour' ? null : 'contour');
      setTempPoints([]);
    }
  });

  // Toggle shape visibility
  const handleToggleVisibility = useCallback((shapeId: string) => {
    const shape = shapes.find(s => s.id === shapeId);
    if (shape) {
      shape.visible = !shape.visible;
      setShapes([...shapes]);
    }
  }, [shapes]);

  // Select shape
  const handleSelectShape = useCallback((shapeId: string) => {
    shapes.forEach(s => s.selected = s.id === shapeId);
    setShapes([...shapes]);
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
    input.accept = '.txt,.csv';

    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      try {
        const content = await file.text();
        const lines = content.trim().split('\n');

        const parser = parserRegistry.getParser();

        for (const line of lines) {
          if (!line.trim()) continue;

          // Format: "chain: x1, y1, x2, y2, ..." or "contour: x1, y1, x2, y2, ..."
          const colonIndex = line.indexOf(':');
          if (colonIndex === -1) {
            console.warn('Invalid line format (missing colon):', line);
            continue;
          }

          const type = line.substring(0, colonIndex).trim().toLowerCase();
          const coords = line.substring(colonIndex + 1).trim();

          let newShape: Shape;
          if (type === 'chain') {
            newShape = parser.parseChain(coords);
          } else if (type === 'contour') {
            newShape = parser.parseContour(coords);
          } else {
            console.warn('Unknown type:', type);
            continue;
          }

          const command = new AddShapeCommand(shapes, newShape);
          commandHistory.executeCommand(command);
        }

        updateHistoryState();
      } catch (error) {
        alert(`Error reading file: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    };

    input.click();
  }, [shapes, commandHistory, updateHistoryState, parserRegistry]);

  return (
    <div className="app">
      <Toolbar
        drawingMode={drawingMode}
        onSetDrawingMode={(mode) => {
          setDrawingMode(mode);
          setTempPoints([]);
        }}
        onImport={handleImport}
        canUndo={canUndo}
        canRedo={canRedo}
        onUndo={() => {
          if (commandHistory.undo()) {
            updateHistoryState();
          }
        }}
        onRedo={() => {
          if (commandHistory.redo()) {
            updateHistoryState();
          }
        }}
      />

      <div className="workspace">
        <div className="canvas-container">
          <Canvas
            shapes={shapes}
            onAddPoint={handleAddPoint}
            drawingMode={drawingMode}
            tempPoints={tempPoints}
          />
        </div>

        <ObjectsPanel
          shapes={shapes}
          onToggleVisibility={handleToggleVisibility}
          onSelectShape={handleSelectShape}
          onDeleteShape={handleDeleteShape}
          onChangeColor={handleChangeColor}
        />
      </div>
    </div>
  );
}

export default App;
