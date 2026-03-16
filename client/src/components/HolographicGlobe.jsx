import React from 'react';

/**
 * HolographicGlobe — Animated wireframe globe with holographic effect.
 * Rotation speed scales with compute activity (isComputing prop).
 */
export default function HolographicGlobe({ isComputing, connectedReceivers = 0 }) {
  const spinDuration = isComputing ? '3s' : '12s';

  return (
    <div className="globe-container">
      <div className="globe-glow" />
      <div className="globe-wrapper" style={{ animationDuration: spinDuration }}>
        <svg viewBox="0 0 200 200" className="globe-svg" xmlns="http://www.w3.org/2000/svg">
          {/* Outer circle */}
          <circle cx="100" cy="100" r="90" className="globe-ring" />

          {/* Horizontal latitude lines */}
          <ellipse cx="100" cy="100" rx="90" ry="20" className="globe-line" />
          <ellipse cx="100" cy="100" rx="90" ry="45" className="globe-line" />
          <ellipse cx="100" cy="100" rx="90" ry="70" className="globe-line" />

          {/* Vertical longitude lines */}
          <ellipse cx="100" cy="100" rx="20" ry="90" className="globe-line" />
          <ellipse cx="100" cy="100" rx="45" ry="90" className="globe-line" />
          <ellipse cx="100" cy="100" rx="70" ry="90" className="globe-line" />

          {/* Tilted orbit rings */}
          <ellipse cx="100" cy="100" rx="90" ry="35" className="globe-orbit" transform="rotate(30 100 100)" />
          <ellipse cx="100" cy="100" rx="90" ry="35" className="globe-orbit" transform="rotate(-30 100 100)" />

          {/* Node dots on the globe */}
          <circle cx="100" cy="12" r="4" className="globe-node" />
          <circle cx="55" cy="45" r="3" className="globe-node" />
          <circle cx="150" cy="60" r="3.5" className="globe-node" />
          <circle cx="70" cy="140" r="3" className="globe-node" />
          <circle cx="140" cy="150" r="3.5" className="globe-node" />
          <circle cx="100" cy="188" r="4" className="globe-node" />

          {/* Connection lines between nodes */}
          <line x1="100" y1="12" x2="55" y2="45" className="globe-connection" />
          <line x1="55" y1="45" x2="150" y2="60" className="globe-connection" />
          <line x1="150" y1="60" x2="140" y2="150" className="globe-connection" />
          <line x1="140" y1="150" x2="100" y2="188" className="globe-connection" />
          <line x1="100" y1="188" x2="70" y2="140" className="globe-connection" />
          <line x1="70" y1="140" x2="55" y2="45" className="globe-connection" />
          <line x1="100" y1="12" x2="140" y2="150" className="globe-connection" />
        </svg>
      </div>

      <div className="globe-status">
        <span className={`globe-status-dot ${isComputing ? 'computing' : 'idle'}`} />
        <span className="globe-status-text">
          {isComputing ? 'Computing...' : 'Idle'}
        </span>
      </div>
      {connectedReceivers > 0 && (
        <div className="globe-receivers">
          {connectedReceivers} receiver{connectedReceivers > 1 ? 's' : ''} connected
        </div>
      )}
    </div>
  );
}
