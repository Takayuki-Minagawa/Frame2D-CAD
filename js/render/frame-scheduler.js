// One pending frame per view; no timer or idle polling. A render may request
// another frame (OrbitControls damping), without creating a second RAF chain.
export class FrameScheduler {
  constructor(render, {
    request = callback => requestAnimationFrame(callback),
    cancel = handle => cancelAnimationFrame(handle),
    active = true,
  } = {}) {
    this.render = render;
    this.request = request;
    this.cancel = cancel;
    this.active = active;
    this.pending = null;
    this.dirty = false;
    this.disposed = false;
  }

  invalidate() {
    if (this.disposed) return;
    this.dirty = true;
    if (!this.active || this.pending !== null) return;
    this.pending = this.request(() => {
      this.pending = null;
      if (this.disposed || !this.active) return;
      this.dirty = false;
      this.render();
    });
  }

  setActive(active) {
    if (this.disposed) return;
    this.active = active;
    if (!active && this.pending !== null) {
      this.cancel(this.pending);
      this.pending = null;
    }
    if (active && this.dirty) this.invalidate();
  }

  dispose() {
    this.setActive(false);
    this.disposed = true;
    this.render = null;
  }
}
