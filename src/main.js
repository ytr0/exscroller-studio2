/**
 * ExScroller Game Studio 2
 * Version: 0.2.2.2026.0207
 * Visual + Code dual-mode editor for thermal printer games
 */

import Konva from 'konva';
import { SceneModel } from './model.js';
import { VisualEditor } from './visual-editor.js';
import { CodeGenerator } from './code-generator.js';
import { PreviewRenderer } from './preview.js';
import * as PrinterConnection from './printer.js';

// =====================================================
// App State
// =====================================================
const state = {
  model: new SceneModel(),
  visualEditor: null,
  currentTab: 'visual',
  selectedObject: null,
};

// =====================================================
// Initialize
// =====================================================
document.addEventListener('DOMContentLoaded', () => {
  initVisualEditor();
  initTabs();
  initToolbox();
  initSections();
  initProperties();
  initPreview();
  initConnection();

  // Load default scene
  state.model.addSection('main');
  updateSectionList();
  updateCode();
});

// =====================================================
// Visual Editor (Konva)
// =====================================================
function initVisualEditor() {
  state.visualEditor = new VisualEditor({
    container: 'receiptCanvas',
    width: 576,
    height: 800,
    model: state.model,
    onSelect: (obj) => {
      state.selectedObject = obj;
      updateProperties(obj);
    },
    onChange: () => {
      updateCode();
      updatePreview();
    }
  });
}

// =====================================================
// Tab Switching
// =====================================================
function initTabs() {
  const tabs = document.querySelectorAll('.tab');
  const visualPane = document.getElementById('visualEditor');
  const codePane = document.getElementById('codeEditor');
  const content = document.querySelector('.editor-content');

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const mode = tab.dataset.tab;
      state.currentTab = mode;

      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');

      content.classList.remove('split');
      visualPane.classList.add('hidden');
      codePane.classList.add('hidden');

      if (mode === 'visual') {
        visualPane.classList.remove('hidden');
      } else if (mode === 'code') {
        codePane.classList.remove('hidden');
      } else if (mode === 'split') {
        content.classList.add('split');
        visualPane.classList.remove('hidden');
        codePane.classList.remove('hidden');
      }
    });
  });
}

// =====================================================
// Toolbox
// =====================================================
function initToolbox() {
  document.querySelectorAll('.tool-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const tool = btn.dataset.tool;
      addObject(tool);
    });
  });
}

function addObject(type) {
  const section = state.model.currentSection;
  if (!section) return;

  let obj;
  switch (type) {
    case 'text':
      obj = { type: 'text', x: 100, y: 50, text: 'Hello', fontSize: 24 };
      break;
    case 'rect':
      obj = { type: 'rect', x: 50, y: 50, width: 200, height: 100, fill: true };
      break;
    case 'circle':
      obj = { type: 'circle', x: 288, y: 100, radius: 50, fill: true };
      break;
    case 'line':
      obj = { type: 'line', points: [50, 50, 200, 150], strokeWidth: 2 };
      break;
    case 'image':
      // TODO: Image picker
      obj = { type: 'image', x: 50, y: 50, width: 100, height: 100, src: '' };
      break;
    case 'sprite':
      obj = { type: 'sprite', x: 100, y: 100, spriteId: 1, width: 32, height: 32 };
      break;
    default:
      return;
  }

  obj.id = state.model.nextId();
  section.objects.push(obj);
  state.visualEditor.addObject(obj);
  updateCode();
  updatePreview();
}

// =====================================================
// Sections
// =====================================================
function initSections() {
  document.getElementById('btnAddSection').addEventListener('click', () => {
    const name = prompt('Section name:', `section${state.model.sections.length + 1}`);
    if (name) {
      state.model.addSection(name);
      updateSectionList();
    }
  });
}

function updateSectionList() {
  const list = document.getElementById('sectionList');
  list.innerHTML = '';

  state.model.sections.forEach((section, i) => {
    const div = document.createElement('div');
    div.className = 'section-item' + (section === state.model.currentSection ? ' active' : '');
    div.textContent = section.name;
    div.addEventListener('click', () => {
      state.model.currentSection = section;
      updateSectionList();
      state.visualEditor.loadSection(section);
    });
    list.appendChild(div);
  });
}

// =====================================================
// Properties Panel
// =====================================================
function initProperties() {
  // Initial state
}

function updateProperties(obj) {
  const panel = document.getElementById('propPanel');

  if (!obj) {
    panel.innerHTML = '<p class="hint">Select an object to edit properties</p>';
    return;
  }

  let html = '';

  // Common properties
  html += propRow('x', obj.x, 'number');
  html += propRow('y', obj.y, 'number');

  // Type-specific
  switch (obj.type) {
    case 'text':
      html += propRow('text', obj.text, 'text');
      html += propRow('fontSize', obj.fontSize, 'number');
      break;
    case 'rect':
      html += propRow('width', obj.width, 'number');
      html += propRow('height', obj.height, 'number');
      html += propRow('fill', obj.fill, 'checkbox');
      break;
    case 'circle':
      html += propRow('radius', obj.radius, 'number');
      html += propRow('fill', obj.fill, 'checkbox');
      break;
    case 'line':
      html += propRow('strokeWidth', obj.strokeWidth, 'number');
      break;
  }

  // Rotation (common)
  html += propRow('rotation', obj.rotation || 0, 'number');

  panel.innerHTML = html;

  // Bind events
  panel.querySelectorAll('input').forEach(input => {
    input.addEventListener('change', () => {
      const prop = input.dataset.prop;
      let value = input.type === 'checkbox' ? input.checked :
                  input.type === 'number' ? parseFloat(input.value) : input.value;
      obj[prop] = value;
      state.visualEditor.updateObject(obj);
      updateCode();
      updatePreview();
    });
  });
}

function propRow(label, value, type) {
  const inputType = type === 'checkbox' ? 'checkbox' : (type === 'number' ? 'number' : 'text');
  const checked = type === 'checkbox' && value ? 'checked' : '';
  const val = type === 'checkbox' ? '' : `value="${value}"`;

  return `
    <div class="prop-row">
      <label>${label}</label>
      <input type="${inputType}" data-prop="${label}" ${val} ${checked}>
    </div>
  `;
}

// =====================================================
// Code Generation
// =====================================================
function updateCode() {
  const code = CodeGenerator.generate(state.model);
  document.getElementById('codeArea').value = code;
}

// =====================================================
// Preview
// =====================================================
let previewRenderer;

function initPreview() {
  const canvas = document.getElementById('previewCanvas');
  previewRenderer = new PreviewRenderer(canvas);
}

function updatePreview() {
  if (previewRenderer) {
    previewRenderer.render(state.model);
  }
}

// =====================================================
// Printer Connection
// =====================================================
function initConnection() {
  const btnConnect = document.getElementById('btnConnect');
  const btnPrint = document.getElementById('btnPrint');
  const btnTest = document.getElementById('btnTest');
  const statusEl = document.getElementById('status');

  // Connect button
  btnConnect.addEventListener('click', async () => {
    if (PrinterConnection.isConnected()) {
      // Disconnect
      try {
        await PrinterConnection.disconnect();
        updateConnectionUI(false);
      } catch (err) {
        console.error('Disconnect error:', err);
      }
    } else {
      // Connect
      try {
        btnConnect.disabled = true;
        statusEl.textContent = 'Connecting...';
        statusEl.className = 'status connecting';

        await PrinterConnection.connect();
        updateConnectionUI(true);
      } catch (err) {
        console.error('Connect error:', err);
        statusEl.textContent = err.message || 'Connection failed';
        statusEl.className = 'status error';
      } finally {
        btnConnect.disabled = false;
      }
    }
  });

  // Print button
  btnPrint.addEventListener('click', async () => {
    if (!PrinterConnection.isConnected()) {
      alert('Please connect to printer first');
      return;
    }

    try {
      btnPrint.disabled = true;
      btnPrint.textContent = 'Printing...';

      await PrinterConnection.printModel(state.model);

      btnPrint.textContent = 'Print';
    } catch (err) {
      console.error('Print error:', err);
      alert('Print failed: ' + err.message);
    } finally {
      btnPrint.disabled = false;
      btnPrint.textContent = 'Print';
    }
  });

  // Test button
  if (btnTest) {
    btnTest.addEventListener('click', async () => {
      if (!PrinterConnection.isConnected()) {
        alert('Please connect to printer first');
        return;
      }

      try {
        btnTest.disabled = true;
        await PrinterConnection.testPrint();
      } catch (err) {
        console.error('Test print error:', err);
        alert('Test print failed: ' + err.message);
      } finally {
        btnTest.disabled = false;
      }
    });
  }

  // Speed slider
  const speedSlider = document.getElementById('speedSlider');
  const speedValue = document.getElementById('speedValue');
  if (speedSlider) {
    speedSlider.addEventListener('input', () => {
      const pps = parseInt(speedSlider.value);
      speedValue.textContent = pps;
    });
    speedSlider.addEventListener('change', async () => {
      const pps = parseInt(speedSlider.value);
      if (PrinterConnection.isConnected()) {
        await PrinterConnection.setSpeed(pps);
      }
    });
  }

  // Heat slider
  const heatSlider = document.getElementById('heatSlider');
  const heatValue = document.getElementById('heatValue');
  if (heatSlider) {
    heatSlider.addEventListener('input', () => {
      const us = parseInt(heatSlider.value);
      heatValue.textContent = us;
    });
    heatSlider.addEventListener('change', async () => {
      const us = parseInt(heatSlider.value);
      if (PrinterConnection.isConnected()) {
        await PrinterConnection.setHeat(us);
      }
    });
  }
}

function updateConnectionUI(connected) {
  const btnConnect = document.getElementById('btnConnect');
  const btnPrint = document.getElementById('btnPrint');
  const btnTest = document.getElementById('btnTest');
  const statusEl = document.getElementById('status');

  if (connected) {
    btnConnect.textContent = 'Disconnect';
    btnConnect.classList.add('connected');
    btnPrint.disabled = false;
    if (btnTest) btnTest.disabled = false;
    statusEl.textContent = 'Connected';
    statusEl.className = 'status connected';
  } else {
    btnConnect.textContent = 'Connect';
    btnConnect.classList.remove('connected');
    btnPrint.disabled = true;
    if (btnTest) btnTest.disabled = true;
    statusEl.textContent = 'Not connected';
    statusEl.className = 'status';
  }
}
