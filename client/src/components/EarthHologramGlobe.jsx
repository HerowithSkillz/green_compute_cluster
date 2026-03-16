import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';

export default function EarthHologramGlobe({
  isComputing,
  connectedReceivers = 0,
  size = 260,
}) {
  const mountRef = useRef(null);
  const isComputingRef = useRef(isComputing);

  useEffect(() => {
    isComputingRef.current = isComputing;
  }, [isComputing]);

  useEffect(() => {
    const host = mountRef.current;
    if (!host) return;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 1000);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setClearColor(0x000000, 0);
    renderer.setSize(size, size);
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    host.appendChild(renderer.domElement);

    const globeGroup = new THREE.Group();
    scene.add(globeGroup);

    const fillGeo = new THREE.SphereGeometry(4.95, 64, 64);
    const fillMat = new THREE.MeshBasicMaterial({
      color: 0x78ffb0,
      transparent: true,
      opacity: 0.018,
    });
    const fillSphere = new THREE.Mesh(fillGeo, fillMat);
    globeGroup.add(fillSphere);

    const loader = new THREE.TextureLoader();
    const maskUrl =
      'https://raw.githubusercontent.com/mrdoob/three.js/master/examples/textures/planets/earth_atmos_2048.jpg';

    let dotGeo = null;
    let dotMat = null;
    let earthPoints = null;

    loader.load(maskUrl, (texture) => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      canvas.width = 1024;
      canvas.height = 512;
      ctx.drawImage(texture.image, 0, 0, 1024, 512);
      const imgData = ctx.getImageData(0, 0, 1024, 512).data;

      const positions = [];
      const radius = 5;
      const totalPoints = 50000;

      for (let i = 0; i < totalPoints; i++) {
        const phi = Math.acos(-1 + (2 * i) / totalPoints);
        const theta = Math.sqrt(totalPoints * Math.PI) * phi;

        const x = radius * Math.cos(theta) * Math.sin(phi);
        const y = radius * Math.sin(theta) * Math.sin(phi);
        const z = radius * Math.cos(phi);

        const u = 1 - (Math.atan2(x, z) / (2 * Math.PI) + 0.5);
        const v = 0.5 - Math.asin(y / radius) / Math.PI;

        const tx = Math.floor(u * 1024);
        const ty = Math.floor(v * 512);
        const pixelIndex = (ty * 1024 + tx) * 4;

        if (imgData[pixelIndex] > 40) positions.push(x, y, z);
      }

      dotGeo = new THREE.BufferGeometry();
      dotGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));

      dotMat = new THREE.PointsMaterial({
        size: 0.041,
        color: 0x00ff66,
        transparent: true,
        opacity: 1.0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        depthTest: false,
      });

      earthPoints = new THREE.Points(dotGeo, dotMat);
      globeGroup.add(earthPoints);
      texture.dispose();
    });

    camera.position.z = 15;

    const prefersReducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false;
    let rafId = 0;
    const baseSpeed = 0.0018;

    const animate = () => {
      if (!prefersReducedMotion) {
        globeGroup.rotation.y += isComputingRef.current ? baseSpeed * 3 : baseSpeed;
      }
      renderer.render(scene, camera);
      rafId = requestAnimationFrame(animate);
    };

    rafId = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(rafId);
      if (host.contains(renderer.domElement)) host.removeChild(renderer.domElement);
      if (earthPoints) globeGroup.remove(earthPoints);
      if (dotGeo) dotGeo.dispose();
      if (dotMat) dotMat.dispose();
      fillGeo.dispose();
      fillMat.dispose();
      renderer.dispose();
    };
  }, [size]);

  return (
    <div className="earth-holo-container" style={{ ['--earth-size']: `${size}px` }}>
      <div className="earth-holo-glow" aria-hidden="true" />
      <div className="earth-holo-shell" aria-hidden="true">
        <div ref={mountRef} className="earth-holo-canvas" />
      </div>
      <div className="earth-holo-base" aria-hidden="true" />

      <div className="globe-status">
        <span className={`globe-status-dot ${isComputing ? 'computing' : 'idle'}`} />
        <span className="globe-status-text">{isComputing ? 'Computing...' : 'Idle'}</span>
      </div>
      {connectedReceivers > 0 && (
        <div className="globe-receivers">
          {connectedReceivers} receiver{connectedReceivers > 1 ? 's' : ''} connected
        </div>
      )}
    </div>
  );
}
