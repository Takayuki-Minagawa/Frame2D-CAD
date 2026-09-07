// Shared geometries/materials (node spheres, ArrowHelper internals) disposed once.
export function disposeObjects(roots, { materials = true } = {}) {
  const geometries = new Set();
  const mats = new Set();
  const textures = new Set();
  for (const root of roots) root?.traverse(object => {
    if (object.geometry) geometries.add(object.geometry);
    if (materials && object.material) {
      for (const mat of Array.isArray(object.material) ? object.material : [object.material]) mats.add(mat);
    }
  });
  for (const geometry of geometries) geometry.dispose();
  for (const mat of mats) {
    for (const value of Object.values(mat)) if (value?.isTexture) textures.add(value);
    mat.dispose();
  }
  for (const texture of textures) texture.dispose();
}
