// tools.js - Select and Member tools

import { applySnap } from './grid.js';

export class ToolManager {
  constructor(canvas2d, state, history, onUpdate) {
    this.c = canvas2d;
    this.state = state;
    this.history = history;
    this.onUpdate = onUpdate;

    // Internal state
    this._isPanning = false;
    this._panStart = null;
    this._spaceDown = false;

    // Member tool state
    this._memberStart = null; // { x, y, nodeId? }

    // Select tool drag state
    this._dragTarget = null; // { type: 'node'|'member', id, offsetX?, offsetY? }
    this._isDragging = false;
    this._dragStartPos = null;

    this._setupEvents();
  }

  _setupEvents() {
    const el = this.c.canvas;

    el.addEventListener('mousedown', e => this._onMouseDown(e));
    el.addEventListener('mousemove', e => this._onMouseMove(e));
    el.addEventListener('mouseup', e => this._onMouseUp(e));
    el.addEventListener('wheel', e => this._onWheel(e), { passive: false });
    el.addEventListener('contextmenu', e => e.preventDefault());

    window.addEventListener('keydown', e => this._onKeyDown(e));
    window.addEventListener('keyup', e => this._onKeyUp(e));
  }

  _getScreenPos(e) {
    const rect = this.c.canvas.getBoundingClientRect();
    return { sx: e.clientX - rect.left, sy: e.clientY - rect.top };
  }

  _getWorldPos(e) {
    const { sx, sy } = this._getScreenPos(e);
    return this.c.screenToWorld(sx, sy);
  }

  _getSnappedPos(e) {
    const world = this._getWorldPos(e);
    if (e.shiftKey && this._memberStart) {
      return this._constrainAngle(this._memberStart, world);
    }
    return applySnap(world.x, world.y, this.state, this.c.camera);
  }

  _constrainAngle(origin, pos) {
    const dx = pos.x - origin.x;
    const dy = pos.y - origin.y;
    const len = Math.hypot(dx, dy);
    if (len === 0) return { x: origin.x, y: origin.y };

    const angle = Math.atan2(dy, dx);
    const snapAngles = [0, Math.PI / 4, Math.PI / 2, 3 * Math.PI / 4, Math.PI,
      -Math.PI / 4, -Math.PI / 2, -3 * Math.PI / 4];
    let closest = snapAngles[0];
    let minDiff = Math.abs(angle - snapAngles[0]);
    for (const a of snapAngles) {
      const diff = Math.abs(angle - a);
      if (diff < minDiff) { minDiff = diff; closest = a; }
    }
    return {
      x: origin.x + len * Math.cos(closest),
      y: origin.y + len * Math.sin(closest),
    };
  }

  // --- Mouse Events ---

  _onMouseDown(e) {
    const { sx, sy } = this._getScreenPos(e);

    // Pan: middle button or space+left
    if (e.button === 1 || (e.button === 0 && this._spaceDown)) {
      this._isPanning = true;
      this._panStart = { x: sx, y: sy };
      e.preventDefault();
      return;
    }

    if (e.button !== 0) return;

    const tool = this.state.currentTool;

    if (tool === 'select') {
      this._selectDown(e);
    } else if (tool === 'member') {
      this._memberDown(e);
    }
  }

  _onMouseMove(e) {
    const { sx, sy } = this._getScreenPos(e);

    // Pan
    if (this._isPanning && this._panStart) {
      this.c.pan(sx - this._panStart.x, sy - this._panStart.y);
      this._panStart = { x: sx, y: sy };
      this.onUpdate();
      return;
    }

    const tool = this.state.currentTool;

    if (tool === 'select') {
      this._selectMove(e);
    } else if (tool === 'member') {
      this._memberMove(e);
    }

    // Update status bar coords
    const world = this._getWorldPos(e);
    this._updateCoords(world.x, world.y);
  }

  _onMouseUp(e) {
    if (this._isPanning) {
      this._isPanning = false;
      this._panStart = null;
      return;
    }

    if (this.state.currentTool === 'select') {
      this._selectUp(e);
    }
  }

  _onWheel(e) {
    e.preventDefault();
    const { sx, sy } = this._getScreenPos(e);
    this.c.zoom(e.deltaY, sx, sy);
    this.onUpdate();
  }

  _onKeyDown(e) {
    if (e.code === 'Space') {
      this._spaceDown = true;
      e.preventDefault();
    }

    // Esc: cancel or deselect
    if (e.key === 'Escape') {
      if (this.state.currentTool === 'member' && this._memberStart) {
        this._memberStart = null;
        this.c.preview = null;
        this.onUpdate();
      } else {
        this.state.selectedMemberId = null;
        this.onUpdate();
      }
    }

    // Delete
    if (e.key === 'Delete' || e.key === 'Backspace') {
      if (this.state.selectedMemberId) {
        this.history.save();
        this.state.removeMember(this.state.selectedMemberId);
        this.onUpdate();
      }
    }

    // Undo/Redo
    if (e.ctrlKey || e.metaKey) {
      if (e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        if (this.history.undo()) this.onUpdate();
      } else if (e.key === 'y' || (e.key === 'z' && e.shiftKey)) {
        e.preventDefault();
        if (this.history.redo()) this.onUpdate();
      }
    }
  }

  _onKeyUp(e) {
    if (e.code === 'Space') {
      this._spaceDown = false;
    }
  }

  // --- Select Tool ---

  _selectDown(e) {
    const world = this._getWorldPos(e);
    const tolerance = 8 / this.c.camera.scale;

    // Check node hit first (for dragging endpoints)
    const node = this.state.findNodeAt(world.x, world.y, tolerance);
    if (node) {
      // Find member this node belongs to
      const member = this.state.members.find(
        m => m.startNodeId === node.id || m.endNodeId === node.id
      );
      if (member) {
        this.state.selectedMemberId = member.id;
        this._dragTarget = { type: 'node', id: node.id };
        this._isDragging = false;
        this._dragStartPos = { x: world.x, y: world.y };
        this.onUpdate();
        return;
      }
    }

    // Check member hit
    const member = this.state.findMemberAt(world.x, world.y, tolerance);
    if (member) {
      this.state.selectedMemberId = member.id;
      const n1 = this.state.getNode(member.startNodeId);
      const n2 = this.state.getNode(member.endNodeId);
      this._dragTarget = {
        type: 'member',
        id: member.id,
        offsetStartX: n1.x - world.x,
        offsetStartY: n1.y - world.y,
        offsetEndX: n2.x - world.x,
        offsetEndY: n2.y - world.y,
      };
      this._isDragging = false;
      this._dragStartPos = { x: world.x, y: world.y };
      this.onUpdate();
      return;
    }

    // Clicked empty space
    this.state.selectedMemberId = null;
    this._dragTarget = null;
    this.onUpdate();
  }

  _selectMove(e) {
    if (!this._dragTarget || !this._dragStartPos) return;

    const world = this._getWorldPos(e);
    const dx = world.x - this._dragStartPos.x;
    const dy = world.y - this._dragStartPos.y;

    if (!this._isDragging && Math.hypot(dx, dy) * this.c.camera.scale > 3) {
      this._isDragging = true;
      this.history.save();
    }

    if (!this._isDragging) return;

    const snapped = applySnap(world.x, world.y, this.state, this.c.camera);

    if (this._dragTarget.type === 'node') {
      this.state.updateNode(this._dragTarget.id, { x: snapped.x, y: snapped.y });
    } else if (this._dragTarget.type === 'member') {
      const dt = this._dragTarget;
      const member = this.state.getMember(dt.id);
      if (member) {
        const newStartX = snapped.x + dt.offsetStartX;
        const newStartY = snapped.y + dt.offsetStartY;
        const newEndX = snapped.x + dt.offsetEndX;
        const newEndY = snapped.y + dt.offsetEndY;
        this.state.updateNode(member.startNodeId, { x: newStartX, y: newStartY });
        this.state.updateNode(member.endNodeId, { x: newEndX, y: newEndY });
      }
    }

    this.onUpdate();
  }

  _selectUp(_e) {
    this._dragTarget = null;
    this._isDragging = false;
    this._dragStartPos = null;
  }

  // --- Member Tool ---

  _memberDown(e) {
    const snapped = this._getSnappedPos(e);

    if (!this._memberStart) {
      // First click: set start point
      this._memberStart = { x: snapped.x, y: snapped.y };
    } else {
      // Second click: create member
      const start = this._memberStart;
      const end = snapped;

      // Skip zero-length
      if (Math.hypot(end.x - start.x, end.y - start.y) < 0.01) return;

      this.history.save();

      // Reuse existing nodes or create new ones
      let startNode = this.state.findNodeAt(start.x, start.y, 0.01);
      if (!startNode) startNode = this.state.addNode(start.x, start.y);

      let endNode = this.state.findNodeAt(end.x, end.y, 0.01);
      if (!endNode) endNode = this.state.addNode(end.x, end.y);

      this.state.addMember(startNode.id, endNode.id);

      this._memberStart = null;
      this.c.preview = null;
      this.onUpdate();
    }
  }

  _memberMove(e) {
    if (!this._memberStart) return;

    const snapped = this._getSnappedPos(e);
    this.c.preview = {
      startX: this._memberStart.x,
      startY: this._memberStart.y,
      endX: snapped.x,
      endY: snapped.y,
    };
    this.onUpdate();
  }

  // --- Status ---

  _updateCoords(x, y) {
    const el = document.getElementById('status-coords');
    if (el) el.textContent = `X: ${x.toFixed(2)}  Y: ${y.toFixed(2)}`;
  }
}
