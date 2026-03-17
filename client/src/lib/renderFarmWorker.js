import * as THREE from 'three';

const DEFAULT_WIDTH = 960;
const DEFAULT_HEIGHT = 540;

function buildFallbackScene() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0a0f1d);

  const keyLight = new THREE.DirectionalLight(0xffffff, 1.0);
  keyLight.position.set(3, 4, 2);
  scene.add(keyLight);

  const fillLight = new THREE.AmbientLight(0x6688aa, 0.45);
  scene.add(fillLight);

  const mesh = new THREE.Mesh(
    new THREE.TorusKnotGeometry(0.7, 0.24, 160, 24),
    new THREE.MeshStandardMaterial({
      color: 0x41e7a8,
      metalness: 0.25,
      roughness: 0.35,
    })
  );
  mesh.name = 'fallback-mesh';
  scene.add(mesh);

  return scene;
}

function buildDefaultCamera(width, height) {
  const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
  camera.position.set(0, 1.2, 4.2);
  camera.lookAt(0, 0, 0);
  return camera;
}

function extractCameraFromScene(scene) {
  let foundCamera = null;
  scene.traverse((node) => {
    if (!foundCamera && node.isCamera) foundCamera = node;
  });
  return foundCamera;
}

function parseScene(sceneJSON) {
  if (!sceneJSON || !sceneJSON.trim()) {
    return buildFallbackScene();
  }

  const raw = JSON.parse(sceneJSON);
  const loader = new THREE.ObjectLoader();

  // Supports both ObjectExporter format ({ object, materials, textures, ... })
  // and direct object trees ({ type: 'Scene', children: [...] }).
  if (raw.object) {
    return loader.parse(raw);
  }

  return loader.parse({
    metadata: { version: 4.6, type: 'Object' },
    object: raw,
  });
}

function animateScene(scene, elapsedSeconds) {
  scene.traverse((node) => {
    if (!node.isMesh) return;
    node.rotation.y += 0.015;
    node.rotation.x = Math.sin(elapsedSeconds * 0.8) * 0.2;
  });
}

function disposeScene(scene) {
  scene.traverse((node) => {
    if (node.geometry?.dispose) node.geometry.dispose();
    if (node.material) {
      if (Array.isArray(node.material)) {
        node.material.forEach((m) => m?.dispose?.());
      } else {
        node.material.dispose?.();
      }
    }
  });
}

/**
 * Render a frame range using Three.js and stream frame payloads via callbacks.
 */
export async function renderFrameRange({
  sceneJSON,
  startFrame,
  endFrame,
  fps,
  width = DEFAULT_WIDTH,
  height = DEFAULT_HEIGHT,
  mimeType = 'image/webp',
  quality = 0.86,
  onFrame,
  onProgress,
}) {
  if (typeof onFrame !== 'function') {
    throw new Error('onFrame callback is required');
  }

  const frameCount = Math.max(0, endFrame - startFrame + 1);
  if (frameCount === 0) return;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false,
    preserveDrawingBuffer: true,
    powerPreference: 'high-performance',
  });
  renderer.setSize(width, height, false);
  renderer.setPixelRatio(1);

  let scene = null;
  try {
    scene = parseScene(sceneJSON);
  } catch {
    scene = buildFallbackScene();
  }

  const camera = extractCameraFromScene(scene) || buildDefaultCamera(width, height);

  if (!extractCameraFromScene(scene)) {
    scene.add(camera);
  }

  for (let frameIndex = startFrame; frameIndex <= endFrame; frameIndex++) {
    const elapsedSeconds = (frameIndex - startFrame) / Math.max(1, fps);
    animateScene(scene, elapsedSeconds);
    renderer.render(scene, camera);

    const dataUrl = canvas.toDataURL(mimeType, quality);
    await onFrame({ frameIndex, dataUrl });

    if (typeof onProgress === 'function') {
      const progress = (frameIndex - startFrame + 1) / frameCount;
      onProgress(progress);
    }

    // Yield occasionally to keep UI responsive while donor is rendering.
    if ((frameIndex - startFrame) % 8 === 0) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }

  disposeScene(scene);
  renderer.dispose();
}
