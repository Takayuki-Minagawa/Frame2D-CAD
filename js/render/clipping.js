// Keep the CAD half-space coordinate <= position (or >= when flipped).
// CAD (x,y,z) mm -> scene (x,z,-y) meters. Three clips negative plane distance.
export function clippingEquation(axis, positionMm, flipped = false) {
  const normals = { X: [-1, 0, 0], Y: [0, 0, 1], Z: [0, -1, 0] };
  const normal = normals[String(axis).toUpperCase()];
  if (!normal || !Number.isFinite(positionMm)) throw new TypeError('Invalid clipping axis or position');
  const sign = flipped ? -1 : 1;
  return { normal: normal.map(n => n * sign), constant: positionMm * 0.001 * sign };
}

export function isVisibleHit(hit, plane = null) {
  for (let object = hit.object; object; object = object.parent) {
    if (!object.visible) return false;
  }
  return !plane || plane.distanceToPoint(hit.point) >= -1e-8;
}
