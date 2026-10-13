/**
 * Draws only when something changed. A turn-based game sits idle most of the
 * time, so a permanent 60fps loop would just burn battery. Animations ask for
 * frames while they run; when none do, requestAnimationFrame stops entirely.
 */
export class FrameScheduler {
  private pending = false;
  private animating = 0;

  constructor(private readonly draw: (now: number) => void) {}

  /** Schedule one redraw on the next frame (coalesces repeat calls). */
  invalidate(): void {
    if (this.pending) return;
    this.pending = true;
    requestAnimationFrame((now) => {
      this.pending = false;
      this.draw(now);
      if (this.animating > 0) this.invalidate();
    });
  }

  /** Keep redrawing every frame until the returned stop function is called. */
  animate(): () => void {
    this.animating++;
    this.invalidate();
    let stopped = false;
    return () => {
      if (stopped) return;
      stopped = true;
      this.animating--;
    };
  }

  get isIdle(): boolean {
    return !this.pending && this.animating === 0;
  }
}
