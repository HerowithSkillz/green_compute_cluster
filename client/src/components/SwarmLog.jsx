import React from 'react';

export default function SwarmLog({ logs }) {
  return (
    <div className="swarm-log">
      <div className="swarm-log-header">
        <h3>Swarm Activity</h3>
      </div>
      <div className="swarm-log-entries">
        {logs.length === 0 ? (
          <div className="log-empty">No swarm activity yet.</div>
        ) : (
          logs.map((entry, i) => (
            <div key={i} className={`log-entry log-${entry.level || 'info'}`}>
              <span className="log-time">
                {new Date(entry.ts).toLocaleTimeString()}
              </span>
              <span className="log-message">{entry.message}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
