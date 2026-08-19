import * as THREE from 'three';
import { ROAD_CONSTANTS } from './road.models';
import { RoadSharedState } from './road-shared-state';

export class RoadThreeScene {
  private renderer!: THREE.WebGLRenderer;
  scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private timer = new THREE.Timer();
  private rafId = 0;
  private ro!: ResizeObserver;
  private roadTexture!: THREE.CanvasTexture;
  private roadOffset = 0;
  private roadGroup!: THREE.Group;
  private oncomingCarGroup!: THREE.Group;
  private ferrariGroup: THREE.Group | null = null;
  private queueCarGroup: THREE.Group | null = null;
  private readonly queueCarRecycleThreshold = 15;

  constructor(
    private readonly state: RoadSharedState,
    private readonly isRunning: () => boolean,
  ) {}

  // ── Init ──────────────────────────────────────────────────────────────────

  init(canvas: HTMLCanvasElement): void {
    const w = canvas.clientWidth || 800;
    const h = canvas.clientHeight || 600;

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setSize(w, h, false);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x87ceeb);
    this.scene.fog = new THREE.FogExp2(0x87ceeb, 0.018);

    this.camera = new THREE.PerspectiveCamera(75, w / h, 0.01, 200);
    this.camera.position.set(0, 1.0, 0.15);
    this.camera.lookAt(0, 0.82, -10);

    this.buildLights();
    this.buildEnvironment();
    this.buildOncomingCar();

    this.roadGroup.position.x = 2.5;
  }

  setupResize(canvas: HTMLCanvasElement): void {
    this.ro = new ResizeObserver(() => {
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (!w || !h) return;
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(w, h, false);
    });
    this.ro.observe(canvas);
  }

  startLoop(): void {
    const tick = () => {
      this.rafId = requestAnimationFrame(tick);
      this.timer.update();
      this.updateThree(this.timer.getDelta());
      this.renderer.render(this.scene, this.camera);
    };
    tick();
  }

  /** Called by the component after initFerrari() resolves. */
  setFerrariGroups(ferrari: THREE.Group, queue: THREE.Group): void {
    this.ferrariGroup = ferrari;
    this.queueCarGroup = queue;
  }

  /** Swaps the placeholder box-car for the loaded Ferrari clone. */
  replaceOncomingCarWithFerrari(group: THREE.Group): void {
    group.visible = this.oncomingCarGroup.visible;
    group.position.copy(this.oncomingCarGroup.position);
    group.scale.copy(this.oncomingCarGroup.scale);
    this.scene.remove(this.oncomingCarGroup);
    this.oncomingCarGroup = group;
    this.scene.add(this.oncomingCarGroup);
  }

  /** Resets queue car positions (called on game reset). */
  resetQueueCars(): void {
    if (this.queueCarGroup) {
      this.queueCarGroup.position.z = 0;
      this.queueCarGroup.children.forEach((car, i) => {
        car.position.z = -(i + 1) * 15;
      });
    }
  }

  dispose(): void {
    cancelAnimationFrame(this.rafId);
    this.ro?.disconnect();
    if (this.ferrariGroup) {
      this.ferrariGroup.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.geometry.dispose();
          const mats = Array.isArray(child.material) ? child.material : [child.material];
          mats.forEach((m) => m.dispose());
        }
      });
    }
    this.renderer?.dispose();
  }

  // ── Lights ────────────────────────────────────────────────────────────────

  private buildLights(): void {
    this.scene.add(new THREE.AmbientLight(0xfff4e0, 0.55));

    const sun = new THREE.DirectionalLight(0xfff5e0, 1.4);
    sun.position.set(6, 12, -4);
    sun.castShadow = true;
    sun.shadow.mapSize.setScalar(1024);
    sun.shadow.camera.left = -12;
    sun.shadow.camera.right = 12;
    sun.shadow.camera.top = 12;
    sun.shadow.camera.bottom = -12;
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 60;
    sun.target.position.set(2.5, 0, -10);
    this.scene.add(sun.target);
    this.scene.add(sun);

    // Soft fill from left (overcast sky fill)
    const fill = new THREE.DirectionalLight(0xc8d8ff, 0.35);
    fill.position.set(-5, 4, 2);
    this.scene.add(fill);

    // Interior dash ambient
    const dashPoint = new THREE.PointLight(0x223344, 0.5, 2.5);
    dashPoint.position.set(0, 0.75, -0.55);
    this.scene.add(dashPoint);
  }

  // ── Environment ───────────────────────────────────────────────────────────

  private buildEnvironment(): void {
    const tc = document.createElement('canvas');
    tc.width = 1024;
    tc.height = 1024;
    const ctx = tc.getContext('2d')!;

    ctx.fillStyle = '#3a3c3a';
    ctx.fillRect(0, 0, 1024, 1024);

    // Edge lines (solid white)
    ctx.fillStyle = '#e8e8e8';
    ctx.fillRect(36, 0, 20, 1024);
    ctx.fillRect(968, 0, 20, 1024);

    // Center double line (yellow)
    ctx.fillStyle = '#f0d040';
    ctx.fillRect(496, 0, 16, 1024);
    ctx.fillRect(512, 0, 16, 1024);

    // Lane dashes (white, dashed)
    ctx.fillStyle = 'rgba(220,220,220,0.7)';
    for (let y = 0; y < 1024; y += 144) {
      ctx.fillRect(170, y, 16, 96);
      ctx.fillRect(838, y, 16, 96);
    }

    // Slight asphalt texture noise
    for (let i = 0; i < 300; i++) {
      const nx = Math.random() * 1024;
      const ny = Math.random() * 1024;
      const alpha = Math.random() * 0.06;
      ctx.fillStyle = `rgba(255,255,255,${alpha})`;
      ctx.fillRect(nx, ny, 4, 4);
    }

    this.roadTexture = new THREE.CanvasTexture(tc);
    this.roadTexture.wrapS = THREE.RepeatWrapping;
    this.roadTexture.wrapT = THREE.RepeatWrapping;
    this.roadTexture.repeat.set(1, 25);
    this.roadTexture.anisotropy = this.renderer.capabilities.getMaxAnisotropy();

    const roadMat = new THREE.MeshStandardMaterial({
      map: this.roadTexture,
      roughness: 0.95,
      metalness: 0,
    });
    const road = new THREE.Mesh(new THREE.PlaneGeometry(13, 220), roadMat);
    road.rotation.x = -Math.PI / 2;
    road.position.set(0, 0, -109);
    road.receiveShadow = true;

    const grassMat = new THREE.MeshStandardMaterial({ color: 0x4a7c4a, roughness: 1 });
    const grassMeshes = [-33, 33].map(sx => {
      const g = new THREE.Mesh(new THREE.PlaneGeometry(55, 220), grassMat);
      g.rotation.x = -Math.PI / 2;
      g.position.set(sx, 0, -109);
      g.receiveShadow = true;
      return g;
    });

    this.roadGroup = new THREE.Group();
    this.roadGroup.add(road, ...grassMeshes);
    this.scene.add(this.roadGroup);
  }

  // ── Oncoming car ──────────────────────────────────────────────────────────

  private buildOncomingCar(): void {
    this.oncomingCarGroup = new THREE.Group();
    this.oncomingCarGroup.visible = false;

    const bodyMat = new THREE.MeshStandardMaterial({ color: 0xd8cce8, roughness: 0.55, metalness: 0.1 });
    const darkMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.8 });
    const glassMat = new THREE.MeshStandardMaterial({
      color: 0x99aabb,
      roughness: 0.1,
      metalness: 0.1,
      transparent: true,
      opacity: 0.7,
    });
    const headlightMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0xffffcc,
      emissiveIntensity: 1.5,
    });
    const taillightMat = new THREE.MeshStandardMaterial({
      color: 0xff2222,
      emissive: 0xff0000,
      emissiveIntensity: 0.8,
    });

    // Body lower
    const lower = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.7, 4.2), bodyMat);
    lower.position.y = 0.35;
    this.oncomingCarGroup.add(lower);

    // Cabin
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.65, 2.2), bodyMat);
    cabin.position.set(0, 1.02, -0.2);
    this.oncomingCarGroup.add(cabin);

    // Windshield
    const wshield = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 0.55), glassMat);
    wshield.position.set(0, 1.02, 0.9);
    wshield.rotation.x = 0.4;
    this.oncomingCarGroup.add(wshield);

    // Rear window
    const rWin = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 0.45), glassMat);
    rWin.position.set(0, 1.0, -1.3);
    rWin.rotation.x = -0.35;
    rWin.rotation.y = Math.PI;
    this.oncomingCarGroup.add(rWin);

    // Wheels (4)
    const wheelGeo = new THREE.CylinderGeometry(0.3, 0.3, 0.22, 14);
    const wheelPositions: [number, number, number][] = [
      [-0.95, 0.3, 1.2], [0.95, 0.3, 1.2],
      [-0.95, 0.3, -1.2], [0.95, 0.3, -1.2],
    ];
    for (const pos of wheelPositions) {
      const w = new THREE.Mesh(wheelGeo, darkMat);
      w.rotation.z = Math.PI / 2;
      w.position.set(...pos);
      this.oncomingCarGroup.add(w);
    }

    // Headlights (front — facing driver)
    for (const lx of [-0.55, 0.55]) {
      const hl = new THREE.Mesh(new THREE.CircleGeometry(0.12, 12), headlightMat);
      hl.position.set(lx, 0.6, 2.12);
      this.oncomingCarGroup.add(hl);
    }

    // Taillights (rear)
    for (const lx of [-0.55, 0.55]) {
      const tl = new THREE.Mesh(new THREE.CircleGeometry(0.1, 12), taillightMat);
      tl.position.set(lx, 0.6, -2.12);
      this.oncomingCarGroup.add(tl);
    }

    // Grill
    const grill = new THREE.Mesh(
      new THREE.PlaneGeometry(1.0, 0.3),
      new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.7 }),
    );
    grill.position.set(0, 0.4, 2.12);
    this.oncomingCarGroup.add(grill);

    this.oncomingCarGroup.position.set(-0.8, 0, -30);
    this.scene.add(this.oncomingCarGroup);
  }

  // ── Render loop ───────────────────────────────────────────────────────────

  private updateThree(delta: number): void {
    const isPlaying = this.isRunning();

    // Road scrolling + world travel
    if (isPlaying && this.state.threeSpeedKph > 0) {
      const mps = this.state.threeSpeedKph / 3.6;
      const travelDelta = mps * delta;

      const roadLengthUnits = 220;
      const textureRepeats = 25;
      this.roadOffset += (travelDelta * textureRepeats) / roadLengthUnits;
      if (this.roadOffset > 1) this.roadOffset -= 1;
      this.roadTexture.offset.y = this.roadOffset;
      this.roadTexture.needsUpdate = true;

      // Advance each right-lane car individually; recycle to back with a random gap
      if (this.queueCarGroup) {
        for (const car of this.queueCarGroup.children) {
          car.position.z += travelDelta;
          if (car.position.z > this.queueCarRecycleThreshold) {
            let minZ = Infinity;
            for (const other of this.queueCarGroup.children) {
              if (other !== car) minZ = Math.min(minZ, other.position.z);
            }
            car.position.z =
              minZ -
              (ROAD_CONSTANTS.queueCarMinGapUnits +
                Math.random() *
                  (ROAD_CONSTANTS.queueCarMaxGapUnits - ROAD_CONSTANTS.queueCarMinGapUnits));
          }
        }
      }
    }

    this.updateOncomingCar3d(delta);

    // Crash camera shake
    if (this.state.crashShake > 0) {
      this.state.crashShake -= delta * 1.8;
      this.state.crashShakeTime += delta;
      const amp = Math.max(0, this.state.crashShake) * 0.045;
      this.camera.position.x = Math.sin(this.state.crashShakeTime * 32) * amp;
      this.camera.position.y = 1.0 + Math.cos(this.state.crashShakeTime * 28) * amp * 0.6;
    } else {
      this.camera.position.x += (0 - this.camera.position.x) * delta * 8;
      this.camera.position.y += (1.0 - this.camera.position.y) * delta * 8;
    }
  }

  private updateOncomingCar3d(delta: number): void {
    // Post-crash: animate car continuing into camera
    if (this.state.crashCarActive) {
      this.oncomingCarGroup.visible = true;
      this.state.crashCarZ += 22 * delta;
      this.state.crashCarX += (0 - this.state.crashCarX) * 8 * delta;
      this.oncomingCarGroup.position.set(this.state.crashCarX, 0, this.state.crashCarZ);
      this.oncomingCarGroup.scale.setScalar(1.0);
      if (this.state.crashCarZ > 3) {
        this.state.crashCarActive = false;
        this.oncomingCarGroup.visible = false;
      }
      return;
    }

    if (this.state.currentOncomingProgress < 0) {
      this.oncomingCarGroup.visible = false;
      return;
    }

    this.oncomingCarGroup.visible = true;

    // progress 0 = spawned above screen (far away), 1 = at collision (very close)
    const zFar = -80;
    const zClose = -8;
    const z = zFar + this.state.currentOncomingProgress * (zClose - zFar);
    this.oncomingCarGroup.position.z = z;

    // Scale car to feel properly sized at distance
    const scale = 0.5 + this.state.currentOncomingProgress * 0.5;
    this.oncomingCarGroup.scale.setScalar(scale);
  }
}
