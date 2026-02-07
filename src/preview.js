/**
 * PreviewRenderer - Render 1-bit thermal printer preview
 */

export class PreviewRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.width = 576;
  }

  render(model) {
    // Calculate total height from all sections
    let totalHeight = 0;
    model.sections.forEach(section => {
      section.objects.forEach(obj => {
        const bottom = this.getObjectBottom(obj);
        if (bottom > totalHeight) totalHeight = bottom;
      });
    });
    totalHeight = Math.max(200, totalHeight + 50);

    // Resize canvas if needed
    this.canvas.width = this.width;
    this.canvas.height = totalHeight;

    // Clear with white
    this.ctx.fillStyle = '#f5f5f0';
    this.ctx.fillRect(0, 0, this.width, totalHeight);

    // Draw each section's objects
    this.ctx.fillStyle = 'black';
    this.ctx.strokeStyle = 'black';

    let offsetY = 0;
    model.sections.forEach(section => {
      section.objects.forEach(obj => {
        this.drawObject(obj, offsetY);
      });
      // TODO: Calculate section height for proper offset
    });

    // Apply 1-bit dithering effect (simple threshold)
    this.apply1bitEffect();
  }

  getObjectBottom(obj) {
    switch (obj.type) {
      case 'text':
        return obj.y + (obj.fontSize || 24);
      case 'rect':
      case 'image':
      case 'sprite':
        return obj.y + (obj.height || 50);
      case 'circle':
        return obj.y + (obj.radius || 50);
      case 'line':
        return Math.max(obj.points[1], obj.points[3]);
      default:
        return obj.y + 50;
    }
  }

  drawObject(obj, offsetY = 0) {
    const ctx = this.ctx;

    ctx.save();

    // Apply rotation if present
    if (obj.rotation) {
      const cx = obj.x + (obj.width || 0) / 2;
      const cy = obj.y + offsetY + (obj.height || 0) / 2;
      ctx.translate(cx, cy);
      ctx.rotate(obj.rotation * Math.PI / 180);
      ctx.translate(-cx, -cy);
    }

    switch (obj.type) {
      case 'text':
        ctx.font = `${obj.fontSize || 24}px Arial`;
        ctx.fillText(obj.text, obj.x, obj.y + offsetY + (obj.fontSize || 24));
        break;

      case 'rect':
        if (obj.fill) {
          ctx.fillRect(obj.x, obj.y + offsetY, obj.width, obj.height);
        } else {
          ctx.strokeRect(obj.x, obj.y + offsetY, obj.width, obj.height);
        }
        break;

      case 'circle':
        ctx.beginPath();
        ctx.arc(obj.x, obj.y + offsetY, obj.radius, 0, Math.PI * 2);
        if (obj.fill) {
          ctx.fill();
        } else {
          ctx.stroke();
        }
        break;

      case 'line':
        ctx.lineWidth = obj.strokeWidth || 2;
        ctx.beginPath();
        ctx.moveTo(obj.points[0], obj.points[1] + offsetY);
        ctx.lineTo(obj.points[2], obj.points[3] + offsetY);
        ctx.stroke();
        break;

      case 'image':
      case 'sprite':
        // Placeholder
        ctx.fillStyle = '#888';
        ctx.fillRect(obj.x, obj.y + offsetY, obj.width || 50, obj.height || 50);
        ctx.fillStyle = 'black';
        break;
    }

    ctx.restore();
  }

  apply1bitEffect() {
    const imageData = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
    const data = imageData.data;

    // Simple threshold dithering
    for (let i = 0; i < data.length; i += 4) {
      const gray = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
      const bit = gray > 128 ? 255 : 0;
      data[i] = bit;
      data[i + 1] = bit;
      data[i + 2] = bit;
    }

    this.ctx.putImageData(imageData, 0, 0);
  }
}
