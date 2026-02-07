# Game Patterns - ゲームパターン詳細

**Version**: 0.2.0
**Date**: 2026.02.07

---

## パターン分類マトリクス

|  | ローカル（接続不要） | 接続必要 |
|--|---------------------|----------|
| **1人** | REVEAL, LOOP | AI_GENERATED |
| **2人+** | FEEDER, BACKLOG, GENERATOR | SYNC, VERSUS |

---

## 1. REVEAL（一方向探索）

### 概要
純粋な一方向進行。選択→印刷→選択→印刷…と進み、紙の長さがそのまま冒険の記録になる。

### フロー図
```
プレイヤー → 選択 → 印刷 → 選択 → 印刷 → 結末
                    ↓
              ログが物理的に残る
```

### 適用ジャンル
- ノベルゲーム / CYOA（Choose Your Own Adventure）
- ローグライク
- ストーリー重視RPG

### 入力マッピング
| ボタン | アクション |
|--------|-----------|
| A | 選択決定 / 次へ進む |
| B | 戻る（メニューへ） |
| L/R | 選択肢切り替え |

### SDK実装例
```javascript
const game = new Game({ pattern: 'REVEAL' });

const intro = game.section('intro');
intro.text(0, '森の入り口に立っている。');
intro.text(0, '▶ 東へ進む');
intro.text(0, '  西へ進む');
intro.jumpIfBtn(BTN.A, 'east');
intro.jumpIfBtn(BTN.B, 'west');

const east = game.section('east');
east.text(0, '東の道を選んだ...');
// ...
```

### Studio 2 UI
- セクションを縦に並べる（フローチャート形式）
- 矢印で分岐を可視化
- 分岐確率表示（ランダム分岐時）

---

## 2. LOOP（巻き戻し可能）

### 概要
紙を物理的に巻き戻し、過去の選択が見える状態で再選択できる。タイムループものに最適。

### フロー図
```
前進 → 前進 → 前進 → 「戻る」→ 巻き戻し
                              ↓
                      選択肢が変化している
```

### ハードウェア要件
- **双方向モーター**: TMC2209 + 逆回転制御
- **フェーダー（オプション）**: 巻き戻し速度制御

### 入力マッピング
| ボタン | アクション |
|--------|-----------|
| A | 前進 |
| B | 巻き戻しモード開始 |
| フェーダー | 巻き戻し速度（0=停止、MAX=高速） |

### SDK実装例
```javascript
const game = new Game({
  pattern: 'LOOP',
  rewindable: true,
});

const room1 = game.section('room1');
room1.text(0, '部屋1: 鍵を発見');
room1.setVar(0, 1);  // has_key = true
room1.jump('room2');

const room2 = game.section('room2');
room2.text(0, '部屋2: 扉がある');
room2.jumpIfVar(0, PGP.OP.EQ, 1, 'open_door');  // 鍵持ち → 開く
room2.jump('stuck');  // 鍵なし → 詰み

const stuck = game.section('stuck');
stuck.text(0, '扉が開かない...');
stuck.text(0, '▶ Bで巻き戻す');
stuck.waitButton(BTN.B);
stuck.rewind(10);  // 10行戻る
```

### Studio 2 UI
- タイムライン表示（横軸 = 時間/行）
- 巻き戻し可能ポイントをマーク
- 「過去の自分」のゴースト表示

---

## 3. FEEDER（送り手 + プレイヤー）

### 概要
2台構成。1台がシナリオを生成/送信し、もう1台がプレイヤーの選択を処理する。GMとプレイヤーの関係。

### フロー図
```
[送り手デバイス] ──紙──→ [プレイヤーデバイス]
     ↓                         ↓
  シナリオ生成              選択・印刷
```

### ハードウェア構成
- **送り手**: Pico 2W（WiFi）+ サーマルヘッド
- **プレイヤー**: Pico 2W（WiFi）+ サーマルヘッド + ボタン/フェーダー

### 入力マッピング（プレイヤー側）
| 入力 | アクション |
|------|-----------|
| フェーダー | 紙送り速度（自分のペースで読む） |
| A | 「次を送って」信号 |
| B | 「もう一度」信号 |

### SDK実装例
```javascript
// 送り手側
const feeder = new Game({
  pattern: 'FEEDER',
  role: 'feeder',
});

feeder.onRequest('next', async (ctx) => {
  const scenario = await generateScenario(ctx.history);
  ctx.send(scenario);
});

// プレイヤー側
const player = new Game({
  pattern: 'FEEDER',
  role: 'player',
});

player.setFeedMode(FEED_MODE.FADER);  // フェーダーで読み進める
player.onReceive((data) => {
  currentSection.text(0, data.text);
});
```

### Studio 2 UI
- 2ペイン表示（送り手 / プレイヤー）
- 通信シミュレーション
- 「送り手プレビュー」モード

---

## 4. SYNC（同期マルチ）

### 概要
複数プレイヤーが同時進行。非対称情報で、互いの選択が見えない状態で行動し、結果が統合される。

### フロー図
```
[プレイヤーA]     [プレイヤーB]
    ↓                 ↓
  同じ時間軸で進行
    ↓                 ↓
  選択A             選択B
    ↓─────合流─────↓
      結果は両者の選択で決まる
```

### ハードウェア構成
- 各プレイヤー: Pico 2W（WiFi）+ 入力デバイス
- WiFi経由で同期

### 入力マッピング
| ボタン | アクション |
|--------|-----------|
| A/B | 選択（どちらかを選ぶ） |
| X/Y | アクション（戦闘など） |
| L/R | ページ/履歴切り替え |

### SDK実装例
```javascript
const game = new Game({
  pattern: 'SYNC',
  players: { min: 2, max: 4 },
});

// ホスト
const session = await game.host({ sessionId: 'dungeon-001' });

session.onAllReady(() => {
  session.broadcast('start', { boss: 'Dragon' });
});

// 同期ポイント
game.syncPoint('boss-battle', {
  waitFor: 'all',
  timeout: 30000,
  combine: (choices) => {
    // プレイヤー全員の選択を統合
    const totalDamage = choices.reduce((sum, c) => sum + c.damage, 0);
    return { result: totalDamage > 100 ? 'win' : 'lose' };
  }
});
```

### Studio 2 UI
- マルチカラムビュー（プレイヤー別）
- 同期ポイントを視覚化
- 「結果統合」ロジックエディタ

---

## 5. BACKLOG（ログ継承）

### 概要
前のプレイヤーのログが見える状態で次のプレイヤーがプレイ。紙を物理的に渡す。

### フロー図
```
プレイヤー1 → [紙を渡す] → プレイヤー2 → [紙を渡す] → プレイヤー3
    │                          │                          │
  選択・死亡               上書き・復活              最終結末
```

### ハードウェア構成
- 1台を複数人で共有
- または複数台で紙だけ物理的に移動

### 入力マッピング
| ボタン | アクション |
|--------|-----------|
| A | 継承（前のプレイヤーの選択を維持） |
| B | 上書き（前のプレイヤーの選択を変更） |
| X | 復活（死亡状態をリセット） |

### SDK実装例
```javascript
const game = new Game({
  pattern: 'BACKLOG',
  players: { min: 2, max: 5 },
});

game.onInherit((previousLog) => {
  // 前のプレイヤーのログを解析
  const deaths = previousLog.filter(e => e.type === 'death');

  if (deaths.length > 0) {
    currentSection.text(0, `前回の死因: ${deaths[0].cause}`);
    currentSection.text(0, '▶ A: 復活させる');
    currentSection.text(0, '  B: 見捨てる');
  }
});

game.onOverwrite((line, newContent) => {
  // 上書き印刷
  section.overwriteAt(line, newContent);
});
```

### Studio 2 UI
- レイヤー表示（前のプレイヤー = 薄く表示）
- 上書き可能箇所をハイライト
- 「継承/上書き」ルールエディタ

---

## 6. GENERATOR（生成系）

### 概要
印刷物がゲームコンポーネント（カード、タイル、マップ）になる。切り取ってテーブルゲームとして遊ぶ。

### フロー図
```
[印刷] → カード/タイル生成 → [切り取る] → テーブルに並べる
                                              ↓
                                         ボードゲーム化
```

### 入力マッピング
| ボタン | アクション |
|--------|-----------|
| A | 生成実行 |
| L/R | 生成タイプ切り替え |
| フェーダー | ランダム度調整 |

### SDK実装例
```javascript
const game = new Game({
  pattern: 'GENERATOR',
});

// カードテンプレート
game.card('monster', {
  width: 200,
  height: 150,
  template: (data) => new PrintCanvas()
    .rect(0, 0, 200, 150, true)
    .text(10, 10, data.name, { font: 'misaki', scale: 2 })
    .sprite(data.spriteId, 100, 75)
    .line(0, 140, 200, 140, 2)  // 切り取り線
});

// 生成ロジック
game.generate('deck', {
  count: 20,
  distribution: {
    monster: 10,
    item: 5,
    event: 5
  }
});
```

### Studio 2 UI
- カード/タイルテンプレートエディタ
- 生成プレビュー（複数枚同時表示）
- 切り取り線ガイド表示

---

## 7. VERSUS（対戦）

### 概要
2人が同じ紙面で陣取り合戦。印刷で「攻撃」し、面積が多い方が勝利。

### フロー図
```
交互に印刷 → 陣取り → 交互に印刷 → 判定 → 勝敗
```

### 入力マッピング
| ボタン | アクション |
|--------|-----------|
| A | 印刷実行 |
| L/R | 印刷パターン選択 |
| フェーダー | 印刷位置（X座標） |

### SDK実装例
```javascript
const game = new Game({
  pattern: 'VERSUS',
  players: { min: 2, max: 2 },
});

game.onTurn((player, ctx) => {
  const pattern = player.selectedPattern;
  const x = player.faderValue / 4095 * WIDTH;

  ctx.print(pattern, x, 0);

  // 陣地計算
  const territory = ctx.calculateTerritory();
  ctx.updateScore(player.id, territory[player.id]);
});

game.onEnd((scores) => {
  const winner = scores[0] > scores[1] ? 'Player 1' : 'Player 2';
  section.text(0, `Winner: ${winner}`);
});
```

### Studio 2 UI
- 2プレイヤーターン表示
- リアルタイム陣地計算プレビュー
- 勝敗条件エディタ

---

## パターン比較表

| パターン | 接続 | 巻き戻し | マルチ | 主な用途 |
|----------|------|----------|--------|----------|
| REVEAL | 不要 | ✗ | 1人 | ノベル、ローグライク |
| LOOP | 不要 | ✓ | 1人 | タイムループ |
| FEEDER | 必要 | ✗ | 2人 | TRPG、GM主導 |
| SYNC | 必要 | ✗ | 2人+ | 協力/対決 |
| BACKLOG | 不要 | ✗ | 2人+ | 継承プレイ |
| GENERATOR | 不要 | ✗ | 1人+ | カード/ボードゲーム生成 |
| VERSUS | 不要 | ✗ | 2人 | 対戦 |
