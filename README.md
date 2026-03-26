# Topology Viewer

Web-based viewer/editor for geometric topology — chains (open polylines) and contours (closed polygons) on an interactive HTML5 Canvas.

## Features

- **Drawing** — create chains and contours by clicking points on the canvas
- **Layers** — organize shapes into colored layers with visibility toggles (auto-created on GDS2 import)
- **Import / Export** — text files (`.txt`, `.csv`) and binary GDS2 (`.gds`, `.gds2`)
- **Intersection detection** — find point and overlap intersections between shapes (runs in a Web Worker)
- **Configurable grid overlay** — adjustable window size and step
- **Scale divisor** — divide all coordinates by a given factor
- **Pan & Zoom** — mouse wheel zoom, Alt+drag or middle-button pan
- **Undo / Redo** — full command history
- **Viewport culling & LOD** — efficient rendering via spatial index

### Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `Ctrl+1` | Chain drawing mode |
| `Ctrl+2` | Contour drawing mode |
| `Ctrl+Z` | Undo |
| `Ctrl+Y` / `Ctrl+Shift+Z` | Redo |
| `Ctrl+I` | Toggle stats overlay |
| `Esc` | Finish drawing / cancel |

### Import Format (text)

One shape per line: `type: x1, y1, x2, y2, ...` where type is `chain` or `contour` (see [EXAMPLES.md](EXAMPLES.md)).

## Development

### Prerequisites

Node.js 20+ and npm.

### Local

```bash
npm install
npm run dev          # http://localhost:5173
```

### Docker

```bash
docker compose --profile dev up --build    # dev с hot reload на :5173
docker compose --profile prod up --build   # prod nginx на :80
```

### Build

```bash
npm run build        # выход в dist/
npm run preview      # preview production build
```

### Deploy (GitHub Pages)

Push в `main` → GitHub Actions собирает и деплоит автоматически (см. `.github/workflows/deploy.yml`).

## Tech Stack

React 19 · TypeScript · Vite · HTML5 Canvas
