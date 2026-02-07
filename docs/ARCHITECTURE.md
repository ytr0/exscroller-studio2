# Studio 2 Architecture - 技術アーキテクチャ

**Version**: 0.2.0
**Date**: 2026.02.07

---

## 1. システム概要

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
│          │                   │                   │           │
│          ▼                   ▼                   ▼           │
│  ┌────────────────┐  ┌────────────────┐  ┌────────────────┐  │
│  │ Code Generator │  │  Code Parser   │  │ Frame Compiler │  │
│  └────────────────┘  └────────────────┘  └────────────────┘  │
│                              │                               │
│                              ▼                               │
│  ┌───────────────────────────────────────────────────────┐   │
│  │                   ExScroller SDK                       │   │
│  │        (Game, Section, PGP, Printer classes)           │   │
│  └───────────────────────────────────────────────────────┘   │
│                              │                               │
│                              ▼                               │
│  ┌───────────────────────────────────────────────────────┐   │
│  │                  Hardware Layer                        │   │
│  │         (Web Serial / WiFi → Pico 2W)                  │   │
│  └───────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────┘
```

---

## 2. コンポーネント詳細

### 2.1 Visual Editor (visual-editor.js)

Konva.jsベースのビジュアル編集コンポーネント。

```javascript
class VisualEditor {
  constructor(container, model) {
    this.stage = new Konva.Stage({ container, width, height });
    this.layer = new Konva.Layer();
    this.transformer = new Konva.Transformer();
    this.model = model;
  }

  // オブジェクト追加
  addObject(type, props) {
    const shape = this.createShape(type, props);
    this.layer.add(shape);
    this.model.addObject({ type, ...props });
  }

  // Model変更を反映
  syncFromModel() {
    this.layer.destroyChildren();
    for (const obj of this.model.objects) {
      const shape = this.createShape(obj.type, obj);
      this.layer.add(shape);
    }
  }

  // Konva Shape生成
  createShape(type, props) {
    switch (type) {
      case 'text':
        return new Konva.Text({ ...props });
      case 'rect':
        return new Konva.Rect({ ...props });
      case 'circle':
        return new Konva.Circle({ ...props });
      // ...
    }
  }
}
```

### 2.2 SceneModel (model.js)

全てのデータを保持する中央モデル。Observer パターンで変更を通知。

```javascript
class SceneModel extends EventTarget {
  constructor() {
    super();
    this.sections = new Map();
    this.flow = [];
    this.sprites = new Map();
    this.variables = [];
  }

  // セクション操作
  addSection(id, options = {}) {
    const section = { id, objects: [], ...options };
    this.sections.set(id, section);
    this.emit('section:add', section);
    return section;
  }

  // オブジェクト操作
  addObject(sectionId, object) {
    const section = this.sections.get(sectionId);
    const obj = { id: this.generateId(), ...object };
    section.objects.push(obj);
    this.emit('object:add', { sectionId, object: obj });
    return obj;
  }

  updateObject(sectionId, objectId, changes) {
    const obj = this.findObject(sectionId, objectId);
    Object.assign(obj, changes);
    this.emit('object:update', { sectionId, objectId, changes });
  }

  // イベント発火
  emit(event, detail) {
    this.dispatchEvent(new CustomEvent(event, { detail }));
  }
}
```

### 2.3 Code Generator (code-generator.js)

ModelからJavaScriptコードを生成。

```javascript
class CodeGenerator {
  generate(model) {
    const lines = [];

    lines.push(`const game = new Game();`);
    lines.push(``);

    // セクション生成
    for (const [id, section] of model.sections) {
      lines.push(`const ${id} = game.section('${id}');`);

      for (const obj of section.objects) {
        lines.push(this.generateObjectCode(id, obj));
      }

      lines.push(``);
    }

    // フロー生成
    if (model.flow.length > 0) {
      lines.push(`game.setFlow([${model.flow.map(f => `'${f}'`).join(', ')}]);`);
    }

    return lines.join('\n');
  }

  generateObjectCode(sectionId, obj) {
    switch (obj.type) {
      case 'text':
        return `${sectionId}.text(${obj.x}, '${obj.content}', ${JSON.stringify(obj.options || {})});`;
      case 'rect':
        return `${sectionId}.rect(${obj.x}, ${obj.y}, ${obj.width}, ${obj.height}, ${obj.fill || false});`;
      case 'sprite':
        return `${sectionId}.sprite(${obj.spriteId}, ${obj.x}, ${obj.y});`;
      // ...
    }
  }
}
```

### 2.4 Code Parser (code-parser.js) [未実装]

JavaScriptコードからModelを再構築。

```javascript
class CodeParser {
  parse(code) {
    const model = new SceneModel();

    // AST解析
    const ast = acorn.parse(code, { ecmaVersion: 2020 });

    for (const node of ast.body) {
      if (this.isSectionDeclaration(node)) {
        const section = this.parseSection(node);
        model.addSection(section.id, section);
      }

      if (this.isMethodCall(node)) {
        this.parseMethodCall(model, node);
      }
    }

    return model;
  }

  // section.text(x, 'content') をパース
  parseMethodCall(model, node) {
    const method = node.expression.callee.property.name;
    const sectionId = node.expression.callee.object.name;
    const args = node.expression.arguments;

    switch (method) {
      case 'text':
        model.addObject(sectionId, {
          type: 'text',
          x: args[0].value,
          content: args[1].value,
          options: args[2] ? this.parseOptions(args[2]) : {}
        });
        break;
      // ...
    }
  }
}
```

### 2.5 Preview Renderer (preview.js)

1-bitディザリングプレビュー。

```javascript
class PreviewRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.width = 576;  // サーマルプリンタ幅
  }

  render(model, sectionId) {
    // クリア
    this.ctx.fillStyle = 'white';
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    const section = model.sections.get(sectionId);
    if (!section) return;

    // オブジェクト描画
    for (const obj of section.objects) {
      this.renderObject(obj);
    }

    // 1-bitディザリング
    const imageData = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
    const dithered = this.floydSteinberg(imageData);
    this.ctx.putImageData(dithered, 0, 0);
  }

  floydSteinberg(imageData) {
    // Floyd-Steinbergディザリング実装
    // ...
  }
}
```

### 2.6 Flow View (flow-view.js) [未実装]

ノードグラフエディタ。

```javascript
class FlowView {
  constructor(container, model) {
    this.stage = new Konva.Stage({ container });
    this.nodesLayer = new Konva.Layer();
    this.edgesLayer = new Konva.Layer();
    this.model = model;
  }

  // ノード追加
  addNode(sectionId) {
    const node = new FlowNode(sectionId, this.model.sections.get(sectionId));
    this.nodes.set(sectionId, node);
    this.nodesLayer.add(node.group);
  }

  // エッジ追加
  addEdge(fromId, toId, trigger) {
    const edge = new FlowEdge(
      this.nodes.get(fromId),
      this.nodes.get(toId),
      trigger
    );
    this.edges.push(edge);
    this.edgesLayer.add(edge.line);
  }

  // 自動レイアウト
  autoLayout() {
    // Dagre.jsで自動配置
    const g = new dagre.graphlib.Graph();
    g.setGraph({ rankdir: 'TB' });
    // ...
  }
}

class FlowNode {
  constructor(id, section) {
    this.group = new Konva.Group({ draggable: true });
    this.rect = new Konva.Rect({ width: 120, height: 60 });
    this.text = new Konva.Text({ text: id });
    this.ports = this.createPorts();
  }
}
```

---

## 3. データフロー

### 3.1 ビジュアル編集時

```
User Drag/Drop
      │
      ▼
┌─────────────┐
│   Konva.js  │  ── onDragEnd ──▶ ┌─────────────┐
│   Shape     │                    │ SceneModel  │
└─────────────┘                    └──────┬──────┘
                                          │
                        ┌─────────────────┼─────────────────┐
                        ▼                 ▼                 ▼
                 ┌────────────┐   ┌────────────┐   ┌────────────┐
                 │Code Editor │   │  Preview   │   │  Flow View │
                 │ (regenerate)│  │ (re-render)│   │ (update)   │
                 └────────────┘   └────────────┘   └────────────┘
```

### 3.2 コード編集時

```
User Types Code
      │
      ▼
┌─────────────┐
│   Monaco    │  ── onChange ──▶ ┌─────────────┐
│   Editor    │                   │ CodeParser  │
└─────────────┘                   └──────┬──────┘
                                         │
                                         ▼
                                  ┌─────────────┐
                                  │ SceneModel  │
                                  └──────┬──────┘
                                         │
                        ┌────────────────┼────────────────┐
                        ▼                ▼                ▼
                 ┌────────────┐  ┌────────────┐  ┌────────────┐
                 │Visual Editor│ │  Preview   │  │  Flow View │
                 │ (sync)      │ │ (re-render)│  │ (update)   │
                 └────────────┘  └────────────┘  └────────────┘
```

### 3.3 印刷時

```
User Click "Print"
      │
      ▼
┌─────────────┐
│ SceneModel  │
└──────┬──────┘
       │
       ▼
┌─────────────┐
│   Game      │ ◀── compile() ──▶ ┌─────────────┐
│  Instance   │                    │ PGP Frames  │
└─────────────┘                    └──────┬──────┘
                                          │
                                          ▼
                                   ┌─────────────┐
                                   │   Printer   │
                                   │   .send()   │
                                   └──────┬──────┘
                                          │
                                          ▼
                                   ┌─────────────┐
                                   │ Web Serial  │
                                   │  / WiFi     │
                                   └─────────────┘
```

---

## 4. ファイル構成

```
exscroller-studio2/
├── index.html              # エントリーHTML
├── package.json            # 依存関係
├── vite.config.js          # Vite設定
├── src/
│   ├── main.js             # アプリエントリ
│   ├── model.js            # SceneModel
│   ├── visual-editor.js    # Konva.jsビジュアルエディタ
│   ├── code-editor.js      # Monaco統合 [未実装]
│   ├── code-generator.js   # Model → Code
│   ├── code-parser.js      # Code → Model [未実装]
│   ├── preview.js          # 1-bitプレビュー
│   ├── flow-view.js        # ノードグラフ [未実装]
│   ├── printer.js          # プリンター接続 [未実装]
│   ├── templates/          # ゲームパターンテンプレート [未実装]
│   │   ├── reveal.js
│   │   ├── loop.js
│   │   └── ...
│   └── styles.css          # スタイル
├── docs/
│   ├── VISION.md           # ビジョン
│   ├── GAME_PATTERNS.md    # ゲームパターン
│   ├── ROADMAP.md          # ロードマップ
│   └── ARCHITECTURE.md     # 本ドキュメント
└── README.md               # 概要
```

---

## 5. 依存ライブラリ

| ライブラリ | 用途 | バージョン |
|-----------|------|-----------|
| Vite | ビルドツール | ^5.4 |
| Konva.js | Canvasライブラリ | ^9.3 |
| Monaco Editor | コードエディタ | ^0.45 |
| Dagre | グラフレイアウト | ^0.8 |
| ExScroller SDK | ゲームSDK | 最新 (CDN) |

---

## 6. 状態管理

### 6.1 SceneModel の状態

```typescript
interface SceneModel {
  // メタデータ
  meta: {
    title: string;
    pattern: 'REVEAL' | 'LOOP' | 'FEEDER' | 'SYNC' | 'BACKLOG' | 'GENERATOR';
    version: string;
  };

  // セクション
  sections: Map<string, Section>;

  // フロー（遷移順序）
  flow: string[];

  // スプライト定義
  sprites: Map<number, SpriteData>;

  // 変数
  variables: VariableDefinition[];

  // 現在の編集状態
  activeSection: string | null;
  selectedObjects: string[];
  undoStack: Action[];
  redoStack: Action[];
}

interface Section {
  id: string;
  objects: SceneObject[];
  feedMode: 'auto' | 'button' | 'fader';
  speed: number;
  maxLines: number;
}

interface SceneObject {
  id: string;
  type: 'text' | 'rect' | 'circle' | 'line' | 'image' | 'sprite';
  x: number;
  y: number;
  width?: number;
  height?: number;
  rotation?: number;
  // type-specific properties...
}
```

### 6.2 Undo/Redo

```javascript
class UndoManager {
  constructor(model) {
    this.model = model;
    this.undoStack = [];
    this.redoStack = [];
  }

  execute(action) {
    action.execute(this.model);
    this.undoStack.push(action);
    this.redoStack = [];  // 新しいアクションでredoクリア
  }

  undo() {
    const action = this.undoStack.pop();
    if (action) {
      action.undo(this.model);
      this.redoStack.push(action);
    }
  }

  redo() {
    const action = this.redoStack.pop();
    if (action) {
      action.execute(this.model);
      this.undoStack.push(action);
    }
  }
}

class AddObjectAction {
  constructor(sectionId, object) {
    this.sectionId = sectionId;
    this.object = object;
  }

  execute(model) {
    model.addObject(this.sectionId, this.object);
  }

  undo(model) {
    model.removeObject(this.sectionId, this.object.id);
  }
}
```

---

## 7. 今後の拡張ポイント

| 拡張 | 影響範囲 | 複雑度 |
|------|----------|--------|
| プラグインシステム | main.js + 全エディタ | 高 |
| コラボ編集 | model.js + 通信層 | 高 |
| カスタムオブジェクト | visual-editor + generator | 中 |
| テーマ切り替え | styles.css | 低 |
| 多言語対応 | 全ファイル | 中 |
