import { OncomingCar, ROAD_CONSTANTS, RoadSegment } from './road.models';
import { RoadSharedState } from './road-shared-state';

export class Road2dRenderer {
  private segments: RoadSegment[] = [];
  private queuedCarTops: number[] = [];

  constructor(
    private readonly ctx: CanvasRenderingContext2D,
    private readonly state: RoadSharedState,
    private readonly getOncomingCarState: () => OncomingCar | null,
  ) {}

  // ── Segment management ──────────────────────────────────────────────────────

  /**
   * Pre-renders an off-screen road segment (background + border lines).
   * Center-line dashes are drawn dynamically in drawFrame to remain seamless.
   */
  private prerenderSegment(offsetY: number): RoadSegment {
    const w = this.state.canvasWidth;
    const h = this.state.canvasHeight;
    const offscreen = document.createElement('canvas');
    offscreen.width = w;
    offscreen.height = h;
    const ctx = offscreen.getContext('2d')!;

    const roadLeft = Math.round(w * 0.12);
    const roadRight = Math.round(w * 0.88);

    ctx.fillStyle = '#90c890';
    ctx.fillRect(0, 0, w, h);

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(roadLeft, 0, roadRight - roadLeft, h);

    ctx.fillStyle = '#111111';
    ctx.fillRect(roadLeft, 0, 3, h);
    ctx.fillRect(roadRight - 3, 0, 3, h);

    return { offsetY, canvas: offscreen };
  }

  initSegments(): void {
    this.segments = [
      this.prerenderSegment(-this.state.canvasHeight), // pre-rendered, above screen
      this.prerenderSegment(0),                        // visible
    ];
  }

  recycleSegments(deltaPx: number): void {
    for (const seg of this.segments) {
      seg.offsetY += deltaPx;
    }
    this.terminateOffscreenSegments();
    this.ensurePrerenderedSegment();
  }

  private terminateOffscreenSegments(): void {
    this.segments = this.segments.filter(seg => seg.offsetY < this.state.canvasHeight);
  }

  private ensurePrerenderedSegment(): void {
    while (!this.segments.length || this.segments[0].offsetY > -this.state.canvasHeight) {
      const topOffsetY = this.segments.length ? this.segments[0].offsetY : 0;
      this.segments.unshift(this.prerenderSegment(topOffsetY - this.state.canvasHeight));
    }
  }

  // ── Queued car management ───────────────────────────────────────────────────

  initQueuedCars(): void {
    this.queuedCarTops = [];
    const spacing = ROAD_CONSTANTS.carHeightPx + ROAD_CONSTANTS.carGapPx;
    for (
      let top = -ROAD_CONSTANTS.spawnOffsetPx;
      top < this.state.canvasHeight + ROAD_CONSTANTS.carHeightPx;
      top += spacing
    ) {
      this.queuedCarTops.push(top);
    }
  }

  advanceQueuedCars(deltaPx: number): void {
    const spacing = ROAD_CONSTANTS.carHeightPx + ROAD_CONSTANTS.carGapPx;
    this.queuedCarTops = this.queuedCarTops
      .map(top => top + deltaPx)
      .filter(top => top < this.state.canvasHeight + ROAD_CONSTANTS.carHeightPx);

    while (!this.queuedCarTops.length || this.queuedCarTops[0] > -ROAD_CONSTANTS.spawnOffsetPx) {
      const firstTop = this.queuedCarTops.length ? this.queuedCarTops[0] : 0;
      this.queuedCarTops.unshift(firstTop - spacing);
    }
  }

  // ── Canvas rendering ────────────────────────────────────────────────────────

  drawFrame(): void {
    const ctx = this.ctx;
    const { canvasWidth: w, canvasHeight: h } = this.state;
    if (!w || !h) return;

    ctx.clearRect(0, 0, w, h);

    for (const seg of this.segments) {
      ctx.drawImage(seg.canvas, 0, seg.offsetY);
    }

    this.drawCenterLine();

    const trafficCx = Math.round(w * 0.69);
    for (const top of this.queuedCarTops) {
      this.drawCar(trafficCx, top, true, '#f4f4f4', true);
    }

    const oncoming = this.getOncomingCarState();
    if (oncoming) {
      const oncomingCx = Math.round(w * 0.31);
      this.drawCar(oncomingCx, oncoming.top, false, '#e8e0f0', true);
    }
  }

  private drawCenterLine(): void {
    const phase = this.state.scrollOffset % ROAD_CONSTANTS.dashPatternPx;
    const cx = Math.round(this.state.canvasWidth / 2);
    this.ctx.fillStyle = '#111111';
    for (
      let y = phase - ROAD_CONSTANTS.dashPatternPx;
      y < this.state.canvasHeight;
      y += ROAD_CONSTANTS.dashPatternPx
    ) {
      this.ctx.fillRect(cx - 1, y, 3, ROAD_CONSTANTS.dashOnPx);
    }
  }

  /**
   * Draws a car onto the canvas.
   * @param flip - when true, flips vertically so the rear (brake lights) face downward,
   *               matching queued cars in the same lane as the player.
   */
  private drawCar(
    cx: number,
    topY: number,
    flip: boolean,
    bodyColor: string,
    rearLightsRed: boolean,
  ): void {
    const ctx = this.ctx;
    const w = ROAD_CONSTANTS.carWidthPx;
    const h = ROAD_CONSTANTS.carHeightPx;
    const x = cx - w / 2;

    ctx.save();
    if (flip) {
      ctx.translate(cx, topY + h / 2);
      ctx.scale(1, -1);
      ctx.translate(-cx, -(topY + h / 2));
    }

    // Body
    ctx.fillStyle = bodyColor;
    ctx.strokeStyle = '#111111';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(x, topY, w, h, 18);
    ctx.fill();
    ctx.stroke();

    // Window
    ctx.fillStyle = '#d9d9d9';
    ctx.beginPath();
    ctx.roundRect(x + 9, topY + 12, 32, 34, 8);
    ctx.fill();
    ctx.stroke();

    // Rear lights
    ctx.fillStyle = rearLightsRed ? '#ff2626' : '#741818';
    ctx.beginPath();
    ctx.ellipse(x + 11.5, topY + 12, 4.5, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(x + w - 11.5, topY + 12, 4.5, 5, 0, 0, Math.PI * 2);
    ctx.fill();

    // Front lights
    ctx.fillStyle = '#d8d8d8';
    ctx.beginPath();
    ctx.ellipse(x + 11.5, topY + h - 12, 4.5, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(x + w - 11.5, topY + h - 12, 4.5, 5, 0, 0, Math.PI * 2);
    ctx.fill();

    // Wheels (6 × 18, radius 4)
    ctx.fillStyle = '#111111';
    ctx.beginPath();
    ctx.roundRect(x - 5, topY + 14, 6, 18, 4);
    ctx.fill();
    ctx.beginPath();
    ctx.roundRect(x + w - 1, topY + 14, 6, 18, 4);
    ctx.fill();
    ctx.beginPath();
    ctx.roundRect(x - 5, topY + h - 34, 6, 18, 4);
    ctx.fill();
    ctx.beginPath();
    ctx.roundRect(x + w - 1, topY + h - 34, 6, 18, 4);
    ctx.fill();

    ctx.restore();
  }
}
