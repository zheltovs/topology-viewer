# Example Shapes

This file contains example shapes you can import into the topology viewer.

## File Format

Each line contains comma-separated coordinates:

```
x1, y1, x2, y2, x3, y3, ...
```

The shape type is determined automatically:
- If the first and last points are the same → **contour** (closed polygon)
- Otherwise → **chain** (open polyline)

## Example File Content

Save this content to a .txt file and use the Import button:

```
0, 0, 5, 10, 10, 0, 15, 10, 20, 0
0, 0, 10.5, 0, 5.25, 9.1, 0, 0
0, 0, 10, 0, 10, 10, 0, 10, 0, 0
0, 10, 9.51, 3.09, 5.88, -8.09, -5.88, -8.09, -9.51, 3.09, 0, 10
0, 0, 10, 0, 10, 10, -5, 10, -5, -5, 15, -5, 15, 15, -10, 15
0, 10, 2.4, 3.1, 9.5, 3.1, 3.8, -1, 6, -8, 0, -3, -6, -8, -3.8, -1, -9.5, 3.1, -2.4, 3.1, 0, 10
```

## Individual Examples

### Triangle (Contour)
Repeat the first point at the end to close the shape:
```
0, 0, 10.5, 0, 5.25, 9.1, 0, 0
```

### Square (Contour)
```
0, 0, 10, 0, 10, 10, 0, 10, 0, 0
```

### Zigzag Line (Chain)
First and last points differ — treated as a chain:
```
0, 0, 5, 10, 10, 0, 15, 10, 20, 0
```

### Pentagon (Contour)
```
0, 10, 9.51, 3.09, 5.88, -8.09, -5.88, -8.09, -9.51, 3.09, 0, 10
```

### Spiral-like Chain
```
0, 0, 10, 0, 10, 10, -5, 10, -5, -5, 15, -5, 15, 15, -10, 15
```

### Star (Contour)
```
0, 10, 2.4, 3.1, 9.5, 3.1, 3.8, -1, 6, -8, 0, -3, -6, -8, -3.8, -1, -9.5, 3.1, -2.4, 3.1, 0, 10
```

## How to Use

1. Click the "📥 Import" button in the toolbar
2. Select the example file (example-shapes.txt) or create your own
3. All shapes will be loaded onto the canvas

You can also draw shapes manually:
- Click "📏 Chain" or "⬡ Contour" buttons
- Click on the canvas to add points
- Press Esc to finish
