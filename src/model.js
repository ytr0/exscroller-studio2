/**
 * SceneModel - Shared data model for visual and code editors
 */

export class SceneModel {
  constructor() {
    this.title = 'Untitled Game';
    this.sections = [];
    this.currentSection = null;
    this.sprites = new Map();
    this._idCounter = 0;
  }

  nextId() {
    return `obj_${++this._idCounter}`;
  }

  addSection(name, options = {}) {
    const section = {
      name,
      objects: [],
      feedMode: options.feedMode || 'auto',
      speed: options.speed || 8000,
      maxLines: options.maxLines || 600
    };
    this.sections.push(section);
    this.currentSection = section;
    return section;
  }

  removeSection(name) {
    const idx = this.sections.findIndex(s => s.name === name);
    if (idx >= 0) {
      this.sections.splice(idx, 1);
      if (this.currentSection?.name === name) {
        this.currentSection = this.sections[0] || null;
      }
    }
  }

  getSection(name) {
    return this.sections.find(s => s.name === name);
  }

  addSprite(id, width, height, data) {
    this.sprites.set(id, { id, width, height, data });
  }

  toJSON() {
    return {
      title: this.title,
      sections: this.sections.map(s => ({
        name: s.name,
        feedMode: s.feedMode,
        speed: s.speed,
        maxLines: s.maxLines,
        objects: s.objects
      })),
      sprites: Array.from(this.sprites.values())
    };
  }

  fromJSON(json) {
    this.title = json.title || 'Untitled Game';
    this.sections = json.sections || [];
    this.currentSection = this.sections[0] || null;
    this.sprites.clear();
    (json.sprites || []).forEach(s => this.sprites.set(s.id, s));

    // Regenerate IDs
    this._idCounter = 0;
    this.sections.forEach(section => {
      section.objects.forEach(obj => {
        if (!obj.id) obj.id = this.nextId();
        const num = parseInt(obj.id.replace('obj_', ''), 10);
        if (num > this._idCounter) this._idCounter = num;
      });
    });
  }
}
