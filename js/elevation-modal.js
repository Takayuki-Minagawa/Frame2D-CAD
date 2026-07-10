// elevation-modal.js - Frame elevation (軸組図) viewer: pick a grid axis and
// render the members on that frame plane (columns, beams, braces) against the
// level lines.

import { HIT_TOLERANCE_MM } from './constants.js';
import { cssVar } from './dom-utils.js';
import { resolveMemberColor } from './element-style.js';
import { t } from './i18n.js';

const PLANE_TOLERANCE_MM = HIT_TOLERANCE_MM;
const MARGIN_PX = 48;

export function initElevationModal({ state }) {
  const modal = document.getElementById('elevation-modal');
  const axisSelect = document.getElementById('elevation-axis');
  const canvas = document.getElementById('elevation-canvas');
  const emptyNote = document.getElementById('elevation-empty');

  function refreshAxisOptions() {
    const sorted = [...state.axes].sort((a, b) =>
      a.dir === b.dir ? a.coord - b.coord : (a.dir === 'x' ? -1 : 1)
    );
    // Axis names come from user input / loaded files: build the options via
    // the DOM (textContent) instead of innerHTML.
    axisSelect.textContent = '';
    if (sorted.length) {
      for (const a of sorted) {
        axisSelect.add(new Option(`${a.name} (${a.dir === 'x' ? 'X' : 'Y'}=${a.coord})`, a.id));
      }
    } else {
      axisSelect.add(new Option(t('elevationNoAxes'), ''));
    }
  }

  // Members projected onto the frame plane of `axis` as segments
  // { h1, z1, h2, z2, member } (h = in-plane horizontal coordinate, mm).
  function collectSegments(axis) {
    const onPlane = node => axis.dir === 'x'
      ? Math.abs(node.x - axis.coord) <= PLANE_TOLERANCE_MM
      : Math.abs(node.y - axis.coord) <= PLANE_TOLERANCE_MM;
    const coordOf = node => (axis.dir === 'x' ? node.y : node.x);

    const segments = [];
    for (const member of state.members) {
      const n1 = state.getNode(member.startNodeId);
      const n2 = state.getNode(member.endNodeId);
      if (!n1 || !n2 || !onPlane(n1) || !onPlane(n2)) continue;

      if (member.type === 'column') {
        segments.push({
          h1: coordOf(n1),
          z1: state.getLevelZ(member.levelId),
          h2: coordOf(n1),
          z2: state.getLevelZ(member.topLevelId || member.levelId),
          member,
        });
        continue;
      }

      if (member.type === 'vbrace') {
        const zBottom = state.getLevelZ(member.levelId);
        const zTop = state.getLevelZ(member.topLevelId || member.levelId);
        const hStart = coordOf(n1);
        const hEnd = coordOf(n2);
        segments.push({ h1: hStart, z1: zBottom, h2: hEnd, z2: zTop, member });
        if (member.bracePattern === 'cross') {
          segments.push({ h1: hEnd, z1: zBottom, h2: hStart, z2: zTop, member });
        }
        continue;
      }

      const zOf = which => {
        if (member.geometryMode === 'explicit3d') {
          const value = Number(which === 'start' ? member.startZ : member.endZ);
          if (Number.isFinite(value)) return value;
        }
        return state.getLevelZ(member.levelId);
      };
      segments.push({
        h1: coordOf(n1),
        z1: zOf('start'),
        h2: coordOf(n2),
        z2: zOf('end'),
        member,
      });
    }
    return segments;
  }

  function render() {
    const axis = state.getAxis(axisSelect.value);
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const cssW = canvas.clientWidth || 720;
    const cssH = canvas.clientHeight || 420;
    canvas.width = cssW * dpr;
    canvas.height = cssH * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    ctx.fillStyle = cssVar('--canvas-bg') || '#14161f';
    ctx.fillRect(0, 0, cssW, cssH);

    if (!axis) {
      emptyNote.hidden = false;
      emptyNote.textContent = t('elevationNoAxes');
      return;
    }
    const segments = collectSegments(axis);
    if (!segments.length) {
      emptyNote.hidden = false;
      emptyNote.textContent = t('elevationNoMembers');
      return;
    }
    emptyNote.hidden = true;

    // Extents (mm): horizontal from segments, vertical from levels + segments.
    let minH = Infinity, maxH = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const s of segments) {
      minH = Math.min(minH, s.h1, s.h2);
      maxH = Math.max(maxH, s.h1, s.h2);
      minZ = Math.min(minZ, s.z1, s.z2);
      maxZ = Math.max(maxZ, s.z1, s.z2);
    }
    for (const level of state.levels) {
      minZ = Math.min(minZ, level.z);
      maxZ = Math.max(maxZ, level.z);
    }
    const spanH = Math.max(maxH - minH, 1000);
    const spanZ = Math.max(maxZ - minZ, 1000);
    const scale = Math.min(
      (cssW - MARGIN_PX * 2) / spanH,
      (cssH - MARGIN_PX * 2) / spanZ
    );
    const toScreen = (h, z) => ({
      x: MARGIN_PX + (h - minH) * scale + ((cssW - MARGIN_PX * 2) - spanH * scale) / 2,
      y: cssH - MARGIN_PX - (z - minZ) * scale - ((cssH - MARGIN_PX * 2) - spanZ * scale) / 2,
    });

    // Level lines + labels
    ctx.save();
    ctx.strokeStyle = cssVar('--grid-line') || '#333850';
    ctx.fillStyle = cssVar('--text-dim') || '#9aa0b5';
    ctx.font = '11px system-ui, sans-serif';
    ctx.lineWidth = 1;
    ctx.setLineDash([6, 4]);
    for (const level of [...state.levels].sort((a, b) => a.z - b.z)) {
      const p = toScreen(minH, level.z);
      const q = toScreen(maxH, level.z);
      ctx.beginPath();
      ctx.moveTo(p.x - 16, p.y);
      ctx.lineTo(q.x + 16, q.y);
      ctx.stroke();
      ctx.fillText(`${level.name} (z=${level.z})`, 6, p.y - 4);
    }
    ctx.restore();

    // Perpendicular axes crossing this frame
    ctx.save();
    ctx.strokeStyle = cssVar('--axis-color') || '#c084fc';
    ctx.fillStyle = cssVar('--axis-color') || '#c084fc';
    ctx.font = '11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.lineWidth = 1;
    ctx.setLineDash([14, 4, 3, 4]);
    const crossDir = axis.dir === 'x' ? 'y' : 'x';
    for (const cross of state.axes.filter(a => a.dir === crossDir)) {
      if (cross.coord < minH - 1 || cross.coord > maxH + 1) continue;
      const top = toScreen(cross.coord, maxZ);
      const bottom = toScreen(cross.coord, minZ);
      ctx.beginPath();
      ctx.moveTo(top.x, top.y - 14);
      ctx.lineTo(bottom.x, bottom.y + 8);
      ctx.stroke();
      ctx.fillText(cross.name, top.x, top.y - 22);
    }
    ctx.restore();

    // Members
    for (const s of segments) {
      const p1 = toScreen(s.h1, s.z1);
      const p2 = toScreen(s.h2, s.z2);
      ctx.save();
      ctx.strokeStyle = resolveMemberColor(s.member);
      ctx.lineWidth = s.member.type === 'column' ? 3 : 2;
      if (s.member.type === 'vbrace' || s.member.type === 'hbrace') ctx.setLineDash([7, 4]);
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();
      ctx.restore();
    }
  }

  function show() {
    refreshAxisOptions();
    modal.querySelectorAll('[data-i18n]').forEach(el => {
      el.textContent = t(el.dataset.i18n);
    });
    modal.classList.add('visible');
    // Render after layout so canvas client size is valid.
    requestAnimationFrame(render);
  }

  function hide() {
    modal.classList.remove('visible');
  }

  document.getElementById('btn-elevation-open').addEventListener('click', show);
  document.getElementById('btn-elevation-close').addEventListener('click', hide);
  axisSelect.addEventListener('change', render);
  modal.addEventListener('click', (e) => {
    if (e.target === modal) hide();
  });

  return {
    show,
    hide,
    isOpen: () => modal.classList.contains('visible'),
  };
}
