/**
 * PrinterConnection - ExScroller SDK integration
 * Version: 0.2.2.2026.0207
 */

import { Printer, Game, PGP, BTN, FEED_MODE } from './sdk.js';

// Singleton state
let printer = null;
let connected = false;

/**
 * Connect to printer via Web Serial
 */
export async function connect(baudRate = 921600) {
  try {
    printer = new Printer();
    await printer.connect(baudRate);
    connected = true;
    console.log('[Printer] Connected');
    return true;
  } catch (err) {
    console.error('[Printer] Connection failed:', err);
    connected = false;
    throw err;
  }
}

/**
 * Disconnect from printer
 */
export async function disconnect() {
  if (printer) {
    await printer.disconnect();
    printer = null;
    connected = false;
    console.log('[Printer] Disconnected');
  }
}

/**
 * Check if connected
 */
export function isConnected() {
  return connected && printer !== null;
}

/**
 * Get printer instance
 */
export function getPrinter() {
  return printer;
}

/**
 * Compile model to Game and send to printer
 */
export async function printModel(model) {
  if (!isConnected()) {
    throw new Error('Not connected to printer');
  }

  const game = compileModel(model);

  console.log('[Printer] Compiling and sending...');
  const frames = game.compile();
  await printer.send(frames);
  console.log('[Printer] Print complete');
}

/**
 * Compile model to SDK Game instance
 */
export function compileModel(model) {
  const game = new Game({ title: model.title });

  // Define sprites
  model.sprites.forEach(sprite => {
    if (sprite.data) {
      game.defineSprite(sprite.id, sprite.width, sprite.height, sprite.data);
    }
  });

  // Create sections
  model.sections.forEach(sectionDef => {
    const section = game.section(sectionDef.name, {
      feedMode: sectionDef.feedMode || 'auto',
      speed: sectionDef.speed || 8000,
      maxLines: sectionDef.maxLines || 600
    });

    // Add objects
    sectionDef.objects.forEach(obj => {
      addObjectToSection(section, obj);
    });

    // Default feed at end
    section.feed(20);
  });

  // Set flow
  if (model.sections.length > 0) {
    game.setFlow(...model.sections.map(s => s.name));
  }

  return game;
}

/**
 * Add object to section
 */
function addObjectToSection(section, obj) {
  switch (obj.type) {
    case 'text':
      section.text(Math.round(obj.x), obj.text, {
        size: pxToMm(obj.fontSize || 24)
      });
      break;

    case 'rect':
      section.rect(
        Math.round(obj.x),
        Math.round(obj.width),
        Math.round(obj.height),
        obj.fill ? 1 : 0
      );
      break;

    case 'sprite':
      section.sprite(obj.spriteId, Math.round(obj.x), Math.round(obj.y));
      break;

    case 'circle':
      // Circles need canvas drawing - add as raw lines
      addCircleAsRawLines(section, obj);
      break;

    case 'line':
      // Lines need canvas drawing
      addLineAsRawLines(section, obj);
      break;

    case 'image':
      // Images need to be converted to raw lines
      if (obj.rawLines) {
        obj.rawLines.forEach(line => section.rawLine(line));
      }
      break;
  }
}

/**
 * Draw circle and add as raw lines
 */
function addCircleAsRawLines(section, obj) {
  const cx = Math.round(obj.x);
  const cy = Math.round(obj.y);
  const r = Math.round(obj.radius);

  const height = r * 2 + 2;

  for (let y = 0; y < height; y++) {
    const line = new Uint8Array(72);
    const relY = y - r;

    if (obj.fill) {
      const dx = Math.sqrt(Math.max(0, r * r - relY * relY));
      const x1 = Math.max(0, Math.round(cx - dx));
      const x2 = Math.min(575, Math.round(cx + dx));

      for (let x = x1; x <= x2; x++) {
        line[x >> 3] |= (0x80 >> (x & 7));
      }
    } else {
      const dx = Math.sqrt(Math.max(0, r * r - relY * relY));
      const x1 = Math.round(cx - dx);
      const x2 = Math.round(cx + dx);

      if (x1 >= 0 && x1 < 576) line[x1 >> 3] |= (0x80 >> (x1 & 7));
      if (x2 >= 0 && x2 < 576 && x2 !== x1) line[x2 >> 3] |= (0x80 >> (x2 & 7));
    }

    section.rawLine(line);
  }
}

/**
 * Draw line and add as raw lines
 */
function addLineAsRawLines(section, obj) {
  const [x1, y1, x2, y2] = obj.points;
  const height = Math.abs(y2 - y1) + (obj.strokeWidth || 1);

  for (let y = 0; y < height; y++) {
    const line = new Uint8Array(72);
    const t = height > 1 ? y / (height - 1) : 0;
    const x = Math.round(x1 + t * (x2 - x1));

    if (x >= 0 && x < 576) {
      line[x >> 3] |= (0x80 >> (x & 7));
    }

    section.rawLine(line);
  }
}

/**
 * Helper: Convert pixels to mm (8 dots per mm)
 */
function pxToMm(px) {
  return Math.round(px / 8 * 10) / 10;
}

/**
 * Send test print
 */
export async function testPrint() {
  if (!isConnected()) {
    throw new Error('Not connected to printer');
  }

  const game = new Game({ title: 'Test Print' });

  game.section('test')
    .text(0, '=== ExScroller Studio 2 ===')
    .text(0, 'Connection Test OK!')
    .text(0, new Date().toLocaleString())
    .feed(30);

  game.setFlow('test');

  const frames = game.compile();
  await printer.send(frames);
  console.log('[Printer] Test print complete');
}

/**
 * Set print speed
 */
export async function setSpeed(pps) {
  if (!isConnected()) return;
  await printer.setSpeed(pps);
}

/**
 * Set heat time
 */
export async function setHeat(heatUs) {
  if (!isConnected()) return;
  await printer.setHeat(heatUs);
}

// Re-export SDK classes for convenience
export { Game, PGP, BTN, FEED_MODE };
