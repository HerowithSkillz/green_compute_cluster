import React from 'react';
import NodeCard from './NodeCard.jsx';

export default function ClusterDashboard({ peers, channelStatus, rttMap, connectionStatus, roomId, openChannelCount, myRole }) {
  return (
    <div className="cluster-dashboard">
      <div className="dashboard-header">
        <h2>Cluster Dashboard</h2>
        <div className="dashboard-stats">
          <div className="stat-chip">
            <span className="stat-chip-label">Signal</span>
            <span className={`stat-chip-value status-${connectionStatus}`}>
              {connectionStatus}
            </span>
          </div>
          <div className="stat-chip">
            <span className="stat-chip-label">Room</span>
            <span className="stat-chip-value">{roomId || '—'}</span>
          </div>
          <div className="stat-chip">
            <span className="stat-chip-label">Peers</span>
            <span className="stat-chip-value">{peers.length}</span>
          </div>
          <div className="stat-chip">
            <span className="stat-chip-label">Channels</span>
            <span className="stat-chip-value">{openChannelCount}</span>
          </div>
          <div className="stat-chip">
            <span className="stat-chip-label">Donors</span>
            <span className="stat-chip-value">{peers.filter(p => p.role === 'donor').length + (myRole === 'donor' ? 1 : 0)}</span>
          </div>
          <div className="stat-chip">
            <span className="stat-chip-label">Receivers</span>
            <span className="stat-chip-value">{peers.filter(p => p.role === 'receiver').length + (myRole === 'receiver' ? 1 : 0)}</span>
          </div>
        </div>
      </div>

      <div className="peer-grid">
        {peers.length === 0 ? (
          <div className="no-peers">
            No peers connected. Share the room link to invite others.
          </div>
        ) : (
          peers.map((peer) => (
            <NodeCard
              key={peer.peerId}
              peer={peer}
              channelStatus={channelStatus.get(peer.peerId)}
              rtt={rttMap.get(peer.peerId)}
            />
          ))
        )}
      </div>
    </div>
  );
}
