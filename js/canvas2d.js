// canvas2d.js - 2D CAD canvas with pan/zoom

import { drawGrid } from './grid.js';

export class Canvas2D {
  constructor(canvasEl, state) {
    this.canvas = canvasEl;
    this.ctx = canvasEl.getContext('2d');
    this.state = state;

    // Camera: world-to-screen transform
    // screenX = worldX * scale + offsetX
    this.camera = {
      offsetX: 0,
      offsetY: 0,
      scale: 50, // pixels per meter
    };

    // Temporary drawing state (for member tool preview)
    this.preview = null; // { startX, startY, endX, endY }

    this._resizeObserver = new ResizeObserver(() => this.resize());
    this._resizeObserver.observe(this.canvas.parentElement);
    this.resize();

    // Center origin
    this.camera.offsetX = this.canvas.width / 2;
    this.camera.offsetY = this.canvas.height / 2;
  }

  resize() {
    const parent = this.canvas.parentElement;
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = parent.clientWidth * dpr;
    this.canvas.height = parent.clientHeight * dpr;
    this.canvas.style.width = parent.clientWidth + 'px';
    this.canvas.style.height = parent.clientHeight + 'px';
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.logicalWidth = parent.clientWidth;
    this.logicalHeight = parent.clientHeight;
  }

  // Convert screen coords to world coords
  screenToWorld(sx, sy) {
    return {
      x: (sx - this.camera.offsetX) / this.camera.scale,
      y: (sy - this.camera.offsetY) / this.camera.scale,
    };
  }

  // Convert world coords to screen coords
  worldToScreen(wx, wy) {
    return {
      x: wx * this.camera.scale + this.camera.offsetX,
      y: wy * this.camera.scale + this.camera.offsetY,
    };
  }

  // Zoom centered on screen point
  zoom(delta, sx, sy) {
    const factor = delta > 0 ? 0.9 : 1.1;
    const newScale = Math.max(5, Math.min(500, this.camera.scale * factor));
    const ratio = newScale / this.camera.scale;
    this.camera.offsetX = sx - (sx - this.camera.offsetX) * ratio;
    this.camera.offsetY = sy - (sy - this.camera.offsetY) * ratio;
    this.camera.scale = newScale;
  }

  pan(dx, dy) {
    this.camera.offsetX += dx;
    this.camera.offsetY += dy;
  }

  draw() {
    const ctx = this.ctx;
    const w = this.logicalWidth;
    const h = this.logicalHeight;

    // Clear
    ctx.clearRect(0, 0, w, h);

    // Grid
    drawGrid(ctx, this.camera, this.state.settings.gridSize, w, h);

    // Members
    for (const m of this.state.members) {
      const n1 = this.state.getNode(m.startNodeId);
      const n2 = this.state.getNode(m.endNodeId);
      if (!n1 || !n2) continue;

      const s1 = this.worldToScreen(n1.x, n1.y);
      const s2 = this.worldToScreen(n2.x, n2.y);

      const isSelected = m.id === this.state.selectedMemberId;

      ctx.save();
      ctx.strokeStyle = isSelected ? '#ffd700' : (m.color || '#666666');
      ctx.lineWidth = isSelected ? 3 : 2;
      ctx.beginPath();
      ctx.moveTo(s1.x, s1.y);
      ctx.lineTo(s2.x, s2.y);
      ctx.stroke();
      ctx.restore();
    }

    // Nodes
    for (const n of this.state.nodes) {
      const s = this.worldToScreen(n.x, n.y);
      const isEndOfSelected = this.state.selectedMemberId &&
        (() => {
          const m = this.state.getMember(this.state.selectedMemberId);
          return m && (m.startNodeId === n.id || m.endNodeId === n.id);
        })();

      ctx.save();
      ctx.fillStyle = isEndOfSelected ? '#ffd700' : '#89b4fa';
      ctx.beginPath();
      ctx.arc(s.x, s.y, isEndOfSelected ? 5 : 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // Preview line (member tool)
    if (this.preview) {
      const s1 = this.worldToScreen(this.preview.startX, this.preview.startY);
      const s2 = this.worldToScreen(this.preview.endX, this.preview.endY);
      ctx.save();
      ctx.strokeStyle = 'rgba(137,180,250,0.6)';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.moveTo(s1.x, s1.y);
      ctx.lineTo(s2.x, s2.y);
      ctx.stroke();
      ctx.restore();
    }
  }
}
