import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Input,
  NgZone,
  OnChanges,
  OnDestroy,
  SimpleChanges,
  ViewChild,
} from '@angular/core';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

const SKIN_COLOR = 0xf0c080;
const WHEEL_COLOR = 0x111111;
const DASH_COLOR = 0x1a1a1a;
const ROAD_COLOR = 0x3a3a3a;

@Component({
  selector: 'app-scene3d',
  standalone: true,
  template: `<canvas #canvas></canvas>`,
  styles: [
    `
      :host {
        display: block;
        width: 100%;
        height: 100%;
        overflow: hidden;
      }
      canvas {
        display: block;
        width: 100%;
        height: 100%;
        outline: none;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Scene3dComponent implements AfterViewInit, OnChanges, OnDestroy {
  @ViewChild('canvas') canvasRef!: ElementRef<HTMLCanvasElement>;

  @Input() speedKph = 0;
  @Input() isBraking = false;
  @Input() hasCrashed = false;
  @Input() isPlaying = false;
  @Input() oncomingProgress = -1; // -1 = no car, 0-1 = approaching
  @Input() roadBlur = ''; // CSS filter string

  private renderer!: THREE.WebGLRenderer;
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private timer = new THREE.Timer();
  private rafId = 0;
  private ro!: ResizeObserver;

  private roadTexture!: THREE.CanvasTexture;
  private roadOffset = 0;
  private worldTravelM = 0; // total virtual meters driven
  private treeGroup!: THREE.Group;
  private wheelGroup!: THREE.Group;
  private leftHandGroup!: THREE.Group;
  private rightHandGroup!: THREE.Group;
  private oncomingCarGroup!: THREE.Group;
  private ferrariGroup: THREE.Group | null = null;

  private crashShake = 0;
  private crashShakeTime = 0;

  private crashCarActive = false;
  private crashCarZ = -8;
  private crashCarX = -0.8;

  constructor(private ngZone: NgZone) {}

  ngAfterViewInit(): void {
    this.ngZone.runOutsideAngular(() => {
      this.initThree();
      this.startLoop();
      this.setupResize();
    });
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['hasCrashed']?.currentValue) {
      this.crashShake = 1.0;
      this.crashShakeTime = 0;
      if (this.oncomingProgress >= 0) {
        const progress = Math.max(0, Math.min(1, this.oncomingProgress));
        this.crashCarZ = -80 + progress * 72;
        this.crashCarX = -0.8;
        this.crashCarActive = true;
      }
    }
    if (changes['isPlaying']?.currentValue === true) {
      this.crashCarActive = false;
    }
    if (changes['roadBlur'] && this.canvasRef) {
      this.canvasRef.nativeElement.style.filter = this.roadBlur;
    }
  }

  ngOnDestroy(): void {
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

  // ── Init ──────────────────────────────────────────────────────────────────

  private initThree(): void {
    const canvas = this.canvasRef.nativeElement;
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
    this.loadFerrari();
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
    sun.shadow.camera.far = 60;
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
    // Road surface texture
    const tc = document.createElement('canvas');
    tc.width = 512;
    tc.height = 512;
    const ctx = tc.getContext('2d')!;

    ctx.fillStyle = '#3a3c3a';
    ctx.fillRect(0, 0, 512, 512);

    // Edge lines (solid white)
    ctx.fillStyle = '#e8e8e8';
    ctx.fillRect(18, 0, 10, 512);
    ctx.fillRect(484, 0, 10, 512);

    // Center double line (yellow)
    ctx.fillStyle = '#f0d040';
    ctx.fillRect(248, 0, 8, 512);
    ctx.fillRect(256, 0, 8, 512);

    // Lane dashes (white, dashed)
    ctx.fillStyle = 'rgba(220,220,220,0.7)';
    for (let y = 0; y < 512; y += 72) {
      ctx.fillRect(130, y, 8, 48);
      ctx.fillRect(374, y, 8, 48);
    }

    // Slight asphalt texture noise
    for (let i = 0; i < 300; i++) {
      const nx = Math.random() * 512;
      const ny = Math.random() * 512;
      const alpha = Math.random() * 0.06;
      ctx.fillStyle = `rgba(255,255,255,${alpha})`;
      ctx.fillRect(nx, ny, 2, 2);
    }

    this.roadTexture = new THREE.CanvasTexture(tc);
    this.roadTexture.wrapS = THREE.RepeatWrapping;
    this.roadTexture.wrapT = THREE.RepeatWrapping;
    this.roadTexture.repeat.set(1, 25);

    const roadMat = new THREE.MeshStandardMaterial({
      map: this.roadTexture,
      roughness: 0.95,
      metalness: 0,
    });
    const road = new THREE.Mesh(new THREE.PlaneGeometry(7, 220), roadMat);
    road.rotation.x = -Math.PI / 2;
    road.position.set(0, 0, -109);
    road.receiveShadow = true;
    this.scene.add(road);

    // Grass
    const grassMat = new THREE.MeshStandardMaterial({ color: 0x4a7c4a, roughness: 1 });
    for (const sx of [-33, 33]) {
      const g = new THREE.Mesh(new THREE.PlaneGeometry(60, 220), grassMat);
      g.rotation.x = -Math.PI / 2;
      g.position.set(sx, 0, -109);
      g.receiveShadow = true;
      this.scene.add(g);
    }

    // this.addTrees();
  }

  private addTrees(): void {
    this.treeGroup = new THREE.Group();
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5c3a1a, roughness: 1 });
    const leafMat = new THREE.MeshStandardMaterial({ color: 0x2e6b2e, roughness: 1 });

    // Positions: [x offset from road edge, z spacing step index]
    // Left side (x negative), right side (x positive)
    // Trees span z = -8 to -88 in steps of ~8
    for (let i = 0; i < 10; i++) {
      const z = -8 - i * 8;
      for (const sx of [-1, 1]) {
        const x = sx * (4.5 + Math.abs(Math.sin(i * 1.7)) * 2.5);
        this.addTree(x, z, trunkMat, leafMat);
      }
    }

    this.scene.add(this.treeGroup);
  }

  private addTree(x: number, z: number, trunkMat: THREE.Material, leafMat: THREE.Material): void {
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.18, 1.8, 8), trunkMat);
    trunk.position.set(x, 0.9, z);
    trunk.castShadow = true;
    this.treeGroup.add(trunk);

    const leaves = new THREE.Mesh(new THREE.ConeGeometry(1.1, 3.2, 8), leafMat);
    leaves.position.set(x, 3.4, z);
    leaves.castShadow = true;
    this.treeGroup.add(leaves);
  }

  // ── Arms & Hands ──────────────────────────────────────────────────────────

  // Group origin = wrist. Upper arm + forearm extend downward (local -Y).
  private makeArm(side: 'left' | 'right', grip: 'wheel' | 'phone'): THREE.Group {
    const g = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: SKIN_COLOR, roughness: 0.68 });

    // Forearm: y=0 (wrist) down to y=-0.36
    const forearm = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.030, 0.36, 10), mat);
    forearm.position.y = -0.18;
    forearm.position.z = 0.01;
    forearm.castShadow = true;
    g.add(forearm);

    // Elbow sphere
    const elbow = new THREE.Mesh(new THREE.SphereGeometry(0.033, 8, 6), mat);
    elbow.position.y = -0.36;
    g.add(elbow);

    // Wrist sphere at origin
    const wrist = new THREE.Mesh(new THREE.SphereGeometry(0.027, 8, 6), mat);
    wrist.position.z = 0.01;
    g.add(wrist);

    if (grip === 'wheel') {
      // Palm faces the wheel rim; fingers curl around it
      const palm = new THREE.Mesh(new THREE.BoxGeometry(0.082, 0.042, 0.110), mat);
      palm.position.set(0, 0.08, 0.01);
      palm.castShadow = true;
      g.add(palm);

      const fxs = [-0.029, -0.01, 0.01, 0.029];
      for (const fx of fxs) {
        const f = new THREE.Mesh(new THREE.CylinderGeometry(0.0072, 0.0082, 0.075, 6), mat);
        f.position.set(fx, 0.14, 0.022);
        f.rotation.x = -0.55;
        f.castShadow = true;
        g.add(f);
      }

      const tx = side === 'left' ? 0.049 : -0.049;
      const thumb = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.011, 0.060, 6), mat);
      thumb.position.set(tx, 0.09, 0.032);
      thumb.rotation.z = side === 'left' ? -0.65 : 0.65;
      thumb.rotation.x = -0.28;
      thumb.castShadow = true;
      g.add(thumb);
    } else {
      // Phone grip: palm presses against phone back; thumb swings onto screen side
      const palm = new THREE.Mesh(new THREE.BoxGeometry(0.082, 0.118, 0.034), mat);
      palm.position.set(0, 0.09, -0.01);
      palm.castShadow = true;
      g.add(palm);

      // 4 fingers wrap over the top edge toward the screen face
      const fxs = [-0.029, -0.01, 0.01, 0.029];
      for (const fx of fxs) {
        const f = new THREE.Mesh(new THREE.CylinderGeometry(0.0072, 0.0082, 0.078, 6), mat);
        f.position.set(fx, 0.19, 0.018);
        f.rotation.x = 0.38; // curl toward screen face (+Z)
        f.castShadow = true;
        g.add(f);
      }

      // Thumb extended on screen side, ready to tap — for right hand it sits on the left
      const tx = side === 'right' ? -0.062 : 0.062;
      const thumb = new THREE.Mesh(new THREE.CylinderGeometry(0.010, 0.012, 0.068, 6), mat);
      thumb.position.set(tx, 0.092, 0.008);
      thumb.rotation.z = side === 'right' ? 0.60 : -0.60;
      thumb.rotation.x = -0.25;
      thumb.castShadow = true;
      g.add(thumb);
    }

    return g;
  }

  private buildHands(): void {
    // Left arm — grips steering wheel at 9 o'clock
    this.leftHandGroup = this.makeArm('left', 'wheel');
    this.leftHandGroup.position.set(-0.21, 0.76, -0.50);
    this.leftHandGroup.rotation.x = -1.05;
    this.leftHandGroup.rotation.z = 0.22;
    this.scene.add(this.leftHandGroup);

    // Right arm — holds phone by its back, thumb ready on screen
    this.rightHandGroup = this.makeArm('left', 'phone');
    this.rightHandGroup.position.set(0.19, 0.70, -0.39);
    this.rightHandGroup.rotation.x = -1.22;
    this.rightHandGroup.rotation.y = 0;
    this.rightHandGroup.rotation.z = -0.25;
    this.scene.add(this.rightHandGroup);

  }

  // ── Oncoming car ──────────────────────────────────────────────────────────

  private buildOncomingCar(): void {
    this.oncomingCarGroup = new THREE.Group();
    this.oncomingCarGroup.visible = false;

    const bodyMat = new THREE.MeshStandardMaterial({ color: 0xd8cce8, roughness: 0.55, metalness: 0.1 });
    const darkMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.8 });
    const glassMat = new THREE.MeshStandardMaterial({ color: 0x99aabb, roughness: 0.1, metalness: 0.1, transparent: true, opacity: 0.7 });
    const headlightMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffcc, emissiveIntensity: 1.5 });
    const taillightMat = new THREE.MeshStandardMaterial({ color: 0xff2222, emissive: 0xff0000, emissiveIntensity: 0.8 });

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

  // ── Ferrari model ─────────────────────────────────────────────────────────

  private loadFerrari(): void {
    const draco = new DRACOLoader();
    draco.setDecoderPath('/draco/');

    const loader = new GLTFLoader();
    loader.setDRACOLoader(draco);
    loader.load(
      '/models/ferrari.glb',
      (gltf: GLTF) => {
        const car = gltf.scene;

        // Shift car rearward so camera at Z=0.15 sits at driver's seat;
        // hood extends from ~Z=-0.5 to ~Z=-2, visible in lower FOV.
        car.position.set(0.35, 0, 0);

        car.traverse((child) => {
          if (!(child instanceof THREE.Mesh)) return;
          const mats = Array.isArray(child.material) ? child.material : [child.material];
          for (const mat of mats) {
            if (!(mat instanceof THREE.MeshStandardMaterial)) continue;
            const isGlass =
              child.name.toLowerCase().includes('glass') ||
              mat.name.toLowerCase().includes('glass');
            if (isGlass) {
              mat.transparent = true;
              mat.opacity = 0.3;
              mat.depthWrite = false;
              child.renderOrder = 1;
            }
          }
          child.castShadow = true;
          child.receiveShadow = true;
        });

        this.ferrariGroup = car;
        this.scene.add(car);
      },
      undefined,
      (error: unknown) => {
        console.warn('[Scene3d] Ferrari model not loaded — scene continues without it.', error);
      },
    );
  }

  // ── Resize ────────────────────────────────────────────────────────────────

  private setupResize(): void {
    const canvas = this.canvasRef.nativeElement;
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

  // ── Render loop ───────────────────────────────────────────────────────────

  private startLoop(): void {
    const tick = () => {
      this.rafId = requestAnimationFrame(tick);
      this.timer.update();
      this.update(this.timer.getDelta());
      this.renderer.render(this.scene, this.camera);
    };
    tick();
  }

  private update(delta: number): void {
    const elapsed = this.timer.getElapsed();

    // Road scrolling + world travel
    if (this.isPlaying && this.speedKph > 0) {
      const mps = this.speedKph / 3.6;
      const travelDelta = mps * delta;
      this.worldTravelM += travelDelta;

      const roadLengthUnits = 220;
      const textureRepeats = 25;
      this.roadOffset += (travelDelta * textureRepeats) / roadLengthUnits;
      if (this.roadOffset > 1) this.roadOffset -= 1;
      this.roadTexture.offset.y = this.roadOffset;
      this.roadTexture.needsUpdate = true;

      // Shift tree group forward (world moves toward camera)
      if (this.treeGroup) {
        this.treeGroup.position.z += travelDelta;
        // When trees have passed ~12 units behind camera, recycle them back 80 units ahead
        if (this.treeGroup.position.z > 12) {
          this.treeGroup.position.z -= 80;
        }
      }
    }

    // Steering wheel sway
    if (this.wheelGroup) {
      const swayAmp = this.isPlaying ? (this.isBraking ? 0.015 : 0.088) : 0.02;
      const swaySpeed = this.isBraking ? 1.8 : 0.42;
      this.wheelGroup.rotation.z = Math.sin(elapsed * swaySpeed) * swayAmp;

      // Braking: wheel tilts slightly forward (grip tightens)
      const brakeTilt = this.isBraking ? 0.05 : 0;
      this.wheelGroup.rotation.y += (brakeTilt - this.wheelGroup.rotation.y) * delta * 5;
    }

    // Left hand micro-movement (follows wheel)
    if (this.leftHandGroup && this.isPlaying) {
      this.leftHandGroup.position.y = 0.76 + Math.sin(elapsed * 0.42 + 0.5) * 0.007;
    }

    // Right hand micro-movement (holding phone)
    if (this.rightHandGroup && this.isPlaying) {
      this.rightHandGroup.position.y = 0.70 + Math.sin(elapsed * 0.38 + 1.2) * 0.004;
    }

    // Oncoming car
    this.updateOncomingCar(delta);

    // Crash camera shake
    if (this.crashShake > 0) {
      this.crashShake -= delta * 1.8;
      this.crashShakeTime += delta;
      const amp = Math.max(0, this.crashShake) * 0.045;
      this.camera.position.x = Math.sin(this.crashShakeTime * 32) * amp;
      this.camera.position.y = 1.0 + Math.cos(this.crashShakeTime * 28) * amp * 0.6;
    } else if (this.camera.position.x !== 0) {
      this.camera.position.x += (0 - this.camera.position.x) * delta * 8;
      this.camera.position.y += (1.0 - this.camera.position.y) * delta * 8;
    }
  }

  private updateOncomingCar(delta: number): void {
    // Post-crash: animate car continuing into camera
    if (this.crashCarActive) {
      this.oncomingCarGroup.visible = true;
      this.crashCarZ += 22 * delta;
      this.crashCarX += (0 - this.crashCarX) * 8 * delta;
      this.oncomingCarGroup.position.set(this.crashCarX, 0, this.crashCarZ);
      this.oncomingCarGroup.scale.setScalar(1.0);
      if (this.crashCarZ > 3) {
        this.crashCarActive = false;
        this.oncomingCarGroup.visible = false;
      }
      return;
    }

    if (this.oncomingProgress < 0) {
      this.oncomingCarGroup.visible = false;
      return;
    }

    this.oncomingCarGroup.visible = true;

    // progress 0 = spawned above screen (far away), 1 = at collision (very close)
    // Map to world Z: far = -80, close = -8
    const zFar = -80;
    const zClose = -8;
    const z = zFar + this.oncomingProgress * (zClose - zFar);
    this.oncomingCarGroup.position.z = z;

    // Scale car to feel properly sized at distance (compensation for fog/perspective)
    const scale = 0.5 + this.oncomingProgress * 0.5;
    this.oncomingCarGroup.scale.setScalar(scale);

    // Headlight flicker at close range
    if (this.oncomingProgress > 0.7) {
      const flicker = 0.9 + Math.random() * 0.2;
      (this.oncomingCarGroup.children.find(
        c => c instanceof THREE.Mesh && (c.material as THREE.MeshStandardMaterial).emissiveIntensity > 1,
      ) as THREE.Mesh | undefined)?.scale.setScalar(flicker);
    }
  }
}
