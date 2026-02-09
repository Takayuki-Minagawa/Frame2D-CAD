// grid.js - Grid drawing and snap calculation

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
  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
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
  ctx.strokeStyle = 'rgba(255,80,80,0.4)';
  ctx.lineWidth = 1.5;
  const axisYScreen = offsetY;
  ctx.beginPath();
  ctx.moveTo(0, axisYScreen);
  ctx.lineTo(canvasW, axisYScreen);
  ctx.stroke();

  ctx.strokeStyle = 'rgba(80,255,80,0.4)';
  const axisXScreen = offsetX;
  ctx.beginPath();
  ctx.moveTo(axisXScreen, 0);
  ctx.lineTo(axisXScreen, canvasH);
  ctx.stroke();

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

  const tolerance = 0.5 / camera.scale * 40; // adaptive tolerance

  // Priority: existing node > grid
  const nodeSnap = snapToNode(worldX, worldY, state, tolerance);
  if (nodeSnap) return nodeSnap;

  return snapToGrid(worldX, worldY, state.settings.gridSize);
}
