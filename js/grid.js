// grid.js - Grid drawing and snap calculation

// Read CSS custom property value
function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

export function drawGrid(ctx, camera, gridSize, canvasW, canvasH) {
  const { offsetX, offsetY, scale } = camera;

  // Calculate visible world bounds
  const worldLeft = -offsetX / scale;
  const worldTop = -offsetY / scale;
  const worldRight = (canvasW - offsetX) / scale;
  const worldBottom = (canvasH - offsetY) / scale;

  // Grid line range
  const startX = Math.floor(worldLeft / gridSize) * gridSize;
  const endX = Math.ceil(worldRight / gridSize) * gridSize;
  const startY = Math.floor(worldTop / gridSize) * gridSize;
  const endY = Math.ceil(worldBottom / gridSize) * gridSize;

  ctx.save();
  ctx.strokeStyle = cssVar('--grid-line');
  ctx.lineWidth = 1;

  // Vertical lines
  for (let x = startX; x <= endX; x += gridSize) {
    const sx = x * scale + offsetX;
    ctx.beginPath();
    ctx.moveTo(sx, 0);
    ctx.lineTo(sx, canvasH);
    ctx.stroke();
  }

  // Horizontal lines
  for (let y = startY; y <= endY; y += gridSize) {
    const sy = y * scale + offsetY;
    ctx.beginPath();
    ctx.moveTo(0, sy);
    ctx.lineTo(canvasW, sy);
    ctx.stroke();
  }

  // Draw axes
  ctx.strokeStyle = cssVar('--grid-axis-x');
  ctx.lineWidth = 1.5;
  const axisYScreen = offsetY;
  ctx.beginPath();
  ctx.moveTo(0, axisYScreen);
  ctx.lineTo(canvasW, axisYScreen);
  ctx.stroke();

  ctx.strokeStyle = cssVar('--grid-axis-y');
  const axisXScreen = offsetX;
  ctx.beginPath();
  ctx.moveTo(axisXScreen, 0);
  ctx.lineTo(axisXScreen, canvasH);
  ctx.stroke();

  // Draw origin marker (circle at origin)
  const originX = offsetX;
  const originY = offsetY;
  if (originX >= -20 && originX <= canvasW + 20 && originY >= -20 && originY <= canvasH + 20) {
    ctx.fillStyle = cssVar('--grid-axis-x');
    ctx.beginPath();
    ctx.arc(originX, originY, 4, 0, Math.PI * 2);
    ctx.fill();
  }

  // Draw origin reference and axis labels in bottom-left corner
  const margin = 20;
  const originRefSize = 60;
  const originRefX = margin + originRefSize / 2;
  const originRefY = canvasH - margin - originRefSize / 2;

  // Origin point
  ctx.fillStyle = cssVar('--grid-axis-x');
  ctx.beginPath();
  ctx.arc(originRefX, originRefY, 4, 0, Math.PI * 2);
  ctx.fill();

  // X axis arrow (to the right)
  ctx.strokeStyle = cssVar('--grid-axis-x');
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(originRefX, originRefY);
  ctx.lineTo(originRefX + 40, originRefY);
  ctx.stroke();
  // Arrowhead
  ctx.beginPath();
  ctx.moveTo(originRefX + 40, originRefY);
  ctx.lineTo(originRefX + 35, originRefY - 4);
  ctx.lineTo(originRefX + 35, originRefY + 4);
  ctx.closePath();
  ctx.fillStyle = cssVar('--grid-axis-x');
  ctx.fill();

  // Y axis arrow (upward)
  ctx.strokeStyle = cssVar('--grid-axis-y');
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(originRefX, originRefY);
  ctx.lineTo(originRefX, originRefY - 40);
  ctx.stroke();
  // Arrowhead
  ctx.beginPath();
  ctx.moveTo(originRefX, originRefY - 40);
  ctx.lineTo(originRefX - 4, originRefY - 35);
  ctx.lineTo(originRefX + 4, originRefY - 35);
  ctx.closePath();
  ctx.fillStyle = cssVar('--grid-axis-y');
  ctx.fill();

  // Labels (offset to avoid overlap with members)
  ctx.font = 'bold 14px sans-serif';
  ctx.fillStyle = cssVar('--grid-axis-x');
  ctx.fillText('X', originRefX + 50, originRefY + 5);

  ctx.fillStyle = cssVar('--grid-axis-y');
  ctx.fillText('Y', originRefX - 5, originRefY - 50);

  ctx.restore();
}

export function snapToGrid(x, y, gridSize) {
  return {
    x: Math.round(x / gridSize) * gridSize,
    y: Math.round(y / gridSize) * gridSize,
  };
}

export function snapToNode(x, y, state, tolerance) {
  const node = state.findNodeAt(x, y, tolerance);
  if (node) return { x: node.x, y: node.y, nodeId: node.id };
  return null;
}

export function applySnap(worldX, worldY, state, camera) {
  if (!state.settings.snap) return { x: worldX, y: worldY };

  const tolerance = 10 / camera.scale; // ~10 screen pixels in world mm

  // Priority: existing node > grid
  const nodeSnap = snapToNode(worldX, worldY, state, tolerance);
  if (nodeSnap) return nodeSnap;

  return snapToGrid(worldX, worldY, state.settings.gridSize);
}
