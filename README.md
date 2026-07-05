<div align="center">

# Topology Viewer

**A fast, browser-based GDSII / GDS2 layout viewer and editor — draw, import, and inspect polygons and polylines on a WebGL canvas.**

[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Vite](https://img.shields.io/badge/Vite-8-646CFF?logo=vite&logoColor=white)](https://vite.dev)
[![WebGL2](https://img.shields.io/badge/Rendering-WebGL2-990000?logo=webgl&logoColor=white)](https://developer.mozilla.org/docs/Web/API/WebGL2RenderingContext)

</div>

---

Topology Viewer is a lightweight, web-based tool for viewing and editing 2D geometric topology — **chains** (open polylines) and **contours** (closed polygons). It reads industry-standard **GDSII** (`.gds` / `.gds2`) binary layout files as well as plain text, renders everything on a hardware-accelerated **WebGL2** canvas, and detects intersections between shapes in a background worker. No installation, no plugins — it runs entirely in your browser.

Ideal for quickly inspecting **IC / semiconductor layout** geometry, CAD contours, and any polygon/polyline dataset without opening heavyweight EDA software.

## ✨ Features

- 🖊️ **Draw** — create chains and contours by clicking points on the canvas
- 📂 **Import / Export** — GDSII binary (`.gds`, `.gds2`) and text (`.txt`, `.csv`)
- 🗂️ **Layers** — colored layers with visibility toggles, auto-created on GDS import
- ✂️ **Intersection detection** — point and overlap intersections, computed in a Web Worker
- ⚡ **WebGL2 rendering** — GPU-buffered geometry; pan/zoom cost is independent of scene size
- 🔍 **Pan & Zoom** — mouse-wheel zoom, Alt-drag or middle-button pan
- 🧭 **Grid overlay** — configurable window size and step
- 📐 **Units-aware** — reads the GDSII `UNITS` record; coordinates preserved in raw DB units
- ↩️ **Undo / Redo** — full command history
- 🚀 **Large layouts** — spatial-index viewport culling and level-of-detail rendering

## 🚀 Quick Start

**Requirements:** Node.js 20+ and npm.

```bash
git clone git@github.com:zheltovs/topology-viewer.git
cd topology-viewer
npm install
npm run dev
```

Open the URL Vite prints (default `http://localhost:5173`) and start drawing or importing files.

### Build for production

```bash
npm run build     # type-check + bundle to dist/
npm run preview   # preview the production build locally
```

### Docker

```bash
docker compose --profile dev up --build    # development server
docker compose --profile prod up --build   # nginx-served production build
```

## ⌨️ Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `Ctrl+1` | Chain drawing mode |
| `Ctrl+2` | Contour drawing mode |
| `Ctrl+Z` | Undo |
| `Ctrl+Y` / `Ctrl+Shift+Z` | Redo |
| `Ctrl+I` | Toggle stats overlay |
| `Esc` | Finish drawing / cancel |

## 📄 Text Import Format

One shape per line, comma-separated coordinates:

```
x1, y1, x2, y2, x3, y3, ...
```

The type is inferred automatically: if the first and last points match it's a **contour** (closed polygon), otherwise a **chain** (open polyline). See [EXAMPLES.md](EXAMPLES.md) for ready-to-import samples.

## 🛠️ Tech Stack

- **React 19** + **TypeScript** — UI and application state
- **Vite 8** — dev server and build
- **WebGL2** — geometry rendering ([earcut](https://github.com/mapbox/earcut) polygon triangulation)
- **Web Workers** — off-main-thread intersection detection
- Spatial index for viewport culling and LOD

## 📁 Project Structure

```
src/
├── components/   UI (Canvas, Toolbar, panels, GDS import dialog)
├── rendering/    WebGL2 renderer
├── parsers/      GDSII + text parsing, units handling
├── services/     intersection detection, spatial index, command history
├── workers/      intersection Web Worker
├── models/       Point, Segment, Shape, Layer
└── hooks/        keyboard shortcuts
```

## 🤝 Contributing

Issues and pull requests are welcome. Run `npm run lint` before submitting.

---

<div align="center">
<sub>Keywords: GDSII viewer · GDS2 parser · IC layout · semiconductor topology · polygon editor · WebGL canvas · React · TypeScript</sub>
</div>
