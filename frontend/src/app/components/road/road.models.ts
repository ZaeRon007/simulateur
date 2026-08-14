export interface RoadSegment {
  offsetY: number;
  canvas: HTMLCanvasElement;
}

export interface OncomingCar {
  top: number;
  speedPxPerMs: number;
  braking: boolean;
  ownTravelledPx: number;
  brakeTravelPx: number;
}

const carHeightPx = 96;
const carWidthPx = 54;
const carGapPx = 48;
const carLengthMeters = 2.61;
const carDistanceGapMeters = 1.5;
const metersPerPixel = (carLengthMeters + carDistanceGapMeters) / (carHeightPx + carGapPx);
const spawnOffsetPx = 120;
const maxSpeedKph = 30;
const maxSpeedPxPerMs = (maxSpeedKph / 3.6) / (metersPerPixel * 1000);
const accelerationMs = 1500;
const coastingDecelerationMs = 3000;
const emergencyBrakingDecelMs2 = 8;
const oncomingCarSpeedKph = 30;
const oncomingCarSpeedPxPerMs = (oncomingCarSpeedKph / 3.6) / (metersPerPixel * 1000);
const oncomingBrakeTravelRatio = 0.15;
const dashOnPx = 12;
const dashPatternPx = 24;
const queueCarMinGapUnits = 6;
const queueCarMaxGapUnits = 12;

export const ROAD_CONSTANTS = {
  carHeightPx,
  carWidthPx,
  carGapPx,
  carLengthMeters,
  carDistanceGapMeters,
  metersPerPixel,
  spawnOffsetPx,
  maxSpeedKph,
  maxSpeedPxPerMs,
  accelerationMs,
  coastingDecelerationMs,
  emergencyBrakingDecelMs2,
  oncomingCarSpeedKph,
  oncomingCarSpeedPxPerMs,
  oncomingBrakeTravelRatio,
  dashOnPx,
  dashPatternPx,
  queueCarMinGapUnits,
  queueCarMaxGapUnits,
} as const;
