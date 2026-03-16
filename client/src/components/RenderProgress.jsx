import React from 'react';

/**
 * RenderProgress — Per-node frame progress visualization
 *
 * Displays progress bars for each worker node
 */
function RenderProgress({ workers, jobStatus, totalFrames }) {
  if (!workers || workers.length === 0) {
    return <div className="render-progress-empty">No worker nodes connected</div>;
  }

  return (
    <div className="render-progress">
      {workers.map((worker) => {
        const workerProgress = jobStatus.progress.get(worker.peerId) || 0;
        const progressPct = Math.round(workerProgress * 100);

        return (
          <div key={worker.peerId} className="progress-item">
            <div className="progress-header">
              <span className="worker-name">
                {worker.username || worker.peerId.slice(0, 8)}
              </span>
              <span className="progress-pct">{progressPct}%</span>
            </div>
            <div className="progress-bar-container">
              <div
                className="progress-bar-fill"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default RenderProgress;
