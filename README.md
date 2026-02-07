# ExScroller Game Studio 2

Visual + Code dual-mode editor for ExScroller thermal printer games.

## Features

- **Visual Editor**: Drag-and-drop objects on a receipt-like canvas
- **Code Editor**: Direct JavaScript editing with syntax highlighting
- **Split View**: See visual and code side-by-side
- **Live Preview**: 1-bit thermal printer preview
- **Object Types**: Text, Rectangle, Circle, Line, Image, Sprite
- **Game Patterns**: REVEAL, LOOP, FEEDER, SYNC, BACKLOG, GENERATOR

## Quick Start

```bash
npm install
npm run dev
```

Open http://localhost:5173 in your browser.

## Documentation

| Document | Description |
|----------|-------------|
| [VISION.md](docs/VISION.md) | プロジェクトビジョン、入力デバイス仕様 |
| [GAME_PATTERNS.md](docs/GAME_PATTERNS.md) | ゲームパターン詳細（7パターン） |
| [ROADMAP.md](docs/ROADMAP.md) | 実装ロードマップ（Phase 1-6） |
| [ARCHITECTURE.md](docs/ARCHITECTURE.md) | 技術アーキテクチャ |

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                    ExScroller Game Studio 2                   │
├──────────────────────────────────────────────────────────────┤
│  ┌────────────────┐  ┌────────────────┐  ┌────────────────┐  │
│  │ Visual Editor  │  │  Code Editor   │  │    Preview     │  │
│  │   (Konva.js)   │  │   (Monaco)     │  │   (Canvas)     │  │
│  └───────┬────────┘  └───────┬────────┘  └───────┬────────┘  │
│          │                   │                   │           │
│          ▼                   ▼                   ▼           │
│  ┌───────────────────────────────────────────────────────┐   │
│  │                    SceneModel                          │   │
│  │            (Single Source of Truth)                    │   │
│  └───────────────────────────────────────────────────────┘   │
│                              │                               │
│                              ▼                               │
│  ┌───────────────────────────────────────────────────────┐   │
│  │                   ExScroller SDK                       │   │
│  │        (Game, Section, PGP, Printer classes)           │   │
│  └───────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────┘
```

## Game Patterns

| Pattern | Players | Connection | Description |
|---------|---------|------------|-------------|
| REVEAL | 1 | Local | 一方向探索、ノベルゲーム |
| LOOP | 1 | Local | 巻き戻し可能、タイムループ |
| FEEDER | 2 | WiFi | 送り手+プレイヤー、TRPG |
| SYNC | 2+ | WiFi | 同期マルチ、協力/対決 |
| BACKLOG | 2+ | Local | ログ継承、紙を渡す |
| GENERATOR | 1+ | Local | カード/タイル生成 |
| VERSUS | 2 | Local | 対戦、陣取り |

## Input Devices (v10.7.0+)

**Buttons**: A, B, X, Y, L, R (6 buttons, bit mask)
**Fader**: 10kΩ potentiometer (0-4095, 12bit ADC)
**Feed Modes**: AUTO, BUTTON, FADER

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
├── docs/
│   ├── VISION.md
│   ├── GAME_PATTERNS.md
│   ├── ROADMAP.md
│   └── ARCHITECTURE.md
└── package.json
```

## Roadmap Summary

| Phase | Features | Status |
|-------|----------|--------|
| v0.1.0 | Basic editor, preview | ✅ Done |
| v0.2.0 | Transform handles, undo/redo | 🔄 Next |
| v0.3.0 | Bidirectional code sync | Planned |
| v0.4.0 | Flow View (node graph) | Planned |
| v0.5.0 | Game pattern templates | Planned |
| v0.6.0 | Printer connection | Planned |
| v1.0.0 | Full release | Planned |

## Version

v0.2.0.2026.0207
