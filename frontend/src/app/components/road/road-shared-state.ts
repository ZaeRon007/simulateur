/** Mutable state shared between the 2D physics loop and the 3D render loop. */
export class RoadSharedState {
  canvasWidth = 0;
  canvasHeight = 0;
  scrollOffset = 0;

  // Written by physics, read by 3D scene
  currentOncomingProgress = -1;
  threeSpeedKph = 0;
  isBrakingActive = false;
  crashShake = 0;
  crashShakeTime = 0;
  crashCarActive = false;
  crashCarZ = -8;
  crashCarX = -0.8;
}
