# Example Shapes

This file contains example shapes you can import into the topology viewer.

## File Format

Each line contains a type (`chain` or `contour`) followed by coordinates:

```
type: x1, y1, x2, y2, x3, y3, ...
```

## Example File Content

Save this content to a .txt file and use the Import button:

```
chain: 0, 0, 5, 10, 10, 0, 15, 10, 20, 0
contour: 0, 0, 10.5, 0, 5.25, 9.1
contour: 0, 0, 10, 0, 10, 10, 0, 10
contour: 0, 10, 9.51, 3.09, 5.88, -8.09, -5.88, -8.09, -9.51, 3.09
chain: 0, 0, 10, 0, 10, 10, -5, 10, -5, -5, 15, -5, 15, 15, -10, 15
contour: 0, 10, 2.4, 3.1, 9.5, 3.1, 3.8, -1, 6, -8, 0, -3, -6, -8, -3.8, -1, -9.5, 3.1, -2.4, 3.1
```

## Individual Examples

### Triangle (Contour)
```
contour: 0, 0, 10.5, 0, 5.25, 9.1
```

### Square (Contour)
```
contour: 0, 0, 10, 0, 10, 10, 0, 10
```

### Zigzag Line (Chain)
```
chain: 0, 0, 5, 10, 10, 0, 15, 10, 20, 0
```

### Pentagon (Contour)
```
contour: 0, 10, 9.51, 3.09, 5.88, -8.09, -5.88, -8.09, -9.51, 3.09
```

### Spiral-like Chain
```
chain: 0, 0, 10, 0, 10, 10, -5, 10, -5, -5, 15, -5, 15, 15, -10, 15
```

### Star (Contour)
```
contour: 0, 10, 2.4, 3.1, 9.5, 3.1, 3.8, -1, 6, -8, 0, -3, -6, -8, -3.8, -1, -9.5, 3.1, -2.4, 3.1
```

## How to Use

1. Click the "📥 Import" button in the toolbar
2. Select the example file (example-shapes.txt) or create your own
3. All shapes will be loaded onto the canvas

You can also draw shapes manually:
- Click "📏 Chain" or "⬡ Contour" buttons
- Click on the canvas to add points
- Press Esc to finish
