# ExScroller Game Studio 2

Visual + Code dual-mode editor for ExScroller thermal printer games.

## Features

- **Visual Editor**: Drag-and-drop objects on a receipt-like canvas
- **Code Editor**: Direct JavaScript editing with syntax highlighting
- **Split View**: See visual and code side-by-side
- **Live Preview**: 1-bit thermal printer preview
- **Object Types**: Text, Rectangle, Circle, Line, Image, Sprite

## Quick Start

```bash
npm install
npm run dev
```

Open http://localhost:5173 in your browser.

## Architecture

```
┌─────────────────────────────────────────────┐
│ Visual Editor (Konva.js)                    │
│   - Drag, rotate, resize objects            │
│   - Selection with transform handles        │
└─────────────────────────────────────────────┘
          ↓ SceneModel (shared) ↑
┌─────────────────────────────────────────────┐
│ Code Editor (textarea)                      │
│   - JavaScript syntax                       │
│   - ExScroller SDK API                      │
└─────────────────────────────────────────────┘
          ↓
┌─────────────────────────────────────────────┐
│ Preview Renderer                            │
│   - 1-bit dithered output                   │
│   - Matches thermal print result            │
└─────────────────────────────────────────────┘
```

## Project Structure

```
exscroller-studio2/
├── index.html          # Main HTML
├── src/
│   ├── main.js         # App entry point
│   ├── model.js        # Shared data model
│   ├── visual-editor.js # Konva-based visual editor
│   ├── code-generator.js # Model → Code
│   ├── preview.js      # 1-bit preview renderer
│   └── styles.css      # Styling
└── package.json
```

## Roadmap

- [ ] Code → Model parsing (bidirectional sync)
- [ ] Monaco Editor integration
- [ ] Image import with dithering
- [ ] Sprite editor
- [ ] Printer connection
- [ ] Export to .pgp binary

## Version

v0.1.0.2026.0207
