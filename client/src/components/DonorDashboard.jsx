import React, { useMemo } from 'react';
import EarthHologramGlobe from './EarthHologramGlobe.jsx';

function formatAgo(ts) {
  if (!ts) return '—';
  const deltaSec = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (deltaSec < 60) return `${deltaSec}s ago`;
  const deltaMin = Math.floor(deltaSec / 60);
  if (deltaMin < 60) return `${deltaMin}m ago`;
  const deltaHr = Math.floor(deltaMin / 60);
  return `${deltaHr}h ago`;
}

function PeerPill({ id, username, role, status }) {
  const label = (username || '').trim() || id.slice(0, 8);
  return (
    <div className={`peer-pill peer-pill-${status || 'closed'}`}>
      <div className="peer-pill-head">
        <span className="peer-pill-icon" aria-hidden="true">🖥️</span>
        <div className="peer-pill-id" title={id}>{label}</div>
      </div>
      <div className={`peer-pill-role peer-pill-role-${role || 'unknown'}`}>
        {role === 'donor' ? 'Donor' : role === 'receiver' ? 'Receiver' : '?'}
      </div>
    </div>
  );
}

export default function DonorDashboard({
  myPeerId,
  myUsername,
  roomId,
  connectionStatus,
  peers,
  channelStatus,
  rttMap,
  openChannelCount,
  modelStatus,
  loadProgress,
  isComputing,
  servedCount,
  lastServedAt,
}) {
  const peerStats = useMemo(() => {
    const allPeers = [
      { peerId: myPeerId, role: 'donor', username: myUsername, joinedAt: Date.now(), gpuCapable: true, self: true },
      ...(peers || []),
    ];

    const donors = allPeers.filter((p) => p.role === 'donor');
    const receivers = allPeers.filter((p) => p.role === 'receiver');

    const connectedReceivers = receivers.filter((p) => channelStatus.get(p.peerId) === 'open').length;
    const connectedDonors = donors.filter((p) => p.self || channelStatus.get(p.peerId) === 'open').length;

    const avgRtt = (() => {
      const values = [...(rttMap?.values() ?? [])].filter((v) => typeof v === 'number');
      if (values.length === 0) return null;
      return Math.round(values.reduce((a, b) => a + b, 0) / values.length);
    })();

    return {
      allPeers,
      donors,
      receivers,
      connectedReceivers,
      connectedDonors,
      avgRtt,
    };
  }, [myPeerId, peers, channelStatus, rttMap]);

  const activityPct = isComputing ? 92 : openChannelCount > 0 ? 24 : 6;

  return (
    <div className="donor-dashboard">
      <div className="donor-grid">
        <section className="panel panel-metrics">
          <div className="panel-header">
            <h2>Live Performance</h2>
            <span className={`status-pill status-${connectionStatus}`}>Signal: {connectionStatus}</span>
          </div>

          <div className="metric-row">
            <div className="metric">
              <div className="metric-label">Room</div>
              <div className="metric-value">{roomId || '—'}</div>
            </div>
            <div className="metric">
              <div className="metric-label">Channels</div>
              <div className="metric-value">{openChannelCount}</div>
            </div>
          </div>

          <div className="metric-row">
            <div className="metric">
              <div className="metric-label">Receivers</div>
              <div className="metric-value">
                {peerStats.connectedReceivers}/{peerStats.receivers.length}
              </div>
            </div>
            <div className="metric">
              <div className="metric-label">Donors</div>
              <div className="metric-value">
                {peerStats.connectedDonors}/{peerStats.donors.length}
              </div>
            </div>
          </div>

          <div className="metric-row">
            <div className="metric">
              <div className="metric-label">Avg RTT</div>
              <div className="metric-value">{peerStats.avgRtt != null ? `${peerStats.avgRtt}ms` : '—'}</div>
            </div>
            <div className="metric">
              <div className="metric-label">Requests Served</div>
              <div className="metric-value">{servedCount}</div>
            </div>
          </div>

          <div className="meter">
            <div className="meter-ring" style={{ ['--pct']: `${activityPct}%` }}>
              <div className="meter-center">
                <div className="meter-value">{activityPct}%</div>
                <div className="meter-label">Compute Activity</div>
              </div>
            </div>
            <div className="meter-sub">
              <div className="meter-sub-item">
                <span className="meter-sub-k">State</span>
                <span className={`meter-sub-v ${isComputing ? 'ok' : ''}`}>{isComputing ? 'Serving' : 'Idle'}</span>
              </div>
              <div className="meter-sub-item">
                <span className="meter-sub-k">Last Served</span>
                <span className="meter-sub-v">{formatAgo(lastServedAt)}</span>
              </div>
            </div>
          </div>

          <div className="model-card">
            <div className="model-card-title">Model</div>
            {modelStatus === 'not loaded' && (
              <div className="model-card-body">
                <span className="model-badge warn">Not loaded</span>
                <span className="model-hint">Load the model to start serving receivers.</span>
              </div>
            )}
            {modelStatus === 'loading' && (
              <div className="model-card-body">
                <span className="model-badge loading">Loading</span>
                <span className="model-hint">
                  {loadProgress ? `${(loadProgress.progress * 100).toFixed(0)}% — ${loadProgress.text}` : 'Starting...'}
                </span>
              </div>
            )}
            {modelStatus === 'ready' && (
              <div className="model-card-body">
                <span className="model-badge ok">Ready</span>
                <span className="model-hint">This node is ready to serve inference.</span>
              </div>
            )}
          </div>

          <div className="donor-note">
            Donor nodes don’t enter prompts. Keep this tab open to share GPU compute.
          </div>
        </section>

        <section className="panel panel-globe">
          <div className="panel-header">
            <h2>Global Green Mesh</h2>
            <span className={`compute-pill ${isComputing ? 'compute-on' : 'compute-off'}`}>
              {isComputing ? 'Computing' : 'Idle'}
            </span>
          </div>
          <div className="globe-stage">
            <EarthHologramGlobe
              size={360}
              isComputing={isComputing}
              connectedReceivers={peers.filter((p) => p.role === 'receiver').length}
            />
          </div>
          <div className="globe-footer">
            <div className="globe-footer-row">
              <span className="globe-footer-k">Donor Node</span>
              <span className="globe-footer-v" title={myPeerId}>{(myUsername || '').trim() || myPeerId.slice(0, 12)}</span>
            </div>
            <div className="globe-footer-row">
              <span className="globe-footer-k">Sustainability</span>
              <span className="globe-footer-v">Share compute, reduce waste</span>
            </div>
          </div>
        </section>

        <section className="panel panel-network">
          <div className="panel-header">
            <h2>Network Diagram</h2>
            <span className="panel-subtitle">{peerStats.allPeers.length} node(s)</span>
          </div>

          <div className="network-section">
            <div className="network-title">Connected Receivers</div>
            <div className="pill-grid">
              {peerStats.receivers.filter((p) => channelStatus.get(p.peerId) === 'open').length === 0 ? (
                <div className="empty">No receivers connected yet.</div>
              ) : (
                peerStats.receivers
                  .filter((p) => channelStatus.get(p.peerId) === 'open')
                  .map((p) => (
                    <PeerPill
                      key={p.peerId}
                      id={p.peerId}
                      username={p.username}
                      role={p.role}
                      status={channelStatus.get(p.peerId)}
                    />
                  ))
              )}
            </div>
          </div>

          <div className="network-section">
            <div className="network-title">Donors</div>
            <div className="pill-grid">
              {peerStats.donors.map((p) => (
                <PeerPill
                  key={p.peerId}
                  id={p.peerId}
                  username={p.username}
                  role="donor"
                  status={p.self ? 'open' : channelStatus.get(p.peerId)}
                />
              ))}
            </div>
          </div>
        </section>
      </div>

    </div>
  );
}
