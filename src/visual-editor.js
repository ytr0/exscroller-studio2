/**
 * VisualEditor - Konva-based visual editing canvas
 */

import Konva from 'konva';

export class VisualEditor {
  constructor(options) {
    this.container = options.container;
    this.model = options.model;
    this.onSelect = options.onSelect || (() => {});
    this.onChange = options.onChange || (() => {});

    this.stage = new Konva.Stage({
      container: this.container,
      width: options.width || 576,
      height: options.height || 800
    });

    // Background layer (receipt paper)
    this.bgLayer = new Konva.Layer();
    this.stage.add(this.bgLayer);

    const bg = new Konva.Rect({
      x: 0, y: 0,
      width: this.stage.width(),
      height: this.stage.height(),
      fill: '#f5f5f0'
    });
    this.bgLayer.add(bg);

    // Objects layer
    this.layer = new Konva.Layer();
    this.stage.add(this.layer);

    // Transformer for selection
    this.transformer = new Konva.Transformer({
      rotateEnabled: true,
      enabledAnchors: ['top-left', 'top-right', 'bottom-left', 'bottom-right'],
      boundBoxFunc: (oldBox, newBox) => {
        // Limit minimum size
        if (newBox.width < 10 || newBox.height < 10) {
          return oldBox;
        }
        return newBox;
      }
    });
    this.layer.add(this.transformer);

    // Object ID to Konva node mapping
    this.nodes = new Map();

    // Click on stage to deselect
    this.stage.on('click tap', (e) => {
      if (e.target === this.stage || e.target === bg) {
        this.transformer.nodes([]);
        this.onSelect(null);
      }
    });

    // Draw initial
    this.layer.draw();
  }

  loadSection(section) {
    // Clear existing objects
    this.nodes.forEach(node => node.destroy());
    this.nodes.clear();
    this.transformer.nodes([]);

    // Add objects from section
    section.objects.forEach(obj => this.addObject(obj, false));
    this.layer.draw();
  }

  addObject(obj, triggerChange = true) {
    let node;

    switch (obj.type) {
      case 'text':
        node = new Konva.Text({
          x: obj.x,
          y: obj.y,
          text: obj.text,
          fontSize: obj.fontSize || 24,
          fontFamily: 'Arial',
          fill: 'black',
          draggable: true
        });
        break;

      case 'rect':
        node = new Konva.Rect({
          x: obj.x,
          y: obj.y,
          width: obj.width,
          height: obj.height,
          fill: obj.fill ? 'black' : undefined,
          stroke: 'black',
          strokeWidth: obj.fill ? 0 : 2,
          draggable: true
        });
        break;

      case 'circle':
        node = new Konva.Circle({
          x: obj.x,
          y: obj.y,
          radius: obj.radius,
          fill: obj.fill ? 'black' : undefined,
          stroke: 'black',
          strokeWidth: obj.fill ? 0 : 2,
          draggable: true
        });
        break;

      case 'line':
        node = new Konva.Line({
          points: obj.points,
          stroke: 'black',
          strokeWidth: obj.strokeWidth || 2,
          draggable: true
        });
        break;

      case 'image':
        // Placeholder rectangle for image
        node = new Konva.Rect({
          x: obj.x,
          y: obj.y,
          width: obj.width,
          height: obj.height,
          fill: '#ccc',
          stroke: 'black',
          strokeWidth: 1,
          draggable: true
        });
        // TODO: Load actual image
        break;

      case 'sprite':
        // Placeholder for sprite
        node = new Konva.Rect({
          x: obj.x,
          y: obj.y,
          width: obj.width || 32,
          height: obj.height || 32,
          fill: '#888',
          stroke: 'black',
          strokeWidth: 1,
          draggable: true
        });
        break;

      default:
        return;
    }

    // Set rotation if present
    if (obj.rotation) {
      node.rotation(obj.rotation);
    }

    // Store reference
    node.id(obj.id);
    this.nodes.set(obj.id, node);
    this.layer.add(node);

    // Selection on click
    node.on('click tap', () => {
      this.transformer.nodes([node]);
      this.onSelect(obj);
    });

    // Sync position on drag
    node.on('dragend', () => {
      obj.x = node.x();
      obj.y = node.y();
      this.onChange();
    });

    // Sync transform on transform end
    node.on('transformend', () => {
      obj.x = node.x();
      obj.y = node.y();
      obj.rotation = node.rotation();

      // Update size for resizable objects
      if (obj.type === 'rect' || obj.type === 'image' || obj.type === 'sprite') {
        obj.width = Math.round(node.width() * node.scaleX());
        obj.height = Math.round(node.height() * node.scaleY());
        node.scaleX(1);
        node.scaleY(1);
      } else if (obj.type === 'circle') {
        obj.radius = Math.round(node.radius() * node.scaleX());
        node.scaleX(1);
        node.scaleY(1);
      } else if (obj.type === 'text') {
        obj.fontSize = Math.round((obj.fontSize || 24) * node.scaleX());
        node.fontSize(obj.fontSize);
        node.scaleX(1);
        node.scaleY(1);
      }

      this.onChange();
    });

    if (triggerChange) {
      this.layer.draw();
      this.onChange();
    }

    return node;
  }

  updateObject(obj) {
    const node = this.nodes.get(obj.id);
    if (!node) return;

    node.x(obj.x);
    node.y(obj.y);
    node.rotation(obj.rotation || 0);

    switch (obj.type) {
      case 'text':
        node.text(obj.text);
        node.fontSize(obj.fontSize);
        break;
      case 'rect':
        node.width(obj.width);
        node.height(obj.height);
        node.fill(obj.fill ? 'black' : undefined);
        node.strokeWidth(obj.fill ? 0 : 2);
        break;
      case 'circle':
        node.radius(obj.radius);
        node.fill(obj.fill ? 'black' : undefined);
        node.strokeWidth(obj.fill ? 0 : 2);
        break;
      case 'line':
        node.strokeWidth(obj.strokeWidth);
        break;
    }

    this.layer.draw();
  }

  removeObject(objId) {
    const node = this.nodes.get(objId);
    if (node) {
      node.destroy();
      this.nodes.delete(objId);
      this.transformer.nodes([]);
      this.layer.draw();
    }
  }

  getStage() {
    return this.stage;
  }
}
