import { AudioService } from '../../core/audio.service';
import { OncomingCar, ROAD_CONSTANTS } from './road.models';
import { RoadSharedState } from './road-shared-state';

export interface RoadPhysicsCallbacks {
  /** Collision with the oncoming car. Sets game over and emits crashed. */
  onCrash: (reactionTime: string | null) => void;
  /** Oncoming car successfully avoided. */
  onAvoided: (reactionTime: string | null) => void;
  /** Player braked with no oncoming car visible. Sets game over. */
  onBrakedNeedlessly: () => void;
  /** Player's car came to a full stop after braking. */
  onBrakingComplete: () => void;
  onSpeedChange: (kph: number) => void;
  onDistanceChange: (meters: number) => void;
  onOncomingProgress: (progress: number) => void;
  onBrakeLightsLit: (lit: boolean) => void;
  onReactionTime: (ms: number) => void;
}

export class RoadPhysics {
  oncomingCarState: OncomingCar | null = null;

  private currentSpeedPxPerMs = 0;
  private isAccelerating = false;
  private brakingDecelPxPerMs2 = 0;
  private travelledDistanceMeters = 0;
  private oncomingVisible = false;
  private reactionStartMs: number | null = null;
  private reactionTimeMs: number | null = null;
  private isAvoided = false;

  constructor(
    private readonly state: RoadSharedState,
    private readonly audioService: AudioService,
    private readonly getLaneHeight: () => number,
    private readonly isRunning: () => boolean,
    private readonly callbacks: RoadPhysicsCallbacks,
  ) {}

  get currentSpeed(): number {
    return this.currentSpeedPxPerMs;
  }

  reset(): void {
    this.travelledDistanceMeters = 0;
    this.currentSpeedPxPerMs = 0;
    this.isAccelerating = false;
    this.brakingDecelPxPerMs2 = 0;
    this.oncomingCarState = null;
    this.isAvoided = false;
    this.oncomingVisible = false;
    this.reactionStartMs = null;
    this.reactionTimeMs = null;
    this.state.isBrakingActive = false;
    this.state.currentOncomingProgress = -1;
    this.state.threeSpeedKph = 0;
    this.state.crashCarActive = false;
    this.state.crashShake = 0;
  }

  spawnOncomingCar(laneHeight: number): void {
    this.oncomingCarState = {
      top: -(laneHeight * ROAD_CONSTANTS.oncomingSpawnDistanceRatio),
      speedPxPerMs: ROAD_CONSTANTS.oncomingCarSpeedPxPerMs,
      braking: false,
      ownTravelledPx: 0,
      brakeTravelPx: laneHeight * ROAD_CONSTANTS.oncomingBrakeTravelRatio,
    };
  }

  updatePhysics(deltaMs: number): void {
    const maxSpeed = ROAD_CONSTANTS.maxSpeedPxPerMs;

    if (this.isAccelerating) {
      this.currentSpeedPxPerMs = Math.min(
        this.currentSpeedPxPerMs + maxSpeed * (deltaMs / ROAD_CONSTANTS.accelerationMs),
        maxSpeed,
      );
    } else if (this.state.isBrakingActive) {
      this.currentSpeedPxPerMs = Math.max(
        this.currentSpeedPxPerMs - this.brakingDecelPxPerMs2 * deltaMs,
        0,
      );
      if (this.currentSpeedPxPerMs === 0) {
        this.state.isBrakingActive = false;
        this.brakingDecelPxPerMs2 = 0;
        this.callbacks.onBrakeLightsLit(false);
        this.callbacks.onBrakingComplete();
      }
    } else if (this.currentSpeedPxPerMs > 0) {
      this.currentSpeedPxPerMs = Math.max(
        this.currentSpeedPxPerMs - maxSpeed * (deltaMs / ROAD_CONSTANTS.coastingDecelerationMs),
        0,
      );
    }

    const kph = this.getCurrentSpeedMetersPerSecond() * 3.6;
    this.state.threeSpeedKph = kph;
    this.callbacks.onSpeedChange(kph);
    this.audioService.updateEngineSpeed(kph);
  }

  accumulateDistance(deltaMs: number): void {
    this.travelledDistanceMeters += this.getCurrentSpeedMetersPerSecond() * (deltaMs / 1000);
    this.callbacks.onDistanceChange(this.travelledDistanceMeters);
  }

  updateOncomingCar(deltaMs: number, playerDeltaPx: number): void {
    const oncoming = this.oncomingCarState;
    if (!oncoming) {
      this.state.currentOncomingProgress = -1;
      this.callbacks.onOncomingProgress(-1);
      return;
    }

    // Start reaction timer when car first spawns (already visible in 3D at Z=-80)
    if (!this.oncomingVisible) {
      this.oncomingVisible = true;
      this.reactionStartMs = Date.now();
    }

    const decelPxPerMs2 =
      ROAD_CONSTANTS.emergencyBrakingDecelMs2 / (ROAD_CONSTANTS.metersPerPixel * 1_000_000);

    let newSpeed = oncoming.speedPxPerMs;
    const braking = oncoming.braking;

    if (braking) {
      newSpeed = Math.max(0, oncoming.speedPxPerMs - decelPxPerMs2 * deltaMs);
    }

    const ownDelta = newSpeed * deltaMs;
    const newTop = oncoming.top + ownDelta + playerDeltaPx;
    const playerTopPx = this.getLaneHeight() - 16 - ROAD_CONSTANTS.carHeightPx;

    if (!this.isAvoided && newTop + ROAD_CONSTANTS.carHeightPx >= playerTopPx) {
      if (this.reactionStartMs !== null && this.reactionTimeMs === null) {
        this.reactionTimeMs = Date.now() - this.reactionStartMs;
        this.callbacks.onReactionTime(this.reactionTimeMs);
      }
      // Trigger 3D crash animation
      this.state.crashShake = 1.0;
      this.state.crashShakeTime = 0;
      if (this.state.currentOncomingProgress >= 0) {
        const p = Math.max(0, Math.min(1, this.state.currentOncomingProgress));
        this.state.crashCarZ = -80 + p * 72;
        this.state.crashCarX = -0.8;
        this.state.crashCarActive = true;
      }
      this.callbacks.onCrash(this.formatReactionTime());
      return;
    }

    if (newSpeed === 0) {
      this.oncomingCarState = {
        ...oncoming,
        top: newTop,
        speedPxPerMs: 0,
        braking: true,
        ownTravelledPx: oncoming.ownTravelledPx + ownDelta,
      };
      if (!this.isAvoided) {
        this.isAvoided = true;
        this.callbacks.onAvoided(this.formatReactionTime());
      }
      return;
    }

    this.oncomingCarState = {
      ...oncoming,
      top: newTop,
      speedPxPerMs: newSpeed,
      braking,
      ownTravelledPx: oncoming.ownTravelledPx + ownDelta,
    };

    const spawnTop = -(this.getLaneHeight() * ROAD_CONSTANTS.oncomingSpawnDistanceRatio);
    const progress = (newTop - spawnTop) / (playerTopPx - ROAD_CONSTANTS.carHeightPx - spawnTop);
    this.state.currentOncomingProgress = Math.max(0, Math.min(1, progress));
    this.callbacks.onOncomingProgress(this.state.currentOncomingProgress);
  }

  getCurrentSpeedMetersPerSecond(): number {
    return this.currentSpeedPxPerMs * ROAD_CONSTANTS.metersPerPixel * 1000;
  }

  onAccelerateStart(): void {
    if (this.state.isBrakingActive || !this.isRunning()) return;
    this.isAccelerating = true;
  }

  onAccelerateEnd(): void {
    this.isAccelerating = false;
  }

  onBrakeStart(): void {
    if (this.state.isBrakingActive || !this.isRunning() || this.currentSpeedPxPerMs <= 0) return;

    this.audioService.playBrake();

    // Braking with no opponent on screen = game over
    if (!this.oncomingVisible) {
      this.callbacks.onBrakedNeedlessly();
      return;
    }

    // Stop reaction timer on first brake press
    if (this.reactionStartMs !== null && this.reactionTimeMs === null) {
      this.reactionTimeMs = Date.now() - this.reactionStartMs;
      this.callbacks.onReactionTime(this.reactionTimeMs);
    }

    this.brakingDecelPxPerMs2 =
      ROAD_CONSTANTS.emergencyBrakingDecelMs2 / (ROAD_CONSTANTS.metersPerPixel * 1_000_000);
    this.state.isBrakingActive = true;
    this.isAccelerating = false;
    this.callbacks.onBrakeLightsLit(true);

    if (this.oncomingCarState && !this.oncomingCarState.braking) {
      this.oncomingCarState = { ...this.oncomingCarState, braking: true };
    }
  }

  onBrakeEnd(): void {
    // No-op: braking is committed until full stop
  }

  private formatReactionTime(): string | null {
    if (this.reactionTimeMs === null) return null;
    return (this.reactionTimeMs / 1000).toFixed(2) + 's';
  }
}
