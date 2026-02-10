// canvas2d.js - 2D CAD canvas with pan/zoom

import { drawGrid } from './grid.js';
import { offsetPolygonOutward } from './state.js';

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
      scale: 0.05, // pixels per mm (50px per 1000mm)
    };
    this._cameraInitialized = false;

    // Temporary drawing state
    this.preview = null; // { ... , mode: 'line'|'rect'|'polyline' }

    this._resizeObserver = new ResizeObserver(() => this.resize());
    this._resizeObserver.observe(this.canvas.parentElement);
    this.resize();
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

    if (!this._cameraInitialized && this.logicalWidth > 0 && this.logicalHeight > 0) {
      this._setInitialOriginNearBottomLeft();
    }
  }

  _setInitialOriginNearBottomLeft() {
    const margin = 80;
    this.camera.offsetX = margin;
    this.camera.offsetY = Math.max(margin, this.logicalHeight - margin);
    this._cameraInitialized = true;
  }

  screenToWorld(sx, sy) {
    return {
      x: (sx - this.camera.offsetX) / this.camera.scale,
      y: (this.camera.offsetY - sy) / this.camera.scale,
    };
  }

  worldToScreen(wx, wy) {
    return {
      x: wx * this.camera.scale + this.camera.offsetX,
      y: this.camera.offsetY - wy * this.camera.scale,
    };
  }

  zoom(delta, sx, sy) {
    const factor = delta > 0 ? 0.9 : 1.1;
    const newScale = Math.max(0.005, Math.min(1, this.camera.scale * factor));
    const ratio = newScale / this.camera.scale;
    this.camera.offsetX = sx - (sx - this.camera.offsetX) * ratio;
    this.camera.offsetY = sy - (sy - this.camera.offsetY) * ratio;
    this.camera.scale = newScale;
  }

  pan(dx, dy) {
    this.camera.offsetX += dx;
    this.camera.offsetY += dy;
  }

  _cssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  draw() {
    const ctx = this.ctx;
    const w = this.logicalWidth;
    const h = this.logicalHeight;

    ctx.fillStyle = this._cssVar('--canvas-bg');
    ctx.fillRect(0, 0, w, h);

    const nodeColor = this._cssVar('--node-color');
    const selectedColor = this._cssVar('--node-selected');
    const previewColor = this._cssVar('--preview-color');
    const memberDefault = this._cssVar('--member-default');

    drawGrid(ctx, this.camera, this.state.settings.gridSize, w, h);

    this._drawSurfaces(ctx, selectedColor);
    this._drawLoads(ctx, selectedColor);

    // Members
    for (const m of this.state.members) {
      const n1 = this.state.getNode(m.startNodeId);
      const n2 = this.state.getNode(m.endNodeId);
      if (!n1 || !n2) continue;

      const isSelected = m.id === this.state.selectedMemberId;

      if (m.type === 'column') {
        this._drawColumn(ctx, m, n1, isSelected, selectedColor, memberDefault);
        continue;
      }

      if (m.type === 'vbrace') {
        this._drawVBrace(ctx, m, n1, n2, isSelected, selectedColor, memberDefault);
        continue;
      }

      const s1 = this.worldToScreen(n1.x, n1.y);
      const s2 = this.worldToScreen(n2.x, n2.y);

      ctx.save();
      ctx.strokeStyle = isSelected ? selectedColor : (m.color || memberDefault);
      ctx.lineWidth = isSelected ? 3 : 2;
      if (m.type === 'brace' || m.type === 'hbrace') {
        ctx.setLineDash([7, 4]);
      }
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
      ctx.fillStyle = isEndOfSelected ? selectedColor : nodeColor;
      ctx.beginPath();
      ctx.arc(s.x, s.y, isEndOfSelected ? 5 : 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // Preview
    if (this.preview) {
      ctx.save();
      ctx.strokeStyle = previewColor;
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      if (this.preview.mode === 'rect') {
        const s1 = this.worldToScreen(this.preview.startX, this.preview.startY);
        const s2 = this.worldToScreen(this.preview.endX, this.preview.endY);
        const x = Math.min(s1.x, s2.x);
        const y = Math.min(s1.y, s2.y);
        const ww = Math.abs(s2.x - s1.x);
        const hh = Math.abs(s2.y - s1.y);
        ctx.rect(x, y, ww, hh);
      } else if (this.preview.mode === 'polyline' && Array.isArray(this.preview.points)) {
        const pts = this.preview.points.map(p => this.worldToScreen(p.x, p.y));
        if (pts.length > 0) {
          ctx.moveTo(pts[0].x, pts[0].y);
          for (let i = 1; i < pts.length; i++) {
            ctx.lineTo(pts[i].x, pts[i].y);
          }
        }
      } else {
        const s1 = this.worldToScreen(this.preview.startX, this.preview.startY);
        const s2 = this.worldToScreen(this.preview.endX, this.preview.endY);
        ctx.moveTo(s1.x, s1.y);
        ctx.lineTo(s2.x, s2.y);
      }
      ctx.stroke();
      ctx.restore();
    }
  }

  _drawColumn(ctx, member, node, isSelected, selectedColor, memberDefault) {
    const s = this.worldToScreen(node.x, node.y);
    const r = Math.max(4, (member.section.b / 2) * this.camera.scale);
    const color = isSelected ? selectedColor : (member.color || memberDefault);

    ctx.save();
    ctx.fillStyle = toRgba(color, 0.5);
    ctx.strokeStyle = color;
    ctx.lineWidth = isSelected ? 3 : 2;
    ctx.beginPath();
    ctx.arc(s.x, s.y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(s.x - r, s.y);
    ctx.lineTo(s.x + r, s.y);
    ctx.moveTo(s.x, s.y - r);
    ctx.lineTo(s.x, s.y + r);
    ctx.stroke();
    ctx.restore();
  }

  _drawVBrace(ctx, member, n1, n2, isSelected, selectedColor, memberDefault) {
    const offset = this.state.settings.wallDisplayOffset || 120;

    // Direction and perpendicular in world space
    const dx = n2.x - n1.x;
    const dy = n2.y - n1.y;
    const len = Math.hypot(dx, dy);
    if (len < 1) return;

    const px = -dy / len;
    const py = dx / len;

    // Offset node positions in world space
    const w1 = { x: n1.x + px * offset, y: n1.y + py * offset };
    const w2 = { x: n2.x + px * offset, y: n2.y + py * offset };

    // Convert to screen
    const s1 = this.worldToScreen(w1.x, w1.y);
    const s2 = this.worldToScreen(w2.x, w2.y);

    // Screen perpendicular for triangle height
    const sdx = s2.x - s1.x;
    const sdy = s2.y - s1.y;
    const slen = Math.hypot(sdx, sdy);
    if (slen < 4) return;

    const triH = 14;
    const spx = (-sdy / slen) * triH;
    const spy = (sdx / slen) * triH;

    // Rectangle corners: s1-s2 top edge, s4-s3 bottom edge
    const s3 = { x: s2.x + spx, y: s2.y + spy };
    const s4 = { x: s1.x + spx, y: s1.y + spy };

    const color = isSelected ? selectedColor : (member.color || memberDefault);

    ctx.save();

    // Rectangle outline
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(s1.x, s1.y);
    ctx.lineTo(s2.x, s2.y);
    ctx.lineTo(s3.x, s3.y);
    ctx.lineTo(s4.x, s4.y);
    ctx.closePath();
    ctx.stroke();

    // Diagonals
    ctx.lineWidth = isSelected ? 2.5 : 1.5;
    if (member.bracePattern === 'cross') {
      // X pattern
      ctx.beginPath();
      ctx.moveTo(s1.x, s1.y);
      ctx.lineTo(s3.x, s3.y);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(s4.x, s4.y);
      ctx.lineTo(s2.x, s2.y);
      ctx.stroke();
      // Fill rectangle
      ctx.fillStyle = toRgba(color, 0.12);
      ctx.beginPath();
      ctx.moveTo(s1.x, s1.y);
      ctx.lineTo(s2.x, s2.y);
      ctx.lineTo(s3.x, s3.y);
      ctx.lineTo(s4.x, s4.y);
      ctx.closePath();
      ctx.fill();
    } else {
      // Single diagonal: s4 → s2 (start-bottom to end-top)
      ctx.beginPath();
      ctx.moveTo(s4.x, s4.y);
      ctx.lineTo(s2.x, s2.y);
      ctx.stroke();
      // Fill right triangle: s1, s2, s4
      ctx.fillStyle = toRgba(color, 0.12);
      ctx.beginPath();
      ctx.moveTo(s1.x, s1.y);
      ctx.lineTo(s2.x, s2.y);
      ctx.lineTo(s4.x, s4.y);
      ctx.closePath();
      ctx.fill();
    }

    ctx.restore();
  }

  _drawSurfaceLine(ctx, s, isSelected, selectedColor, wallOffset) {
    const p1 = this.worldToScreen(s.x1 + wallOffset, s.y1 + wallOffset);
    const p2 = this.worldToScreen(s.x2 + wallOffset, s.y2 + wallOffset);
    const color = isSelected ? selectedColor : (s.color || '#b57a6b');

    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = isSelected ? 3 : 2;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.stroke();
    ctx.restore();
  }

  _drawSurfaces(ctx, selectedColor) {
    const wallOffset = this.state.settings.wallDisplayOffset || 120;

    for (const s of this.state.surfaces) {
      const isWall = s.type === 'wall' || s.type === 'exteriorWall';
      const isSelected = s.id === this.state.selectedSurfaceId;
      const isPolygon = s.shape === 'polygon' && Array.isArray(s.points);

      if (isPolygon) {
        const offset = isWall ? wallOffset : 0;
        const points = s.points.map(p => ({
          x: p.x + offset,
          y: p.y + offset,
        }));
        if (s.type === 'exteriorWall') {
          this._drawExteriorWallEdges(ctx, points, s, isSelected, selectedColor);
        } else {
          this._drawSurfacePolygon(ctx, points, s, isSelected, isWall, selectedColor);
        }
        continue;
      }

      if (s.shape === 'line') {
        this._drawSurfaceLine(ctx, s, isSelected, selectedColor, wallOffset);
        continue;
      }

      const x1 = isWall ? s.x1 + wallOffset : s.x1;
      const y1 = isWall ? s.y1 + wallOffset : s.y1;
      const x2 = isWall ? s.x2 + wallOffset : s.x2;
      const y2 = isWall ? s.y2 + wallOffset : s.y2;

      const p1 = this.worldToScreen(x1, y1);
      const p2 = this.worldToScreen(x2, y2);
      const sx = Math.min(p1.x, p2.x);
      const sy = Math.min(p1.y, p2.y);
      const sw = Math.abs(p2.x - p1.x);
      const sh = Math.abs(p2.y - p1.y);

      ctx.save();
      ctx.fillStyle = toRgba(s.color || (isWall ? '#b57a6b' : '#67a9cf'), isWall ? 0.22 : 0.26);
      ctx.strokeStyle = isSelected ? selectedColor : (s.color || '#67a9cf');
      ctx.lineWidth = isSelected ? 2.5 : 1.5;
      if (isWall) ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.rect(sx, sy, sw, sh);
      ctx.fill();
      ctx.stroke();
      ctx.restore();

      if (s.type === 'floor') {
        this._drawLoadArrow(ctx, sx, sy, sw, sh, s.loadDirection);
      }
    }
  }

  _drawSurfacePolygon(ctx, points, s, isSelected, isWall, selectedColor) {
    if (!points.length) return;
    const screenPoints = points.map(p => this.worldToScreen(p.x, p.y));
    ctx.save();
    ctx.fillStyle = toRgba(s.color || (isWall ? '#b57a6b' : '#67a9cf'), isWall ? 0.22 : 0.26);
    ctx.strokeStyle = isSelected ? selectedColor : (s.color || '#67a9cf');
    ctx.lineWidth = isSelected ? 2.5 : 1.5;
    if (isWall) ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.moveTo(screenPoints[0].x, screenPoints[0].y);
    for (let i = 1; i < screenPoints.length; i++) {
      ctx.lineTo(screenPoints[i].x, screenPoints[i].y);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    if (s.type === 'floor') {
      const bounds = polygonBounds(screenPoints);
      this._drawLoadArrow(ctx, bounds.x, bounds.y, bounds.w, bounds.h, s.loadDirection);
    }
  }

  _drawExteriorWallEdges(ctx, points, s, isSelected, selectedColor) {
    if (points.length < 2) return;

    const offset = this.state.settings.wallDisplayOffset || 120;
    const oPts = offsetPolygonOutward(points, offset);
    const screenOff = oPts.map(p => this.worldToScreen(p.x, p.y));
    const screenOrig = points.map(p => this.worldToScreen(p.x, p.y));

    ctx.save();

    // Thick semi-transparent gray closed polygon (outward offset)
    ctx.strokeStyle = isSelected ? selectedColor : 'rgba(140,140,140,0.5)';
    ctx.lineWidth = isSelected ? 7 : 6;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(screenOff[0].x, screenOff[0].y);
    for (let i = 1; i < screenOff.length; i++) {
      ctx.lineTo(screenOff[i].x, screenOff[i].y);
    }
    ctx.closePath();
    ctx.stroke();

    // Thin dashed line at original polygon position
    ctx.strokeStyle = isSelected ? selectedColor : (s.color || '#888888');
    ctx.lineWidth = isSelected ? 2 : 1;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.moveTo(screenOrig[0].x, screenOrig[0].y);
    for (let i = 1; i < screenOrig.length; i++) {
      ctx.lineTo(screenOrig[i].x, screenOrig[i].y);
    }
    ctx.closePath();
    ctx.stroke();

    ctx.restore();
  }

  _drawLoads(ctx, selectedColor) {
    for (const ld of this.state.loads) {
      const isSelected = ld.id === this.state.selectedLoadId;
      if (ld.type === 'areaLoad') {
        this._drawAreaLoad(ctx, ld, isSelected, selectedColor);
      } else if (ld.type === 'lineLoad') {
        this._drawLineLoad(ctx, ld, isSelected, selectedColor);
      } else if (ld.type === 'pointLoad') {
        this._drawPointLoad(ctx, ld, isSelected, selectedColor);
      }
    }
  }

  _drawAreaLoad(ctx, ld, isSelected, selectedColor) {
    const p1 = this.worldToScreen(ld.x1, ld.y1);
    const p2 = this.worldToScreen(ld.x2, ld.y2);
    const x = Math.min(p1.x, p2.x), y = Math.min(p1.y, p2.y);
    const w = Math.abs(p2.x - p1.x), h = Math.abs(p2.y - p1.y);
    const color = isSelected ? selectedColor : (ld.color || '#e57373');

    ctx.save();
    ctx.fillStyle = toRgba(color, 0.18);
    ctx.strokeStyle = color;
    ctx.lineWidth = isSelected ? 2.5 : 1.5;
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.fill();
    ctx.stroke();

    // Down arrow at center
    if (w > 20 && h > 20) {
      const cx = x + w / 2, cy = y + h / 2;
      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(cx, cy - 10);
      ctx.lineTo(cx, cy + 10);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx, cy + 10);
      ctx.lineTo(cx - 4, cy + 4);
      ctx.lineTo(cx + 4, cy + 4);
      ctx.closePath();
      ctx.fill();
    }

    // Value text
    if (ld.value !== 0 && w > 30) {
      ctx.fillStyle = color;
      ctx.font = '10px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`${ld.value} N/m²`, x + w / 2, y + h / 2 + 22);
    }
    ctx.restore();
  }

  _drawLineLoad(ctx, ld, isSelected, selectedColor) {
    const p1 = this.worldToScreen(ld.x1, ld.y1);
    const p2 = this.worldToScreen(ld.x2, ld.y2);
    const color = isSelected ? selectedColor : (ld.color || '#ffb74d');
    const len = Math.hypot(p2.x - p1.x, p2.y - p1.y);

    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = isSelected ? 4 : 3;
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.stroke();

    // Distributed arrows along the line
    if (len > 20) {
      const count = Math.max(2, Math.floor(len / 30));
      ctx.fillStyle = color;
      ctx.lineWidth = 1;
      for (let i = 0; i <= count; i++) {
        const t = i / count;
        const ax = p1.x + (p2.x - p1.x) * t;
        const ay = p1.y + (p2.y - p1.y) * t;
        // Small down arrow
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.lineTo(ax, ay + 8);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(ax, ay + 8);
        ctx.lineTo(ax - 3, ay + 4);
        ctx.lineTo(ax + 3, ay + 4);
        ctx.closePath();
        ctx.fill();
      }
    }

    // Value text at midpoint
    if (ld.value !== 0 && len > 30) {
      ctx.fillStyle = color;
      ctx.font = '10px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`${ld.value} N/m`, (p1.x + p2.x) / 2, (p1.y + p2.y) / 2 + 20);
    }
    ctx.restore();
  }

  _drawPointLoad(ctx, ld, isSelected, selectedColor) {
    const p = this.worldToScreen(ld.x1, ld.y1);
    const color = isSelected ? selectedColor : (ld.color || '#ba68c8');
    const r = 8;

    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = isSelected ? 3 : 2;

    // Cross mark
    ctx.beginPath();
    ctx.moveTo(p.x - r, p.y);
    ctx.lineTo(p.x + r, p.y);
    ctx.moveTo(p.x, p.y - r);
    ctx.lineTo(p.x, p.y + r);
    ctx.stroke();

    // Circle
    ctx.fillStyle = toRgba(color, 0.3);
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Force arrow if fz != 0 (down arrow for positive)
    if (ld.fz !== 0) {
      const dir = ld.fz > 0 ? 1 : -1;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y + dir * (r + 2));
      ctx.lineTo(p.x, p.y + dir * (r + 14));
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(p.x, p.y + dir * (r + 14));
      ctx.lineTo(p.x - 4, p.y + dir * (r + 8));
      ctx.lineTo(p.x + 4, p.y + dir * (r + 8));
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  _drawLoadArrow(ctx, x, y, w, h, dir) {
    const minSpan = 20;
    if (w < minSpan || h < minSpan) return;
    ctx.save();
    ctx.strokeStyle = '#facc15';
    ctx.fillStyle = '#facc15';
    ctx.lineWidth = 1.5;

    if (dir === 'x' || dir === 'twoWay') {
      const yMid = y + h * 0.5;
      this._arrowLine(ctx, x + w * 0.18, yMid, x + w * 0.82, yMid);
    }
    if (dir === 'y' || dir === 'twoWay') {
      const xMid = x + w * 0.5;
      this._arrowLine(ctx, xMid, y + h * 0.82, xMid, y + h * 0.18);
    }

    ctx.restore();
  }

  _arrowLine(ctx, x1, y1, x2, y2) {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();

    const angle = Math.atan2(y2 - y1, x2 - x1);
    const size = 7;

    // 終点矢印
    ctx.beginPath();
    ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - size * Math.cos(angle - Math.PI / 7), y2 - size * Math.sin(angle - Math.PI / 7));
    ctx.lineTo(x2 - size * Math.cos(angle + Math.PI / 7), y2 - size * Math.sin(angle + Math.PI / 7));
    ctx.closePath();
    ctx.fill();

    // 始点矢印
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x1 + size * Math.cos(angle - Math.PI / 7), y1 + size * Math.sin(angle - Math.PI / 7));
    ctx.lineTo(x1 + size * Math.cos(angle + Math.PI / 7), y1 + size * Math.sin(angle + Math.PI / 7));
    ctx.closePath();
    ctx.fill();
  }
}

function toRgba(hex, alpha) {
  const h = (hex || '#67a9cf').replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r},${g},${b},${alpha})`;
}

function polygonBounds(points) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}
