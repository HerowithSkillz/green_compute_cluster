import React from 'react';

export default function NodeCard({ peer, channelStatus, rtt }) {
  const status = channelStatus || 'closed';
  const statusColor = status === 'open' ? '#00ff88' : status === 'connecting' ? '#ffaa00' : '#ff4444';

  return (
    <div className="node-card">
      <div className="node-card-header">
        <span className="node-id" title={peer.peerId}>{peer.peerId.slice(0, 8)}...</span>
        <span className="node-status" style={{ color: statusColor }}>
          {status === 'open' ? '● Online' : status === 'connecting' ? '◐ Connecting' : '○ Offline'}
        </span>
      </div>
      <div className="node-card-body">
        <div className="node-stat">
          <span className="stat-label">GPU</span>
          <span className="stat-value">{peer.gpuCapable ? 'WebGPU ✓' : 'CPU only'}</span>
        </div>
        <div className="node-stat">
          <span className="stat-label">RTT</span>
          <span className="stat-value">{rtt != null ? `${rtt}ms` : '—'}</span>
        </div>
        <div className="node-stat">
          <span className="stat-label">Channel</span>
          <span className="stat-value" style={{ color: statusColor }}>{status}</span>
        </div>
      </div>
    </div>
  );
}
