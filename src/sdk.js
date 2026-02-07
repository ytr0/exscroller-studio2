// =====================================================
// ExScroller Game SDK v2.5.0.2026.0207
// Thermal printer game development framework
// Supports: sprites, offline branching, native Japanese text, RLE compression
// v2.5.0: Multi-button support (A/B/X/Y/L/R) + Fader input
// v2.4.1: Fix CJK detection - box drawing chars now use ASCII font, not Misaki
// =====================================================

const WIDTH = 576;
const BPL = 72;
const PICO_VID = 0x2E8A;

// Button bit masks
const BTN = {
  A: 0x01,
  B: 0x02,
  X: 0x04,
  Y: 0x08,
  L: 0x10,
  R: 0x20,
  ANY: 0x3F,
};

// Feed modes
const FEED_MODE = {
  AUTO: 0,    // Automatic feed at set speed
  BUTTON: 1,  // Feed on button press
  FADER: 2,   // Fader controls feed direction/speed
};

// =====================================================
// Error Classes
// =====================================================
class SDKError extends Error {
  constructor(code, message, context = {}) {
    super(message);
    this.name = 'SDKError';
    this.code = code;
    this.context = context;
  }
}

class CompileError extends SDKError {
  constructor(message, context = {}) {
    super('COMPILE_ERROR', message, context);
    this.name = 'CompileError';
  }
}

class ConnectionError extends SDKError {
  constructor(message, context = {}) {
    super('CONNECTION_ERROR', message, context);
    this.name = 'ConnectionError';
  }
}

class ValidationError extends SDKError {
  constructor(message, context = {}) {
    super('VALIDATION_ERROR', message, context);
    this.name = 'ValidationError';
  }
}

const FONT_HEIGHTS = [9, 16, 18, 34];
const FONT_CHAR_W = [6, 12, 9, 18];
const FONT_PX = [7, 14, 16, 32];

// Base fonts: 0 = 5x7 (7px), 1 = 8x16 (16px)
// Font metrics: baseFont 0=5x7, 1=8x16, 2=Misaki8x8 (Japanese)
const BASE_FONT_PX = [7, 16, 8];
const BASE_FONT_W = [5, 8, 8];
const DOTS_PER_MM = 8;

// Convert size (mm) to baseFont + scale
function sizeToFontScale(sizeMm, useJapanese = false) {
  const sizePx = sizeMm * DOTS_PER_MM;
  // Use Misaki8x8 for Japanese, otherwise 8x16 for sizes >= 12px, else 5x7
  const base = useJapanese ? 2 : (sizePx >= 12 ? 1 : 0);
  const scale = Math.max(1, Math.min(15, Math.round(sizePx / BASE_FONT_PX[base])));
  return { baseFont: base, scale };
}

// Encode baseFont + scale to PGP font byte
// Legacy: 0=5x7 1x, 1=5x7 2x, 2=8x16 1x, 3=8x16 2x
// Extended (>=4): baseFont = bits 0-1, scale = bits 2-7
function encodeFontByte(baseFont, scale) {
  // Use extended format for: Misaki font, or scale > 2
  if (baseFont >= 2 || scale > 2) {
    return (scale << 2) | (baseFont & 0x03);
  }
  // Legacy format for backward compatibility
  return baseFont === 0 ? (scale - 1) : (2 + scale - 1);
}

// Get pixel height for baseFont + scale
function getFontHeight(baseFont, scale) {
  return BASE_FONT_PX[baseFont] * scale + 2; // +2 for line spacing
}

// Get character width for baseFont + scale
function getFontCharW(baseFont, scale) {
  return (BASE_FONT_W[baseFont] + 1) * scale;
}

// Check if string contains CJK characters (needs Japanese Misaki font)
// Only matches: Hiragana, Katakana, CJK Ideographs - NOT box drawing or symbols
function hasCJK(str) {
  return /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF\u3400-\u4DBF\uFF65-\uFF9F]/.test(str);
}

// =====================================================
// PGP Protocol - Frame Builder
// =====================================================
class PGP {
  static SYNC = 0xE0;
  static CMD = {
    RAW_LINE: 0x01, RAW_LINES: 0x02, RAW_LINE_RLE: 0x03, FILL_LINE: 0x04,
    TEXT: 0x05, RECT: 0x06,
    SPRITE_DEF: 0x0B, SPRITE_DRAW: 0x0C,
    FEED: 0x20, SET_SPEED: 0x22, STOP: 0x23,
    SET_HEAT: 0x24, SET_MODE: 0x25,
    POLL_INPUT: 0x30, WAIT_BUTTON: 0x31, SYNC: 0x41,
    PROGRAM_START: 0x50, PROGRAM_END: 0x51,
    LABEL: 0x60, JUMP: 0x61, JUMP_IF_BTN: 0x62,
    RANDOM_JUMP: 0x64, SET_VAR: 0x65, JUMP_IF_VAR: 0x66,
    JUMP_IF_FADER: 0x67, WAIT_FADER: 0x68, SET_FEED_MODE: 0x69,
  };

  // Variable comparison operators for JUMP_IF_VAR
  static OP = {
    EQ: 0,  // ==
    NE: 1,  // !=
    LT: 2,  // <
    LE: 3,  // <=
    GT: 4,  // >
    GE: 5,  // >=
  };

  // ----- Byte order helpers -----
  // Note: General commands use Little-Endian, branching uses Big-Endian
  // for historical compatibility with firmware

  static writeU16LE(value) {
    return [value & 0xFF, (value >> 8) & 0xFF];
  }

  static writeU16BE(value) {
    return [(value >> 8) & 0xFF, value & 0xFF];
  }

  static crc8(data) {
    let crc = 0;
    for (const b of data) {
      crc ^= b;
      for (let i = 0; i < 8; i++)
        crc = (crc & 0x80) ? ((crc << 1) ^ 0x07) : (crc << 1);
      crc &= 0xFF;
    }
    return crc;
  }

  static frame(cmd, payload = new Uint8Array(0)) {
    const len = payload.length;
    const buf = new Uint8Array(5 + len);
    buf[0] = this.SYNC;
    buf[1] = cmd;
    buf[2] = len & 0xFF;
    buf[3] = (len >> 8) & 0xFF;
    if (len > 0) buf.set(payload, 4);
    buf[4 + len] = this.crc8(buf.slice(1, 4 + len));
    return buf;
  }

  static setSpeed(pps) {
    return this.frame(this.CMD.SET_SPEED,
      new Uint8Array([pps & 0xFF, (pps >> 8) & 0xFF]));
  }

  static setHeat(us) {
    // Heat time per phase in microseconds (100-2000μs, default 500)
    return this.frame(this.CMD.SET_HEAT,
      new Uint8Array([us & 0xFF, (us >> 8) & 0xFF]));
  }

  static rawLine(data) {
    return this.frame(this.CMD.RAW_LINE,
      data instanceof Uint8Array ? data : new Uint8Array(data));
  }

  // RLE-compress a 72-byte line: [count][value] pairs
  // Returns null if compression doesn't save space
  static rleEncode(data) {
    const arr = data instanceof Uint8Array ? data : new Uint8Array(data);
    if (arr.length !== 72) return null;

    const rle = [];
    let i = 0;
    while (i < arr.length) {
      const val = arr[i];
      let count = 1;
      while (i + count < arr.length && arr[i + count] === val && count < 255) {
        count++;
      }
      rle.push(count, val);
      i += count;
    }
    return new Uint8Array(rle);
  }

  // RLE-compressed raw line (uses compression if beneficial)
  static rawLineRle(data) {
    const rle = this.rleEncode(data);
    // Use RLE if it saves at least 8 bytes (frame overhead consideration)
    if (rle && rle.length < 64) {
      return this.frame(this.CMD.RAW_LINE_RLE, rle);
    }
    // Fall back to uncompressed
    return this.rawLine(data);
  }

  static fillLine(pattern, count) {
    return this.frame(this.CMD.FILL_LINE,
      new Uint8Array([pattern & 0xFF, count & 0xFF, (count >> 8) & 0xFF]));
  }

  static text(x, y, font, str) {
    const enc = new TextEncoder().encode(str);
    const p = new Uint8Array(6 + enc.length);
    p[0] = x & 0xFF; p[1] = (x >> 8) & 0xFF;
    p[2] = y & 0xFF; p[3] = (y >> 8) & 0xFF;
    p[4] = font; p[5] = enc.length;
    p.set(enc, 6);
    return this.frame(this.CMD.TEXT, p);
  }

  static rect(x, y, w, h, fill) {
    const p = new Uint8Array(9);
    p[0] = x & 0xFF; p[1] = (x >> 8) & 0xFF;
    p[2] = y & 0xFF; p[3] = (y >> 8) & 0xFF;
    p[4] = w & 0xFF; p[5] = (w >> 8) & 0xFF;
    p[6] = h & 0xFF; p[7] = (h >> 8) & 0xFF;
    p[8] = fill;
    return this.frame(this.CMD.RECT, p);
  }

  static feed(lines) {
    return this.frame(this.CMD.FEED,
      new Uint8Array([lines & 0xFF, (lines >> 8) & 0xFF]));
  }

  static stop() { return this.frame(this.CMD.STOP); }

  static setMode(mode) {
    return this.frame(this.CMD.SET_MODE, new Uint8Array([mode]));
  }

  static pollInput() { return this.frame(this.CMD.POLL_INPUT); }
  static waitButton() { return this.frame(this.CMD.WAIT_BUTTON); }

  static sync(seq) {
    const p = new Uint8Array(4);
    p[0] = seq & 0xFF; p[1] = (seq >> 8) & 0xFF;
    p[2] = (seq >> 16) & 0xFF; p[3] = (seq >> 24) & 0xFF;
    return this.frame(this.CMD.SYNC, p);
  }

  // ----- Program commands (offline branching) -----

  static programStart() {
    return this.frame(this.CMD.PROGRAM_START);
  }

  static programEnd() {
    return this.frame(this.CMD.PROGRAM_END);
  }

  // ----- Sprite commands -----

  static spriteDef(id, w, h, data) {
    // data: Uint8Array, row-major MSB-first packed bits
    const p = new Uint8Array(3 + data.length);
    p[0] = id;
    p[1] = w;
    p[2] = h;
    p.set(data, 3);
    return this.frame(this.CMD.SPRITE_DEF, p);
  }

  static spriteDraw(id, x, y = 0) {
    const p = new Uint8Array(5);
    p[0] = id;
    p[1] = x & 0xFF; p[2] = (x >> 8) & 0xFF;
    p[3] = y & 0xFF; p[4] = (y >> 8) & 0xFF;
    return this.frame(this.CMD.SPRITE_DRAW, p);
  }

  // ----- Branching commands (big-endian for firmware) -----

  static label(id) {
    return this.frame(this.CMD.LABEL,
      new Uint8Array([(id >> 8) & 0xFF, id & 0xFF]));
  }

  static jump(labelId) {
    return this.frame(this.CMD.JUMP,
      new Uint8Array([(labelId >> 8) & 0xFF, labelId & 0xFF]));
  }

  static jumpIfBtn(buttonMask, labelId) {
    // buttonMask: which buttons trigger the jump (BTN.A, BTN.B, etc.)
    // Use BTN.ANY (0x3F) or 0 for any button
    const mask = buttonMask || BTN.ANY;
    return this.frame(this.CMD.JUMP_IF_BTN,
      new Uint8Array([mask, (labelId >> 8) & 0xFF, labelId & 0xFF]));
  }

  static randomJump(labelIds) {
    const p = new Uint8Array(1 + labelIds.length * 2);
    p[0] = labelIds.length;
    for (let i = 0; i < labelIds.length; i++) {
      p[1 + i * 2] = (labelIds[i] >> 8) & 0xFF;
      p[2 + i * 2] = labelIds[i] & 0xFF;
    }
    return this.frame(this.CMD.RANDOM_JUMP, p);
  }

  static setVar(varId, value) {
    const p = new Uint8Array(3);
    p[0] = varId;
    p[1] = (value >> 8) & 0xFF;
    p[2] = value & 0xFF;
    return this.frame(this.CMD.SET_VAR, p);
  }

  static jumpIfVar(varId, op, value, labelId) {
    const p = new Uint8Array(6);
    p[0] = varId;
    p[1] = op;
    p[2] = (value >> 8) & 0xFF;
    p[3] = value & 0xFF;
    p[4] = (labelId >> 8) & 0xFF;
    p[5] = labelId & 0xFF;
    return this.frame(this.CMD.JUMP_IF_VAR, p);
  }

  // Fader-based branching
  static jumpIfFader(op, threshold, labelId) {
    const p = new Uint8Array(5);
    p[0] = op;
    p[1] = threshold & 0xFF;
    p[2] = (threshold >> 8) & 0xFF;
    p[3] = (labelId >> 8) & 0xFF;
    p[4] = labelId & 0xFF;
    return this.frame(this.CMD.JUMP_IF_FADER, p);
  }

  static waitFader(op, threshold) {
    const p = new Uint8Array(3);
    p[0] = op;
    p[1] = threshold & 0xFF;
    p[2] = (threshold >> 8) & 0xFF;
    return this.frame(this.CMD.WAIT_FADER, p);
  }

  static setFeedMode(mode) {
    return this.frame(this.CMD.SET_FEED_MODE, new Uint8Array([mode]));
  }
}

// =====================================================
// Printer - Web Serial Connection
// =====================================================
class Printer {
  constructor() {
    this._port = null;
    this._writer = null;
    this._readerRunning = false;
    this._onReceive = null;
  }

  get connected() { return !!this._writer; }

  onReceive(fn) { this._onReceive = fn; }

  async connect(baudRate = 921600) {
    if (!('serial' in navigator)) {
      throw new ConnectionError('Web Serial API not supported in this browser');
    }
    try {
      const ports = await navigator.serial.getPorts();
      const pico = ports.find(p => p.getInfo().usbVendorId === PICO_VID);
      this._port = pico || await navigator.serial.requestPort({
        filters: [{ usbVendorId: PICO_VID }],
      });
      await this._port.open({ baudRate });
      this._writer = this._port.writable.getWriter();
      this._startReader();
    } catch (e) {
      if (e instanceof ConnectionError) throw e;
      throw new ConnectionError(`Failed to connect: ${e.message}`, { originalError: e });
    }
  }

  async disconnect() {
    this._readerRunning = false;
    if (this._writer) { this._writer.releaseLock(); this._writer = null; }
    if (this._port) {
      try { await this._port.close(); } catch (_) {}
      this._port = null;
    }
  }

  async send(data) {
    if (!this._writer) throw new ConnectionError('Not connected to printer');
    await this._writer.write(data instanceof Uint8Array ? data : new Uint8Array(data));
  }

  async sendChunked(data, onProgress) {
    if (!this._writer) throw new ConnectionError('Not connected to printer');
    console.log('[Printer] Sending', data.length, 'bytes, first 20:',
      Array.from(data.slice(0, 20)).map(b => b.toString(16).padStart(2, '0')).join(' '));
    const CHUNK = 4096;
    for (let i = 0; i < data.length; i += CHUNK) {
      const end = Math.min(i + CHUNK, data.length);
      try {
        await this._writer.write(data.slice(i, end));
      } catch (e) {
        console.error('[Printer] Write error at offset', i, ':', e);
        throw e;
      }
      if (onProgress) onProgress(Math.min(end / data.length, 1));
    }
    console.log('[Printer] Send complete');
  }

  async _startReader() {
    if (!this._port?.readable) return;
    this._readerRunning = true;
    const reader = this._port.readable.getReader();
    const decoder = new TextDecoder();
    try {
      while (this._readerRunning) {
        const { value, done } = await reader.read();
        if (done) break;
        if (this._onReceive) this._onReceive(decoder.decode(value, { stream: true }));
      }
    } catch (_) {
    } finally {
      try { reader.releaseLock(); } catch (_) {}
    }
  }
}

// =====================================================
// Section - Content Definition
// =====================================================
class Section {
  constructor(id, opts = {}) {
    this.id = id;
    this.feedMode = opts.feedMode || 'auto';
    this.speed = opts.speed || 10000;
    this.blocks = [];
    this._onLine = null;
    this._onEnter = null;
    this._onExit = null;
    this._endCondition = null;
    this.maxLines = opts.maxLines || 2000;
  }

  text(x, str, opts = {}) {
    let baseFont, scale, sizeMm = null;
    if (opts.size !== undefined) {
      // Size in mm - store for later recalculation if CJK detected
      sizeMm = opts.size;
      const fs = sizeToFontScale(opts.size);
      baseFont = fs.baseFont;
      scale = fs.scale;
    } else if (opts.font !== undefined) {
      // Legacy font 0-3
      const f = opts.font;
      baseFont = f < 2 ? 0 : 1;
      scale = (f === 1 || f === 3) ? 2 : 1;
    } else {
      // Default: 8x16 1x (font 2)
      baseFont = 1;
      scale = 1;
    }
    this.blocks.push({ type: 'text', x, str, baseFont, scale, sizeMm });
    return this;
  }

  rect(x, w, h, fill = 1) {
    this.blocks.push({ type: 'rect', x, w, h, fill });
    return this;
  }

  fill(pattern, count) {
    this.blocks.push({ type: 'fill', pattern, count });
    return this;
  }

  feed(lines) {
    this.blocks.push({ type: 'feed', lines });
    return this;
  }

  hline(thickness = 1) {
    this.blocks.push({ type: 'hline', thickness });
    return this;
  }

  image(rows) {
    this.blocks.push({ type: 'image', rows });
    return this;
  }

  waitButton() {
    this.blocks.push({ type: 'waitButton' });
    return this;
  }

  // ----- Sprite drawing -----
  sprite(id, x, y = 0) {
    this.blocks.push({ type: 'sprite', id, x, y });
    return this;
  }

  // ----- Branching commands -----
  label(id) {
    this.blocks.push({ type: 'label', id });
    return this;
  }

  jump(labelId) {
    this.blocks.push({ type: 'jump', labelId });
    return this;
  }

  jumpIfBtn(buttonMaskOrLabelId, labelId = null) {
    // Support both old API: jumpIfBtn(labelId) and new API: jumpIfBtn(buttonMask, labelId)
    if (labelId === null) {
      // Old API: jumpIfBtn(labelId) - use any button
      this.blocks.push({ type: 'jumpIfBtn', buttonMask: BTN.ANY, labelId: buttonMaskOrLabelId });
    } else {
      // New API: jumpIfBtn(buttonMask, labelId)
      this.blocks.push({ type: 'jumpIfBtn', buttonMask: buttonMaskOrLabelId, labelId });
    }
    return this;
  }

  randomJump(labelIds) {
    this.blocks.push({ type: 'randomJump', labelIds });
    return this;
  }

  setVar(varId, value) {
    this.blocks.push({ type: 'setVar', varId, value });
    return this;
  }

  jumpIfVar(varId, op, value, labelId) {
    this.blocks.push({ type: 'jumpIfVar', varId, op, value, labelId });
    return this;
  }

  // Fader-based commands
  jumpIfFader(op, threshold, labelId) {
    this.blocks.push({ type: 'jumpIfFader', op, threshold, labelId });
    return this;
  }

  waitFader(op, threshold) {
    this.blocks.push({ type: 'waitFader', op, threshold });
    return this;
  }

  setFeedMode(mode) {
    this.blocks.push({ type: 'setFeedMode', mode });
    return this;
  }

  onLine(fn) { this._onLine = fn; return this; }
  onEnter(fn) { this._onEnter = fn; return this; }
  onExit(fn) { this._onExit = fn; return this; }
  endCondition(fn) { this._endCondition = fn; return this; }

  getStaticHeight(game = null) {
    let h = 0;
    for (const b of this.blocks) {
      switch (b.type) {
        case 'text': h += getFontHeight(b.baseFont, b.scale); break;
        case 'rect': h += b.h; break;
        case 'fill': h += b.count; break;
        case 'feed': h += b.lines; break;
        case 'hline': h += b.thickness; break;
        case 'image': h += b.rows.length; break;
        case 'sprite':
          if (game && game.sprites.has(b.id)) {
            h += game.sprites.get(b.id).h;
          }
          break;
      }
    }
    return h;
  }
}

// =====================================================
// LineContext - Dynamic Section Callback Context
// =====================================================
class LineContext {
  constructor(game, maxLines) {
    this.line = 0;
    this.maxLines = maxLines;
    this.vars = game.vars;
    this.input = { joyX: 0, joyY: 0, button: false };
    this._buf = new Uint8Array(BPL);
    this._done = false;
    this._goto = null;
    this._speed = null;
  }

  get progress() {
    return this.maxLines > 0 ? this.line / this.maxLines : 0;
  }

  emit(data) {
    const src = data instanceof Uint8Array ? data : new Uint8Array(data);
    this._buf.set(src.subarray(0, BPL));
  }

  pixel(x, on = true) {
    if (x < 0 || x >= WIDTH) return;
    x = Math.floor(x);
    if (on) this._buf[x >> 3] |= (1 << (7 - (x & 7)));
    else this._buf[x >> 3] &= ~(1 << (7 - (x & 7)));
  }

  range(x1, x2) {
    x1 = Math.max(0, Math.floor(x1));
    x2 = Math.min(WIDTH, Math.floor(x2));
    for (let x = x1; x < x2; x++)
      this._buf[x >> 3] |= (1 << (7 - (x & 7)));
  }

  setSpeed(pps) { this._speed = pps; }
  done() { this._done = true; }
  goto(sectionId) { this._goto = sectionId; this._done = true; }
}

// =====================================================
// Game - Orchestration
// =====================================================
class Game {
  constructor(opts = {}) {
    this.title = opts.title || 'Untitled';
    this.defaultFeedMode = opts.feedMode || 'auto';
    this.defaultSpeed = opts.speed || 10000;
    this.fontFamily = opts.fontFamily || 'monospace';  // Custom font support
    this.sections = new Map();
    this._flow = [];
    this.vars = new Map();
    this.sprites = new Map();  // Sprite definitions
    this.printer = new Printer();
    this._running = false;
    this._onLog = null;
  }

  // Define a sprite from bitmap data
  // data: Uint8Array, row-major MSB-first packed bits
  defineSprite(id, w, h, data) {
    this.sprites.set(id, { id, w, h, data: new Uint8Array(data) });
    return this;
  }

  section(id, opts = {}) {
    const s = new Section(id, {
      feedMode: this.defaultFeedMode,
      speed: this.defaultSpeed,
      ...opts,
    });
    this.sections.set(id, s);
    if (!this._flow.includes(id)) this._flow.push(id);
    return s;
  }

  setFlow(...ids) { this._flow = ids; }
  onLog(fn) { this._onLog = fn; }
  _log(msg) { if (this._onLog) this._onLog(msg); }

  async connect(baudRate) {
    await this.printer.connect(baudRate);
    this._log('Connected');
  }

  stop() { this._running = false; }

  // ----- Preview: render to canvas -----
  preview(canvas) {
    const scanlines = this._generateAllScanlines();
    const height = scanlines.length;
    if (height === 0) return { width: WIDTH, height: 0, lines: 0, bytes: 0 };

    canvas.width = WIDTH;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    const img = ctx.createImageData(WIDTH, height);
    img.data.fill(255); // white background

    for (let y = 0; y < height; y++) {
      const row = scanlines[y];
      for (let x = 0; x < WIDTH; x++) {
        if ((row[x >> 3] >> (7 - (x & 7))) & 1) {
          const i = (y * WIDTH + x) * 4;
          img.data[i] = 0;
          img.data[i + 1] = 0;
          img.data[i + 2] = 0;
        }
      }
    }
    ctx.putImageData(img, 0, 0);

    const pgpSize = this.compile().length;
    return { width: WIDTH, height, lines: height, bytes: pgpSize };
  }

  // ----- Compile: generate PGP byte stream -----
  compile() {
    const frames = [];

    // Check if any section contains branching commands
    const hasBranching = this._hasBranchingCommands();

    // Validate labels before compiling
    if (hasBranching) {
      this._validateLabels();
    }

    // If branching, wrap in PROGRAM_START/END for offline execution
    if (hasBranching) {
      frames.push(PGP.programStart());
    }

    // Sprite definitions first
    for (const [id, spr] of this.sprites) {
      frames.push(PGP.spriteDef(spr.id, spr.w, spr.h, spr.data));
    }

    // useBitmapText: false - Native Misaki font (v10.5.0) handles Japanese directly
    // No more Canvas→RAW_LINE conversion needed for Japanese text
    const useBitmapText = false;

    if (hasBranching) {
      // For branching games: compile ALL sections (flow first, then others)
      // Native TEXT command with Misaki font for Japanese - minimal buffer usage
      const compiled = new Set();
      for (const id of this._flow) {
        const section = this.sections.get(id);
        if (!section) continue;
        frames.push(...this._compileSectionFrames(section, useBitmapText));
        compiled.add(id);
      }
      // Add remaining sections (those with labels that can be jumped to)
      for (const [id, section] of this.sections) {
        if (compiled.has(id)) continue;
        frames.push(...this._compileSectionFrames(section, useBitmapText));
      }
    } else {
      // Non-branching: only compile flow sections
      // Native TEXT command - Misaki font for Japanese, ASCII fonts for English
      for (const id of this._flow) {
        const section = this.sections.get(id);
        if (!section) continue;
        frames.push(...this._compileSectionFrames(section, useBitmapText));
      }
    }
    frames.push(PGP.feed(16));
    frames.push(PGP.stop());

    // End program if branching
    if (hasBranching) {
      frames.push(PGP.programEnd());
    }

    return _concatFrames(frames);
  }

  // ----- Validate labels at compile time -----
  _validateLabels() {
    // Step 1: Collect all defined labels
    const definedLabels = new Set();
    for (const [sectionId, section] of this.sections) {
      for (const block of section.blocks) {
        if (block.type === 'label') {
          definedLabels.add(block.id);
        }
      }
    }

    // Step 2: Validate all label references
    const errors = [];
    for (const [sectionId, section] of this.sections) {
      for (const block of section.blocks) {
        if (block.type === 'jump' || block.type === 'jumpIfBtn') {
          if (!definedLabels.has(block.labelId)) {
            errors.push(`Section '${sectionId}': jump to undefined label ${block.labelId}`);
          }
        }
        if (block.type === 'jumpIfVar') {
          if (!definedLabels.has(block.labelId)) {
            errors.push(`Section '${sectionId}': jumpIfVar to undefined label ${block.labelId}`);
          }
        }
        if (block.type === 'randomJump') {
          for (const labelId of block.labelIds) {
            if (!definedLabels.has(labelId)) {
              errors.push(`Section '${sectionId}': randomJump to undefined label ${labelId}`);
            }
          }
        }
      }
    }

    if (errors.length > 0) {
      throw new CompileError(
        `Label validation failed:\n${errors.join('\n')}`,
        { definedLabels: [...definedLabels], errors }
      );
    }
  }

  // Check if any section contains branching commands
  _hasBranchingCommands() {
    const branchingTypes = ['label', 'jump', 'jumpIfBtn', 'randomJump', 'setVar', 'jumpIfVar',
                             'jumpIfFader', 'waitFader', 'setFeedMode'];
    for (const [id, section] of this.sections) {
      for (const block of section.blocks) {
        if (branchingTypes.includes(block.type)) {
          return true;
        }
      }
    }
    return false;
  }

  // ----- Print: send PGP via serial -----
  async start(onProgress) {
    if (!this.printer.connected) {
      throw new ConnectionError('Not connected to printer');
    }
    this._running = true;
    try {
      const pgp = this.compile();  // May throw CompileError
      this._log('Sending ' + pgp.length + ' bytes...');
      await this.printer.sendChunked(pgp, onProgress);
      this._log('Print complete');
    } finally {
      this._running = false;
    }
  }

  // ----- Internal -----

  _compileSectionFrames(section, useBitmapText = false) {
    const frames = [];
    const mode = { auto: 0, elastic: 1, precise: 2 }[section.feedMode] ?? 0;

    // Skip SET_MODE(0) for auto mode - matches app.js behavior
    if (mode !== 0) {
      frames.push(PGP.setMode(mode));
    }

    // auto mode (or mode 0) always sends SET_SPEED
    if (section.feedMode === 'auto' || mode === 0) {
      frames.push(PGP.setSpeed(section.speed));
    }

    if (section._onLine) {
      const scanlines = this._runDynamic(section);
      for (const row of scanlines) frames.push(PGP.rawLineRle(row));
    } else {
      for (const block of section.blocks) {
        frames.push(...this._blockToPGP(block, useBitmapText));
      }
    }
    return frames;
  }

  _generateAllScanlines() {
    const all = [];
    for (const id of this._flow) {
      const section = this.sections.get(id);
      if (!section) continue;
      if (section._onLine) {
        all.push(...this._runDynamic(section));
      } else {
        all.push(...this._renderStatic(section));
      }
    }
    return all;
  }

  _renderStatic(section) {
    const height = section.getStaticHeight(this);
    if (height === 0) return [];

    const cv = document.createElement('canvas');
    cv.width = WIDTH;
    cv.height = height;
    const ctx = cv.getContext('2d');
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, WIDTH, height);
    ctx.fillStyle = 'black';

    let y = 0;
    for (const block of section.blocks) {
      switch (block.type) {
        case 'text': {
          const fh = getFontHeight(block.baseFont, block.scale);
          const fs = BASE_FONT_PX[block.baseFont] * block.scale;
          ctx.font = fs + 'px ' + this.fontFamily;
          ctx.textBaseline = 'top';
          ctx.fillText(block.str, block.x, y + 1);
          y += fh;
          break;
        }
        case 'rect':
          if (block.fill) {
            ctx.fillRect(block.x, y, block.w, block.h);
          } else {
            ctx.strokeStyle = 'black';
            ctx.lineWidth = 1;
            ctx.strokeRect(block.x + 0.5, y + 0.5, block.w - 1, block.h - 1);
          }
          y += block.h;
          break;
        case 'fill':
          for (let dy = 0; dy < block.count; dy++)
            for (let x = 0; x < WIDTH; x++)
              if ((block.pattern >> (7 - (x & 7))) & 1)
                ctx.fillRect(x, y + dy, 1, 1);
          y += block.count;
          break;
        case 'feed':
          y += block.lines;
          break;
        case 'hline':
          ctx.fillRect(0, y, WIDTH, block.thickness);
          y += block.thickness;
          break;
        case 'image':
          for (let dy = 0; dy < block.rows.length; dy++) {
            const row = block.rows[dy];
            for (let x = 0; x < WIDTH; x++)
              if ((row[x >> 3] >> (7 - (x & 7))) & 1)
                ctx.fillRect(x, y + dy, 1, 1);
          }
          y += block.rows.length;
          break;
        case 'sprite':
          // Render sprite from definition
          if (this.sprites.has(block.id)) {
            const spr = this.sprites.get(block.id);
            const bytesPerRow = Math.ceil(spr.w / 8);
            for (let dy = 0; dy < spr.h; dy++) {
              for (let dx = 0; dx < spr.w; dx++) {
                const byteIdx = dy * bytesPerRow + (dx >> 3);
                const bitIdx = 7 - (dx & 7);
                if ((spr.data[byteIdx] >> bitIdx) & 1) {
                  ctx.fillRect(block.x + dx, y + dy, 1, 1);
                }
              }
            }
            y += spr.h;
          }
          break;
      }
    }

    const imgData = ctx.getImageData(0, 0, WIDTH, height);
    const scanlines = [];
    for (let row = 0; row < height; row++) {
      const line = new Uint8Array(BPL);
      for (let x = 0; x < WIDTH; x++) {
        const i = (row * WIDTH + x) * 4;
        const gray = imgData.data[i] * 0.299 + imgData.data[i + 1] * 0.587 + imgData.data[i + 2] * 0.114;
        if (gray < 128) line[x >> 3] |= (1 << (7 - (x & 7)));
      }
      scanlines.push(line);
    }
    return scanlines;
  }

  _runDynamic(section) {
    const lctx = new LineContext(this, section.maxLines);
    const scanlines = [];

    if (section._onEnter) section._onEnter(lctx);

    for (let i = 0; i < section.maxLines; i++) {
      lctx.line = i;
      lctx._buf.fill(0);
      lctx._speed = null;

      section._onLine(lctx);
      scanlines.push(new Uint8Array(lctx._buf));

      if (lctx._done) break;
      if (section._endCondition && section._endCondition(lctx)) break;
    }

    if (section._onExit) section._onExit(lctx);
    return scanlines;
  }

  _blockToPGP(block, useBitmapText = false) {
    switch (block.type) {
      case 'text': {
        // Use native TEXT command with appropriate font:
        // - ASCII/symbols: use original font (5x7 or 8x16)
        // - CJK (Japanese/Chinese): use MisakiFont8x8 (baseFont=2)
        const needsJapaneseFont = hasCJK(block.str);

        if (needsJapaneseFont) {
          // Use Misaki 8x8 Japanese font (baseFont=2)
          // Recalculate scale for 8px base if size was specified
          let scale = block.scale;
          if (block.sizeMm !== null) {
            const sizePx = block.sizeMm * 8; // 8 dots/mm
            scale = Math.max(1, Math.min(15, Math.round(sizePx / 8))); // 8px base
          }
          const fontByte = encodeFontByte(2, scale);
          return [PGP.text(block.x, 0, fontByte, block.str)];
        } else {
          // Use original ASCII font (5x7 or 8x16)
          const fontByte = encodeFontByte(block.baseFont, block.scale);
          return [PGP.text(block.x, 0, fontByte, block.str)];
        }
      }
      case 'rect': return [PGP.rect(block.x, 0, block.w, block.h, block.fill)];
      case 'fill': return [PGP.fillLine(block.pattern, block.count)];
      case 'feed': return [PGP.feed(block.lines)];
      case 'hline': return [PGP.fillLine(0xFF, block.thickness)];
      case 'image': return block.rows.map(r => PGP.rawLineRle(r));
      case 'waitButton': return [PGP.waitButton()];
      // Sprite
      case 'sprite': return [PGP.spriteDraw(block.id, block.x, block.y)];
      // Branching
      case 'label': return [PGP.label(block.id)];
      case 'jump': return [PGP.jump(block.labelId)];
      case 'jumpIfBtn': return [PGP.jumpIfBtn(block.buttonMask, block.labelId)];
      case 'randomJump': return [PGP.randomJump(block.labelIds)];
      case 'setVar': return [PGP.setVar(block.varId, block.value)];
      case 'jumpIfVar': return [PGP.jumpIfVar(block.varId, block.op, block.value, block.labelId)];
      case 'jumpIfFader': return [PGP.jumpIfFader(block.op, block.threshold, block.labelId)];
      case 'waitFader': return [PGP.waitFader(block.op, block.threshold)];
      case 'setFeedMode': return [PGP.setFeedMode(block.mode)];
      default: return [];
    }
  }
}

// =====================================================
// Image Utilities
// =====================================================
function floydSteinberg(grayscale, width, height) {
  const px = new Float32Array(grayscale);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const old = px[i];
      const val = old < 128 ? 0 : 255;
      px[i] = val;
      const err = old - val;
      if (x + 1 < width) px[i + 1] += err * 7 / 16;
      if (y + 1 < height && x - 1 >= 0) px[i + width - 1] += err * 3 / 16;
      if (y + 1 < height) px[i + width] += err * 5 / 16;
      if (y + 1 < height && x + 1 < width) px[i + width + 1] += err * 1 / 16;
    }
  }
  return px;
}

function imageToGrayscale(imageData, width, height) {
  const gray = new Float32Array(width * height);
  for (let i = 0; i < width * height; i++) {
    gray[i] = 0.299 * imageData.data[i * 4]
            + 0.587 * imageData.data[i * 4 + 1]
            + 0.114 * imageData.data[i * 4 + 2];
  }
  return gray;
}

function packToRows(dithered, width, height) {
  const rows = [];
  for (let y = 0; y < height; y++) {
    const row = new Uint8Array(BPL);
    for (let x = 0; x < width && x < WIDTH; x++)
      if (dithered[y * width + x] < 128)
        row[x >> 3] |= (1 << (7 - (x & 7)));
    rows.push(row);
  }
  return rows;
}

// =====================================================
// Helpers
// =====================================================
function _concatFrames(frames) {
  const total = frames.reduce((s, f) => s + f.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const f of frames) { out.set(f, off); off += f.length; }
  return out;
}

// =====================================================
// Exports
// =====================================================
export {
  // Core classes
  PGP, Printer, Section, LineContext, Game,
  // Error classes
  SDKError, CompileError, ConnectionError, ValidationError,
  // Image utilities
  floydSteinberg, imageToGrayscale, packToRows,
  // Constants
  WIDTH, BPL, FONT_HEIGHTS, FONT_CHAR_W,
  // Input constants
  BTN, FEED_MODE,
};
