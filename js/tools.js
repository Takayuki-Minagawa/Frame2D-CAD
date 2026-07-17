// tools.js - Select / Member / Surface tools

import {
  MEMBER_SPLIT_TOLERANCE_MM,
  PICK_TOLERANCE_PX,
  POLYLINE_CLOSE_TOLERANCE_PX,
  WIDE_PICK_TOLERANCE_PX,
} from './constants.js';
import { segmentParameter } from './geometry-utils.js';
import { applySnap } from './grid.js';
import { t } from './i18n.js';
import { isSlopedSurfaceType, isWallSurfaceType } from './state.js';

function projectSplitPointTarget(member) {
  return Boolean(
    member &&
    member.type === 'beam' &&
    member.geometryMode !== 'explicit3d' &&
    !member.roofRole
  );
}

// Projects an already-snapped cursor position onto the selected beam and
// rejects cuts within the endpoint tolerance. Keeping this calculation here
// makes the preview and the model operation agree on the point shown to users.
export function projectSplitPoint(state, member, point, tolerance = MEMBER_SPLIT_TOLERANCE_MM) {
  if (!member || member.type !== 'beam' || member.geometryMode === 'explicit3d' || member.roofRole) {
    return null;
  }
  const start = state.getNode(member.startNodeId);
  const end = state.getNode(member.endNodeId);
  if (!start || !end) return null;
  const length = Math.hypot(end.x - start.x, end.y - start.y);
  if (length <= 0) return null;
  const parameter = segmentParameter(
    point.x,
    point.y,
    start.x,
    start.y,
    end.x,
    end.y
  );
  const endpointParameter = Math.max(0, Number(tolerance) || 0) / length;
  if (parameter <= endpointParameter || parameter >= 1 - endpointParameter) return null;
  return {
    x: start.x + parameter * (end.x - start.x),
    y: start.y + parameter * (end.y - start.y),
  };
}

export class ToolManager {
  constructor(canvas2d, state, history, onUpdate, callbacks = {}) {
    this.canvas2d = canvas2d;
    this.state = state;
    this.history = history;
    this.onUpdate = onUpdate;
    this.callbacks = callbacks;

    // Internal state
    this._isPanning = false;
    this._panStart = null;
    this._spaceDown = false;

    // Draw tool states
    this._memberStart = null;
    this._surfaceStart = null;
    this._surfacePolyline = [];
    this._loadStart = null;
    this._measureStart = null;
    this._splitPointMemberId = null;
    this._splitPointPreviousTool = null;

    // Select tool drag state
    this._dragTarget = null; // { type: 'node'|'member'|'group', ... }
    this._isDragging = false;
    this._dragStartPos = null;
    this._marqueeStart = null;
    this._marqueeAdditive = false;

    this._setupEvents();
  }

  // Starts the temporary beam split interaction. The selected member is kept
  // as the target until the user confirms a point, presses Escape, changes
  // tools, or clears/replaces the selection.
  startSplitPoint(memberId) {
    const member = this.state.getMember(memberId);
    if (!projectSplitPointTarget(member)) return false;
    if (this._splitPointMemberId === memberId && this.state.currentTool === 'splitPoint') return true;

    this._memberStart = null;
    this._surfaceStart = null;
    this._surfacePolyline = [];
    this._loadStart = null;
    this._measureStart = null;
    this.canvas2d.measure = null;
    this.canvas2d.preview = null;
    this._splitPointPreviousTool = this.state.currentTool === 'splitPoint'
      ? (this._splitPointPreviousTool || 'select')
      : this.state.currentTool;
    this._splitPointMemberId = memberId;
    this.state.select('member', memberId);
    this.state.currentTool = 'splitPoint';
    this.callbacks.onTemporaryToolChange?.('splitPoint');
    this.onUpdate();
    return true;
  }

  isSplitPointActive() {
    return Boolean(this._splitPointMemberId && this.state.currentTool === 'splitPoint');
  }

  // Called by app-level selection paths (for example, 3D picking) before a
  // render so a stale temporary tool never operates on a deselected member.
  syncSplitPointSelection() {
    if (!this._splitPointMemberId) return false;
    if (this.state.currentTool === 'splitPoint' &&
        this.state.isMemberSelected(this._splitPointMemberId) &&
        this.state.getMember(this._splitPointMemberId)) {
      return true;
    }
    this.cancelSplitPoint({ restoreTool: this.state.currentTool === 'splitPoint', update: false });
    return false;
  }

  cancelSplitPoint({ restoreTool = true, update = true } = {}) {
    if (!this._splitPointMemberId && this.state.currentTool !== 'splitPoint') return false;
    const previousTool = this._splitPointPreviousTool || 'select';
    this._splitPointMemberId = null;
    this._splitPointPreviousTool = null;
    this.canvas2d.preview = null;
    if (restoreTool && this.state.currentTool === 'splitPoint') {
      this.state.currentTool = previousTool;
    }
    this.callbacks.onTemporaryToolChange?.(this.state.currentTool);
    if (update) this.onUpdate();
    return true;
  }

  _setupEvents() {
    const el = this.canvas2d.canvas;

    el.addEventListener('mousedown', e => this._onMouseDown(e));
    el.addEventListener('mousemove', e => this._onMouseMove(e));
    el.addEventListener('mouseup', e => this._onMouseUp(e));
    el.addEventListener('wheel', e => this._onWheel(e), { passive: false });
    el.addEventListener('contextmenu', e => e.preventDefault());

    window.addEventListener('keydown', e => this._onKeyDown(e));
    window.addEventListener('keyup', e => this._onKeyUp(e));
  }

  _getScreenPos(e) {
    const rect = this.canvas2d.canvas.getBoundingClientRect();
    return { sx: e.clientX - rect.left, sy: e.clientY - rect.top };
  }

  _getWorldPos(e) {
    const { sx, sy } = this._getScreenPos(e);
    return this.canvas2d.screenToWorld(sx, sy);
  }

  _getSnappedPos(e) {
    const world = this._getWorldPos(e);
    if (e.shiftKey && this._memberStart) {
      return this._constrainAngle(this._memberStart, world);
    }
    return applySnap(world.x, world.y, this.state, this.canvas2d.camera);
  }

  // Pick tolerance in world units (mm), derived from a screen-px tolerance.
  _pickTolerance() {
    const basePx = this.state.settings.widePick ? WIDE_PICK_TOLERANCE_PX : PICK_TOLERANCE_PX;
    return basePx / this.canvas2d.camera.scale;
  }

  // Aborts the current draw interaction: alerts the user, drops all pending
  // draft points, and clears the canvas preview (same reset as Escape).
  _cancelDraft(messageKey) {
    alert(t(messageKey));
    this._memberStart = null;
    this._surfaceStart = null;
    this._surfacePolyline = [];
    this._loadStart = null;
    this.canvas2d.preview = null;
    this.onUpdate();
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
      if (diff < minDiff) {
        minDiff = diff;
        closest = a;
      }
    }
    return {
      x: origin.x + len * Math.cos(closest),
      y: origin.y + len * Math.sin(closest),
    };
  }

  // --- Mouse Events ---

  _onMouseDown(e) {
    const { sx, sy } = this._getScreenPos(e);

    // Pan: middle button, right button, or space+left
    if (e.button === 1 || e.button === 2 || (e.button === 0 && this._spaceDown)) {
      this._isPanning = true;
      this._panStart = { x: sx, y: sy };
      e.preventDefault();
      return;
    }

    if (e.button !== 0) return;

    const tool = this.state.currentTool;

    if (tool === 'splitPoint') {
      this._splitPointDown(e);
    } else if (tool === 'select') {
      this._selectDown(e);
    } else if (tool === 'member') {
      this._memberDown(e);
    } else if (tool === 'surface') {
      this._surfaceDown(e);
    } else if (tool === 'load') {
      this._loadDown(e);
    } else if (tool === 'support') {
      this._supportDown(e);
    } else if (tool === 'measure') {
      this._measureDown(e);
    }
  }

  _onMouseMove(e) {
    const { sx, sy } = this._getScreenPos(e);

    // Pan
    if (this._isPanning && this._panStart) {
      this.canvas2d.pan(sx - this._panStart.x, sy - this._panStart.y);
      this._panStart = { x: sx, y: sy };
      this.onUpdate();
      return;
    }

    const tool = this.state.currentTool;

    if (tool === 'splitPoint') {
      this._splitPointMove(e);
    } else if (tool === 'select') {
      this._selectMove(e);
    } else if (tool === 'member') {
      this._memberMove(e);
    } else if (tool === 'surface') {
      this._surfaceMove(e);
    } else if (tool === 'load') {
      this._loadMove(e);
    } else if (tool === 'measure') {
      this._measureMove(e);
    }

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
    this.canvas2d.zoom(e.deltaY, sx, sy);
    this.onUpdate();
  }

  _onKeyDown(e) {
    if (e.code === 'Space') {
      this._spaceDown = true;
      e.preventDefault();
    }

    // Esc: cancel or deselect
    if (e.key === 'Escape') {
      if (this.state.currentTool === 'splitPoint' || this._splitPointMemberId) {
        e.preventDefault();
        this.cancelSplitPoint();
        return;
      } else if ((this.state.currentTool === 'member' && this._memberStart) ||
          (this.state.currentTool === 'surface' && (this._surfaceStart || this._surfacePolyline.length)) ||
          (this.state.currentTool === 'load' && this._loadStart) ||
          (this.state.currentTool === 'measure' && (this._measureStart || this.canvas2d.measure))) {
        this._memberStart = null;
        this._surfaceStart = null;
        this._surfacePolyline = [];
        this._loadStart = null;
        this._measureStart = null;
        this.canvas2d.preview = null;
        this.canvas2d.measure = null;
        this.onUpdate();
      } else {
        this.state.clearSelection();
        this.onUpdate();
      }
    }

    // Delete (skip when focused on input/select)
    if ((e.key === 'Delete' || e.key === 'Backspace') &&
        e.target.tagName !== 'INPUT' && e.target.tagName !== 'SELECT' && e.target.tagName !== 'TEXTAREA') {
      if (this.state.selectedSupportId) {
        const support = this.state.getSupport(this.state.selectedSupportId);
        if (!this.state.isSupportSelectable(support)) return;
        this.history.save();
        this.state.removeSupport(this.state.selectedSupportId);
        this.onUpdate();
      } else if (this.state.selectedLoadId) {
        const load = this.state.getLoad(this.state.selectedLoadId);
        if (!this.state.isLoadSelectable(load)) return;
        this.history.save();
        this.state.removeLoad(this.state.selectedLoadId);
        this.onUpdate();
      } else if (this.state.selectedSurfaceId) {
        const surface = this.state.getSurface(this.state.selectedSurfaceId);
        if (!this.state.isSurfaceSelectable(surface)) return;
        this.history.save();
        this.state.removeSurface(this.state.selectedSurfaceId);
        this.onUpdate();
      } else if (this.state.selectedMemberIds.length > 0) {
        const removable = this.state.selectedMemberIds
          .map(id => this.state.getMember(id))
          .filter(member => member && this.state.isMemberSelectable(member));
        if (!removable.length) return;
        this.history.save();
        for (const member of removable) {
          this.state.removeMember(member.id);
        }
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

    // Close polyline surface
    if (this.state.currentTool === 'surface' && this.state.surfaceDraftMode === 'polyline' &&
        (e.key === 'Enter' || e.key === 'Return')) {
      this._finishSurfacePolyline();
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
    const tolerance = this._pickTolerance();

    // Shift+click toggles members in/out of the multi-selection.
    if (e.shiftKey) {
      const member = this._findSelectableMemberAt(world.x, world.y, tolerance);
      if (member) {
        this.state.toggleMemberSelection(member.id);
        this._dragTarget = null;
        this.onUpdate();
        return;
      }
      // Shift+drag on empty space: additive marquee.
      this._marqueeStart = { x: world.x, y: world.y };
      this._marqueeAdditive = true;
      return;
    }

    // Click-only hits, in priority order: support (small target) > load >
    // surface. The first hit wins and becomes the exclusive selection.
    const hitTests = [
      { kind: 'support', find: () => this._findSelectableSupportAt(world.x, world.y, tolerance) },
      { kind: 'load', find: () => this._findSelectableLoadAt(world.x, world.y) },
      { kind: 'surface', find: () => this._findSelectableSurfaceAt(world.x, world.y) },
    ];
    for (const { kind, find } of hitTests) {
      const hit = find();
      if (!hit) continue;
      this.state.select(kind, hit.id);
      this._dragTarget = null;
      this.onUpdate();
      return;
    }

    // Node hit: select the member and start dragging its endpoint
    const nodeHit = this._findSelectableMemberNodeAt(world.x, world.y, tolerance);
    if (nodeHit) {
      const { member, node } = nodeHit;
      this.state.select('member', member.id);
      this._dragTarget = { type: 'node', id: node.id };
      this._isDragging = false;
      this._dragStartPos = { x: world.x, y: world.y };
      this.onUpdate();
      return;
    }

    // Member hit: select and start dragging. Clicking a member of the current
    // multi-selection drags the whole group.
    const member = this._findSelectableMemberAt(world.x, world.y, tolerance);
    if (member) {
      if (this.state.selectedMemberIds.length > 1 && this.state.isMemberSelected(member.id)) {
        this._dragTarget = this._buildGroupDragTarget();
      } else {
        this.state.select('member', member.id);
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
      }
      this._isDragging = false;
      this._dragStartPos = { x: world.x, y: world.y };
      this.onUpdate();
      return;
    }

    // Empty space: begin a marquee selection (selection is replaced on
    // mouseup; a plain click still clears it there).
    this._marqueeStart = { x: world.x, y: world.y };
    this._marqueeAdditive = false;
    this._dragTarget = null;
  }

  // Snapshot of every node in the multi-selection for group dragging.
  _buildGroupDragTarget() {
    const nodeStart = new Map();
    for (const id of this.state.selectedMemberIds) {
      const member = this.state.getMember(id);
      if (!member) continue;
      for (const nodeId of [member.startNodeId, member.endNodeId]) {
        if (nodeStart.has(nodeId)) continue;
        const node = this.state.getNode(nodeId);
        if (node) nodeStart.set(nodeId, { x: node.x, y: node.y });
      }
    }
    return { type: 'group', nodeStart };
  }

  _findSelectableMemberNodeAt(x, y, tolerance) {
    let best = null;
    let bestDist = tolerance;
    for (const member of this.state.members) {
      if (!this.state.isMemberSelectable(member)) continue;
      for (const nodeId of [member.startNodeId, member.endNodeId]) {
        const node = this.state.getNode(nodeId);
        if (!node) continue;
        const dist = Math.hypot(node.x - x, node.y - y);
        if (dist < bestDist) {
          bestDist = dist;
          best = { member, node };
        }
      }
    }
    return best;
  }

  _findSelectableSupportAt(x, y, tolerance) {
    if (this.state.settings.showSupports === false) return null;
    return this.state.findSupportAt(x, y, tolerance, support => this.state.isSupportSelectable(support));
  }

  _findSelectableLoadAt(x, y) {
    return this.state.findLoadAt(x, y, load => this.state.isLoadSelectable(load));
  }

  _findSelectableSurfaceAt(x, y) {
    return this.state.findSurfaceAt(x, y, surface => this.state.isSurfaceSelectable(surface));
  }

  _findSelectableMemberAt(x, y, tolerance) {
    return this.state.findMemberAt(x, y, tolerance, member => this.state.isMemberSelectable(member));
  }

  _selectMove(e) {
    if (this._marqueeStart) {
      const world = this._getWorldPos(e);
      this.canvas2d.marquee = {
        x1: this._marqueeStart.x,
        y1: this._marqueeStart.y,
        x2: world.x,
        y2: world.y,
      };
      this.onUpdate();
      return;
    }

    if (!this._dragTarget || !this._dragStartPos) return;

    const world = this._getWorldPos(e);
    const dx = world.x - this._dragStartPos.x;
    const dy = world.y - this._dragStartPos.y;

    if (!this._isDragging && Math.hypot(dx, dy) * this.canvas2d.camera.scale > 3) {
      this._isDragging = true;
      this.history.save();
    }

    if (!this._isDragging) return;

    const snapped = applySnap(world.x, world.y, this.state, this.canvas2d.camera);

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
    } else if (this._dragTarget.type === 'group') {
      // Snap the drag delta to grid steps so the whole group keeps its shape.
      let gdx = dx;
      let gdy = dy;
      if (this.state.settings.snap) {
        const gridSize = this.state.settings.gridSize || 1;
        gdx = Math.round(dx / gridSize) * gridSize;
        gdy = Math.round(dy / gridSize) * gridSize;
      }
      for (const [nodeId, start] of this._dragTarget.nodeStart) {
        this.state.updateNode(nodeId, { x: start.x + gdx, y: start.y + gdy });
      }
    }

    this.onUpdate();
  }

  _selectUp(e) {
    if (this._marqueeStart) {
      this._finishMarquee(e);
      return;
    }
    this._dragTarget = null;
    this._isDragging = false;
    this._dragStartPos = null;
  }

  _finishMarquee(e) {
    const world = this._getWorldPos(e);
    const start = this._marqueeStart;
    this._marqueeStart = null;
    this.canvas2d.marquee = null;

    const movedPx = Math.hypot(world.x - start.x, world.y - start.y) * this.canvas2d.camera.scale;
    if (movedPx <= 3) {
      // Plain click on empty space
      if (!this._marqueeAdditive) this.state.clearSelection();
      this.onUpdate();
      return;
    }

    const minX = Math.min(start.x, world.x);
    const maxX = Math.max(start.x, world.x);
    const minY = Math.min(start.y, world.y);
    const maxY = Math.max(start.y, world.y);
    const inside = (x, y) => x >= minX && x <= maxX && y >= minY && y <= maxY;

    const hitIds = [];
    for (const member of this.state.members) {
      if (!this.state.isMemberSelectable(member)) continue;
      const n1 = this.state.getNode(member.startNodeId);
      const n2 = this.state.getNode(member.endNodeId);
      if (!n1 || !n2) continue;
      if (inside(n1.x, n1.y) && inside(n2.x, n2.y)) hitIds.push(member.id);
    }

    const ids = this._marqueeAdditive
      ? [...new Set([...this.state.selectedMemberIds, ...hitIds])]
      : hitIds;
    this.state.selectMembers(ids);
    this.onUpdate();
  }

  // --- Split Point Tool ---

  _splitPointMember() {
    const member = this.state.getMember(this._splitPointMemberId);
    if (!member || !this.state.isMemberSelected(member.id) || !projectSplitPointTarget(member)) {
      this.cancelSplitPoint();
      return null;
    }
    return member;
  }

  _splitPointProjection(e) {
    const member = this._splitPointMember();
    if (!member) return null;
    return projectSplitPoint(this.state, member, this._getSnappedPos(e));
  }

  _splitPointMove(e) {
    const point = this._splitPointProjection(e);
    this.canvas2d.preview = point
      ? { mode: 'point', x: point.x, y: point.y, label: t('splitAtPointHint') }
      : null;
    this.onUpdate();
  }

  _splitPointDown(e) {
    const memberId = this._splitPointMemberId;
    const point = this._splitPointProjection(e);
    if (!point) {
      this.callbacks.onSplitPointFailed?.();
      return;
    }

    let result = null;
    const changed = this.history.transact(() => {
      result = this.state.splitMemberAtPoint(memberId, point);
      return Boolean(result);
    });
    if (!changed || !result) {
      this.callbacks.onSplitPointFailed?.();
      return;
    }

    this.state.selectMembers(result.createdMemberIds);
    this.cancelSplitPoint({ update: false });
    this.onUpdate();
    this.callbacks.onSplitPointComplete?.(result);
  }

  // --- Member Tool ---

  _memberDown(e) {
    const snapped = this._getSnappedPos(e);

    if (this.state.memberDraftType === 'column') {
      this._placeColumn(snapped);
      return;
    }

    if (!this._memberStart) {
      this._memberStart = { x: snapped.x, y: snapped.y };
      return;
    }

    const start = this._memberStart;
    const end = snapped;

    if (Math.hypot(end.x - start.x, end.y - start.y) < 1) return;

    // 水平ブレースは斜め配置のみ（X軸・Y軸に平行な配置は不可）
    if (this.state.memberDraftType === 'hbrace') {
      const dx = Math.abs(end.x - start.x);
      const dy = Math.abs(end.y - start.y);
      if (dx < 1 || dy < 1) {
        alert(t('hbraceNeedsDiagonal'));
        return;
      }
    }

    // 垂直ブレースは上レイヤーが必要
    let topLevelId = null;
    if (this.state.memberDraftType === 'vbrace') {
      topLevelId = this._getAutoTopLevelId();
      if (!topLevelId) {
        this._cancelDraft('noLevelAbove');
        return;
      }
    }

    this.history.save();

    let startNode = this.state.findNodeAt(start.x, start.y, 1);
    if (!startNode) startNode = this.state.addNode(start.x, start.y);

    let endNode = this.state.findNodeAt(end.x, end.y, 1);
    if (!endNode) endNode = this.state.addNode(end.x, end.y);

    const memberType = this.state.memberDraftType || 'beam';
    const member = this.state.addMember(startNode.id, endNode.id, {
      type: memberType,
      levelId: this.state.activeLevelId || 'L0',
      topLevelId,
      sectionName: this.state.getDraftSectionName('member', memberType),
    });

    this.state.selectDrawn('member', member.id);
    this._memberStart = null;
    this.canvas2d.preview = null;
    this.onUpdate();
  }

  _placeColumn(snapped) {
    const sortedLevels = [...this.state.levels].sort((a, b) => a.z - b.z);
    const activeIdx = sortedLevels.findIndex(l => l.id === this.state.activeLevelId);
    if (activeIdx < 0 || activeIdx >= sortedLevels.length - 1) {
      alert(t('noLevelAbove'));
      return;
    }
    const topLevel = sortedLevels[activeIdx + 1];

    this.history.save();
    let node = this.state.findNodeAt(snapped.x, snapped.y, 1);
    if (!node) node = this.state.addNode(snapped.x, snapped.y);

    const member = this.state.addMember(node.id, node.id, {
      type: 'column',
      levelId: this.state.activeLevelId,
      topLevelId: topLevel.id,
      sectionName: this.state.getDraftSectionName('member', 'column'),
    });
    this.state.selectDrawn('member', member.id);
    this.onUpdate();
  }

  _memberMove(e) {
    if (!this._memberStart) return;
    if (this.state.memberDraftType === 'column') return;

    const snapped = this._getSnappedPos(e);
    this.canvas2d.preview = {
      startX: this._memberStart.x,
      startY: this._memberStart.y,
      endX: snapped.x,
      endY: snapped.y,
      mode: 'line',
      label: this._memberPreviewLabel(this._memberStart, snapped),
    };
    this.onUpdate();
  }

  _memberPreviewLabel(start, end) {
    const type = this.state.memberDraftType || 'beam';
    const sectionName = this.state.getDraftSectionName('member', type) || '-';
    const length = Math.round(Math.hypot(end.x - start.x, end.y - start.y));
    const level = this.state.levels.find(l => l.id === this.state.activeLevelId);
    const levelLabel = level ? level.name : (this.state.activeLevelId || '-');
    if (type === 'vbrace') {
      const top = this.state.levels.find(l => l.id === this._getAutoTopLevelId());
      return `${t(type)} ${levelLabel}->${top?.name || '-'} ${sectionName} ${length}mm`;
    }
    return `${t(type)} ${levelLabel} ${sectionName} ${length}mm`;
  }

  // --- Surface Tool ---

  _getEffectiveSurfaceMode() {
    const type = this.state.surfaceDraftType;
    if (type === 'exteriorWall') return 'polyline';
    if (type === 'wall' || type === 'gableWall') return 'line';
    return this.state.surfaceDraftMode;
  }

  _getAutoTopLevelId() {
    return this.state.getNextLevelId(this.state.activeLevelId);
  }

  // Resolves the top level for a new surface of the given type. Returns null
  // for wall types when there is no level above the active one.
  _resolveSurfaceTopLevelId(type) {
    if (isWallSurfaceType(type)) return this._getAutoTopLevelId();
    if (isSlopedSurfaceType(type)) return this.state.activeLevelId || 'L0';
    return this.state.surfaceDraftTopLevelId || this.state.activeLevelId || 'L0';
  }

  _getWallHeightOptions(topLevelId) {
    const type = this.state.surfaceDraftType;
    if (!isWallSurfaceType(type)) return {};
    return this.state.getSurfaceHeightOffsets({
      heightMode: this.state.surfaceDraftHeightMode,
      levelId: this.state.activeLevelId || 'L0',
      topLevelId,
      bottomOffset: this.state.surfaceDraftBottomOffset,
      topOffset: this.state.surfaceDraftTopOffset,
    });
  }

  _getRoofOptions() {
    if (!isSlopedSurfaceType(this.state.surfaceDraftType)) return {};
    const options = {
      roofSlope: this.state.surfaceDraftRoofSlope,
      roofDirection: this.state.surfaceDraftRoofDirection,
      roofBaseOffset: this.state.surfaceDraftRoofBaseOffset,
      includeWind: true,
    };
    if (this.state.surfaceDraftType === 'roof') {
      options.roofGroupId = this.state.surfaceDraftRoofGroupId || 'RG1';
    }
    return options;
  }

  _surfaceDown(e) {
    const snapped = this._getSnappedPos(e);
    const mode = this._getEffectiveSurfaceMode();
    const type = this.state.surfaceDraftType;

    if (mode === 'polyline') {
      this._surfaceStart = null;
      this._surfacePolylineDown(snapped);
      return;
    }

    this._surfacePolyline = [];

    if (!this._surfaceStart) {
      this._surfaceStart = { x: snapped.x, y: snapped.y };
      return;
    }

    const start = this._surfaceStart;
    const end = snapped;

    // Wall line: check distance; Rect: check width/height
    if (mode === 'line') {
      if (Math.hypot(end.x - start.x, end.y - start.y) < 1) return;
    } else {
      if (Math.abs(end.x - start.x) < 1 || Math.abs(end.y - start.y) < 1) return;
    }

    const topLevelId = this._resolveSurfaceTopLevelId(type);
    if (!topLevelId) {
      this._cancelDraft('noLevelAbove');
      return;
    }

    this.history.save();

    let surface;
    const heightOptions = this._getWallHeightOptions(topLevelId);
    const roofOptions = this._getRoofOptions();
    if (mode === 'line') {
      surface = this.state.addSurfaceLine(start.x, start.y, end.x, end.y, {
        type: type || 'wall',
        levelId: this.state.activeLevelId || 'L0',
        topLevelId,
        sectionName: this.state.getDraftSectionName('surface', type || 'wall'),
        ...heightOptions,
        ...roofOptions,
      });
    } else {
      surface = this.state.addSurfaceRect(start.x, start.y, end.x, end.y, {
        type: type || 'floor',
        levelId: this.state.activeLevelId || 'L0',
        topLevelId,
        loadDirection: this.state.surfaceDraftLoadDir || 'twoWay',
        sectionName: this.state.getDraftSectionName('surface', type || 'floor'),
        ...heightOptions,
        ...roofOptions,
      });
    }
    this.state.selectDrawn('surface', surface.id);

    this._surfaceStart = null;
    this.canvas2d.preview = null;
    this.onUpdate();
  }

  _surfaceMove(e) {
    const mode = this._getEffectiveSurfaceMode();

    if (mode === 'polyline') {
      this._surfacePolylineMove(e);
      return;
    }

    if (!this._surfaceStart) return;

    const snapped = this._getSnappedPos(e);
    this.canvas2d.preview = {
      startX: this._surfaceStart.x,
      startY: this._surfaceStart.y,
      endX: snapped.x,
      endY: snapped.y,
      mode: mode === 'line' ? 'line' : 'rect',
      label: `${t(this.state.surfaceDraftType || 'surface')} ${t(mode === 'line' ? 'lineLoad' : 'rectMode')}`,
    };
    this.onUpdate();
  }

  _surfacePolylineDown(snapped) {
    if (this._surfacePolyline.length === 0) {
      // exteriorWall: 入力開始時に既存チェック
      if (this.state.surfaceDraftType === 'exteriorWall') {
        const levelId = this.state.activeLevelId || 'L0';
        const existing = this.state.surfaces.find(
          s => s.type === 'exteriorWall' && s.levelId === levelId
        );
        if (existing) {
          if (!confirm(t('exteriorWallConfirmReplace'))) return;
          this.history.save();
          this.state.removeSurface(existing.id);
        }
      }
      this._surfacePolyline.push({ x: snapped.x, y: snapped.y });
      this.state.clearSelection();
      this.onUpdate();
      return;
    }

    const first = this._surfacePolyline[0];
    const closeTol = POLYLINE_CLOSE_TOLERANCE_PX / this.canvas2d.camera.scale;
    if (this._surfacePolyline.length >= 3 &&
        Math.hypot(snapped.x - first.x, snapped.y - first.y) <= closeTol) {
      this._finishSurfacePolyline();
      return;
    }

    const last = this._surfacePolyline[this._surfacePolyline.length - 1];
    if (Math.hypot(snapped.x - last.x, snapped.y - last.y) < 1) return;
    this._surfacePolyline.push({ x: snapped.x, y: snapped.y });
    this.onUpdate();
  }

  _surfacePolylineMove(e) {
    if (this._surfacePolyline.length === 0) return;
    const snapped = this._getSnappedPos(e);
    const points = [...this._surfacePolyline, { x: snapped.x, y: snapped.y }];
    this.canvas2d.preview = {
      mode: 'polyline',
      points,
      closeHint: this._surfacePolyline.length >= 3,
      label: `${t(this.state.surfaceDraftType || 'surface')} ${points.length}pt`,
    };
    this.onUpdate();
  }

  _finishSurfacePolyline() {
    if (this._surfacePolyline.length < 3) return;
    const type = this.state.surfaceDraftType;
    const isWallType = isWallSurfaceType(type);

    const topLevelId = this._resolveSurfaceTopLevelId(type);
    if (!topLevelId) {
      this._cancelDraft('noLevelAbove');
      return;
    }

    this.history.save();

    const surface = this.state.addSurfacePolygon(this._surfacePolyline, {
      type: type || 'wall',
      levelId: this.state.activeLevelId || 'L0',
      topLevelId,
      loadDirection: isWallType ? 'twoWay' : (this.state.surfaceDraftLoadDir || 'twoWay'),
      sectionName: this.state.getDraftSectionName('surface', type || 'wall'),
      ...this._getWallHeightOptions(topLevelId),
      ...this._getRoofOptions(),
    });
    if (surface) {
      this.state.selectDrawn('surface', surface.id);
    }
    this._surfacePolyline = [];
    this._surfaceStart = null;
    this.canvas2d.preview = null;
    this.onUpdate();
  }

  // --- Load Tool ---

  _loadDown(e) {
    const snapped = this._getSnappedPos(e);
    const type = this.state.loadDraftType;

    if (type === 'pointLoad') {
      this.history.save();
      const load = this.state.addLoad('pointLoad', {
        x1: snapped.x, y1: snapped.y,
        levelId: this.state.activeLevelId || 'L0',
      });
      this.state.selectDrawn('load', load.id);
      this.canvas2d.preview = null;
      this.onUpdate();
      return;
    }

    // areaLoad / lineLoad: two-click
    if (!this._loadStart) {
      this._loadStart = { x: snapped.x, y: snapped.y };
      return;
    }

    const start = this._loadStart;
    const end = snapped;

    if (type === 'areaLoad') {
      if (Math.abs(end.x - start.x) < 1 || Math.abs(end.y - start.y) < 1) return;
    } else {
      if (Math.hypot(end.x - start.x, end.y - start.y) < 1) return;
    }

    this.history.save();
    const load = this.state.addLoad(type, {
      x1: start.x, y1: start.y, x2: end.x, y2: end.y,
      levelId: this.state.activeLevelId || 'L0',
    });
    this.state.selectDrawn('load', load.id);
    this._loadStart = null;
    this.canvas2d.preview = null;
    this.onUpdate();
  }

  _loadMove(e) {
    if (!this._loadStart) return;
    if (this.state.loadDraftType === 'pointLoad') return;

    const snapped = this._getSnappedPos(e);
    this.canvas2d.preview = {
      startX: this._loadStart.x,
      startY: this._loadStart.y,
      endX: snapped.x,
      endY: snapped.y,
      mode: this.state.loadDraftType === 'areaLoad' ? 'rect' : 'line',
      label: t(this.state.loadDraftType || 'load'),
    };
    this.onUpdate();
  }

  // --- Measure Tool ---

  _measureDown(e) {
    const snapped = this._getSnappedPos(e);
    if (!this._measureStart) {
      this._measureStart = { x: snapped.x, y: snapped.y };
      this.canvas2d.measure = null;
      this.onUpdate();
      return;
    }
    this.canvas2d.measure = {
      x1: this._measureStart.x,
      y1: this._measureStart.y,
      x2: snapped.x,
      y2: snapped.y,
      done: true,
    };
    this._measureStart = null;
    this.onUpdate();
  }

  _measureMove(e) {
    if (!this._measureStart) return;
    const snapped = this._getSnappedPos(e);
    this.canvas2d.measure = {
      x1: this._measureStart.x,
      y1: this._measureStart.y,
      x2: snapped.x,
      y2: snapped.y,
      done: false,
    };
    this.onUpdate();
  }

  // --- Support Tool ---

  _supportDown(e) {
    const snapped = this._getSnappedPos(e);
    const tolerance = this._pickTolerance();

    // Check if clicking on an existing support
    const existing = this._findSelectableSupportAt(snapped.x, snapped.y, tolerance);
    if (existing) {
      this.state.select('support', existing.id);
      this.onUpdate();
      return;
    }

    // Place a new support
    this.history.save();
    const support = this.state.addSupport(snapped.x, snapped.y, {
      levelId: this.state.activeLevelId || 'L0',
    });
    this.state.select('support', support.id);
    this.onUpdate();
  }

  // --- Status ---

  _updateCoords(x, y) {
    const el = document.getElementById('status-coords');
    if (el) el.textContent = `X: ${Math.round(x)}  Y: ${Math.round(y)}`;
  }
}
