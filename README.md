# Topology Viewer

A powerful web-based tool for visualizing and editing geometric shapes (chains and contours) with an interactive canvas interface.

## Features

- **Interactive Drawing**: Create chains (open polylines) and contours (closed polygons) with click-to-add points
- **Smart Contour Creation**: Contours automatically close when you press Esc
- **Pan & Zoom**: Navigate the canvas with mouse wheel zoom and Alt+drag panning
- **Coordinate Grid**: Axes with labeled coordinates for precise positioning
- **Undo/Redo**: Full history support with Ctrl+Z/Ctrl+Y shortcuts
- **Objects Panel**: View and manage all geometric shapes
- **Import Support**: Import shapes from text files (.txt, .csv) or GDS2 layout files (.gds, .gds2)
- **Double Precision**: All coordinates use double-precision floating-point numbers
- **Extensible Architecture**: Parser interface allows easy addition of new input formats

## Getting Started

### Prerequisites

- Node.js 18+ and npm

### Installation

```bash
npm install
```

### Development

```bash
npm run dev
```

Open your browser to the displayed localhost URL (typically http://localhost:5173)

### Build

```bash
npm run build
```

## Usage

### Drawing Shapes

1. **Draw Chain**: Click the "📏 Chain" button (or press Ctrl+1), then click on the canvas to add points. Press Esc to finish.

2. **Draw Contour**: Click the "⬡ Contour" button (or press Ctrl+2), then click to add points. Press Esc to finish and auto-close the contour.

### Navigation

- **Zoom**: Use mouse wheel
- **Pan**: Hold Alt and drag, or use middle mouse button

### Keyboard Shortcuts

- `Ctrl+1` - Toggle Chain drawing mode
- `Ctrl+2` - Toggle Contour drawing mode
- `Ctrl+Z` - Undo last action
- `Ctrl+Y` - Redo
- `Esc` - Finish current drawing

### Import Formats

#### Text (.txt, .csv)

Import shapes from a text file. Each line should contain the type and coordinates:

```
type: x1, y1, x2, y2, x3, y3, ...
```

Where `type` is either `chain` or `contour`.

Example file (see [example-shapes.txt](example-shapes.txt)):
```
chain: 0, 0, 5, 10, 10, 0, 15, 10, 20, 0
contour: 0, 0, 10.5, 0, 5.25, 9.1
contour: 0, 0, 10, 0, 10, 10, 0, 10
```

#### GDS2 (.gds, .gds2)

Import GDS2 stream files. The importer reads `BOUNDARY` records as contours and `PATH` records as chains, preserving raw integer coordinates (no unit scaling).

To import:
1. Click the "📥 Import" button
2. Select a .txt, .csv, .gds, or .gds2 file
3. All shapes will be loaded onto the canvas

## Architecture

### Project Structure

```
src/
├── components/       # React components (Canvas, Toolbar, ObjectsPanel)
├── models/          # Domain models (Point, Chain, Contour)
├── parsers/         # Input format parsers (extensible)
├── services/        # Business logic (CommandHistory for undo/redo)
├── hooks/           # Custom React hooks (keyboard shortcuts)
└── utils/           # Utility functions
```

### Extensibility

The parser system uses a Strategy pattern, making it easy to add new input formats:

```typescript
class MyCustomParser implements ShapeParser {
  parsePoints(input: string): Point[] {
    // Your custom parsing logic
  }
  // ...
}

// Register your parser
parserRegistry.registerParser('custom', new MyCustomParser());
```

## Technology Stack

- **React 18** - UI framework
- **TypeScript** - Type safety
- **Vite** - Build tool and dev server
- **HTML5 Canvas** - Rendering engine

## License

MIT
