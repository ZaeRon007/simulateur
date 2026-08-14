import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

/**
 * Loads the Ferrari GLTF model and builds the right-lane queue of clone cars.
 * Adds both groups to the scene, then calls onLoaded with their references.
 */
export function initFerrari(
  scene: THREE.Scene,
  onLoaded: (ferrariGroup: THREE.Group, queueCarGroup: THREE.Group) => void,
): void {
  const draco = new DRACOLoader();
  draco.setDecoderPath('/draco/');

  const loader = new GLTFLoader();
  loader.setDRACOLoader(draco);
  loader.load(
    '/models/ferrari.glb',
    (gltf: GLTF) => {
      const setupCar = (car: THREE.Object3D) => {
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
      };

      const box = new THREE.Box3().setFromObject(gltf.scene);
      const yOffset = -box.min.y;

      // Player car
      const playerCar = gltf.scene;
      playerCar.position.set(0.35, yOffset, 0);
      setupCar(playerCar);
      scene.add(playerCar);

      // Right-lane queue (clones)
      const N = 6;
      const SPACING = 15;
      const LANE_X = 4.5;

      const brakeLightMat = new THREE.MeshStandardMaterial({
        color: 0xff2020,
        emissive: 0xff0000,
        emissiveIntensity: 2.5,
        roughness: 0.3,
      });

      const group = new THREE.Group();
      for (let i = 0; i < N; i++) {
        const car = gltf.scene.clone(true);
        car.position.set(LANE_X, yOffset, -(i + 1) * SPACING);
        setupCar(car);
        for (const lx of [-0.8, 0.74]) {
          const tl = new THREE.Mesh(new THREE.CircleGeometry(0.06, 12), brakeLightMat);
          tl.position.set(lx, 0.87, 2.07);
          car.add(tl);
        }
        group.add(car);
      }
      scene.add(group);

      onLoaded(playerCar, group);
    },
    undefined,
    (error: unknown) => {
      console.warn('[Road] Ferrari model not loaded — scene continues without it.', error);
    },
  );
}
