# CLAUDE.md - ExScroller Game Studio 2

## Version: v0.2.1.2026.0207

## プロジェクト概要
サーマルプリンターゲーム用のビジュアル＋コードデュアルモードエディタ

## ドキュメント
| ドキュメント | 内容 |
|-------------|------|
| [docs/VISION.md](docs/VISION.md) | ビジョン、入力デバイス仕様 |
| [docs/GAME_PATTERNS.md](docs/GAME_PATTERNS.md) | 7つのゲームパターン詳細 |
| [docs/ROADMAP.md](docs/ROADMAP.md) | 実装ロードマップ（Phase 1-6） |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | 技術アーキテクチャ |

## 開発フェーズ
**Phase 1: エディタ基盤 (現在) - v0.2.0**

## ディレクトリ構造
```
exscroller-studio2/
├── index.html          # メインHTML
├── src/
│   ├── main.js         # エントリポイント
│   ├── model.js        # SceneModel (Single Source of Truth)
│   ├── visual-editor.js # Konvaベースビジュアルエディタ
│   ├── code-generator.js # Model → Code変換
│   ├── preview.js      # 1-bitプレビューレンダラ
│   └── styles.css      # スタイル
├── docs/               # ドキュメント
│   ├── VISION.md
│   ├── GAME_PATTERNS.md
│   ├── ROADMAP.md
│   └── ARCHITECTURE.md
├── package.json
└── README.md
```

## 技術スタック
- **ビルド**: Vite 5.x
- **キャンバス**: Konva.js 9.x
- **コードエディタ**: プレーンtextarea (Monaco予定)
- **言語**: Vanilla JavaScript (ES Modules)
- **SDK**: ExScroller SDK v2.5.0 (CDN)

## コマンド
```bash
npm run dev      # 開発サーバー起動 (http://localhost:5173)
npm run build    # プロダクションビルド
npm run preview  # ビルド結果プレビュー
```

## ゲームパターン
| パターン | プレイヤー | 接続 | 用途 |
|----------|-----------|------|------|
| REVEAL | 1人 | 不要 | ノベル、ローグライク |
| LOOP | 1人 | 不要 | タイムループ |
| FEEDER | 2人 | WiFi | TRPG、GM主導 |
| SYNC | 2人+ | WiFi | 協力/対決 |
| BACKLOG | 2人+ | 不要 | ログ継承 |
| GENERATOR | 1人+ | 不要 | カード/ボードゲーム生成 |
| VERSUS | 2人 | 不要 | 対戦 |

## 入力デバイス (v10.7.0対応)
- **ボタン**: A, B, X, Y, L, R (ビットマスク)
- **フェーダー**: 10kΩポテンショメーター (0-4095)
- **フィードモード**: AUTO / BUTTON / FADER

## 進捗状況

### ✅ 完了 (v0.1.0)
- [x] プロジェクト基盤セットアップ
- [x] SceneModel: セクション・オブジェクト・スプライト管理
- [x] ビジュアルエディタ: ドラッグ、選択、変形
- [x] コードジェネレータ: Model → ExScroller SDK形式
- [x] プレビューレンダラ: 1-bitディザリング

### ✅ 完了 (v0.2.0)
- [x] ドキュメント整備: VISION, GAME_PATTERNS, ROADMAP, ARCHITECTURE

### ✅ 完了 (v0.2.1)
- [x] プリンター接続 (printer.js - ExScroller SDK連携)
- [x] Connect/Disconnect/Test Print/Print UI
- [x] Speed/Heat スライダー
- [x] 接続状態表示

### ❌ 未実装
- [ ] Transform handles（回転/リサイズハンドル）
- [ ] Undo/Redo
- [ ] Code → Model パーシング（双方向同期）
- [ ] Monaco Editor統合
- [ ] Flow View（ノードグラフ）
- [ ] ゲームパターンテンプレート
- [ ] 画像インポート + ディザリング
- [ ] スプライトエディタ
- [ ] .pgpバイナリエクスポート

## 主要ファイル責務
| ファイル | 責務 |
|---------|------|
| `model.js` | データ層: セクション/オブジェクト/スプライト管理、JSON変換 |
| `visual-editor.js` | ビジュアル編集: Konva Stage/Layer管理、変形同期 |
| `code-generator.js` | コード生成: Model→SDKコード変換 |
| `preview.js` | プレビュー: 1-bitレンダリング |
| `main.js` | コントローラー: 全体統合、イベントハンドリング |

## 次のステップ
1. **Transform handles** - 回転/リサイズのUIハンドル
2. **Undo/Redo** - Command Pattern で履歴管理
3. **Code → Model パーシング** - 双方向同期の実現
