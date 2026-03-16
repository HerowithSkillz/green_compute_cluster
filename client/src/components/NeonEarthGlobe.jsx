import React, { useEffect, useMemo, useState } from 'react';
import HolographicGlobe from './HolographicGlobe.jsx';

/**
 * NeonEarthGlobe
 * Uses a static hero image (placed in `client/public`) and adds starfield + glow + rotation.
 * If the image is missing, falls back to the SVG-based HolographicGlobe.
 */
export default function NeonEarthGlobe({
  isComputing,
  connectedReceivers = 0,
  size = 320,
  src = '/donor-globe.png',
  tint = 'green', // 'green' | 'blue' | 'none'
}) {
  const [imgOk, setImgOk] = useState(true);

  useEffect(() => {
    setImgOk(true);
  }, [src]);

  const filter = useMemo(() => {
    if (tint === 'none') return 'none';
    if (tint === 'blue') return 'saturate(1.15) contrast(1.05) brightness(1.05)';
    // turn the provided blue-ish earth into green-ish neon
    return 'hue-rotate(110deg) saturate(1.25) contrast(1.06) brightness(1.08)';
  }, [tint]);

  if (!imgOk) {
    return <HolographicGlobe isComputing={isComputing} connectedReceivers={connectedReceivers} size={Math.min(size, 260)} />;
  }

  return (
    <div
      className={`neon-globe ${isComputing ? 'neon-globe-on' : 'neon-globe-off'}`}
      style={{ ['--neon-size']: `${size}px` }}
      aria-label="Neon globe visualization"
    >
      <div className="neon-stars" aria-hidden="true" />
      <div className="neon-glow" aria-hidden="true" />
      <img
        className="neon-globe-img"
        src={src}
        alt=""
        draggable="false"
        onError={() => setImgOk(false)}
        style={{ filter }}
      />

      <div className="neon-globe-status">
        <span className={`neon-status-dot ${isComputing ? 'on' : 'off'}`} />
        <span className="neon-status-text">{isComputing ? 'Computing…' : 'Idle'}</span>
        {connectedReceivers > 0 && (
          <span className="neon-status-meta">
            {connectedReceivers} receiver{connectedReceivers > 1 ? 's' : ''} connected
          </span>
        )}
      </div>
    </div>
  );
}

