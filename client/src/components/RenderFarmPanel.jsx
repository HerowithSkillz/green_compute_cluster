import React, { useState, useCallback, useRef } from 'react';
import RenderProgress from './RenderProgress.jsx';
import { downloadFramesAsZip, exportFramesToWebM, isWebCodecsExportSupported } from '../lib/renderOutput.js';
import '../styles/render-farm.css';

/**
 * RenderFarmPanel — UI for submitting render jobs and monitoring progress
 *
 * Features:
 * - Scene JSON upload (or paste)
 * - Frame count & FPS configuration
 * - Render submission
 * - Progress tracking per worker
 * - Frame/video download
 */
function RenderFarmPanel({
  onSubmitRenderJob,
  renderLog,
  isRenderingActive,
  getRenderJobStatus,
  workers,
  latestOutput,
}) {
  const [sceneJson, setSceneJson] = useState('');
  const [totalFrames, setTotalFrames] = useState(300);
  const [fps, setFps] = useState(30);
  const [isLoading, setIsLoading] = useState(false);
  const [isZipExporting, setIsZipExporting] = useState(false);
  const [isWebmExporting, setIsWebmExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [lastJobId, setLastJobId] = useState(null);
  const fileInputRef = useRef(null);
  const webmSupported = isWebCodecsExportSupported();

  const handleSceneFileUpload = useCallback((e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const json = JSON.parse(ev.target?.result);
        setSceneJson(JSON.stringify(json, null, 2));
      } catch (err) {
        alert(`Failed to parse scene file: ${err.message}`);
      }
    };
    reader.readAsText(file);
  }, []);

  const handleSceneJsonChange = useCallback((e) => {
    setSceneJson(e.target.value);
  }, []);

  const handleSubmitRender = useCallback(async () => {
    if (!sceneJson.trim()) {
      alert('Please provide a scene JSON');
      return;
    }

    if (totalFrames < 1 || fps < 1) {
      alert('Frames and FPS must be greater than 0');
      return;
    }

    try {
      JSON.parse(sceneJson); // Validate JSON
    } catch (err) {
      alert(`Invalid scene JSON: ${err.message}`);
      return;
    }

    if (workers.length === 0) {
      alert('No worker nodes available. Please wait for GPU donors to join.');
      return;
    }

    setIsLoading(true);
    const jobId = crypto.randomUUID();
    setLastJobId(jobId);

    try {
      await onSubmitRenderJob(sceneJson, totalFrames, fps, jobId);
    } catch (err) {
      alert(`Render job failed: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  }, [sceneJson, totalFrames, fps, workers.length, onSubmitRenderJob]);

  const jobStatus = lastJobId ? getRenderJobStatus(lastJobId) : null;
  const previewFrames = latestOutput?.frames?.slice(0, 8) || [];

  const handleDownloadZip = useCallback(async () => {
    if (!latestOutput?.frames?.length) return;
    setIsZipExporting(true);
    setExportProgress(0);
    try {
      await downloadFramesAsZip(latestOutput, setExportProgress);
    } catch (err) {
      alert(`ZIP export failed: ${err.message}`);
    } finally {
      setIsZipExporting(false);
      setExportProgress(0);
    }
  }, [latestOutput]);

  const handleExportWebM = useCallback(async () => {
    if (!latestOutput?.frames?.length) return;
    setIsWebmExporting(true);
    setExportProgress(0);
    try {
      await exportFramesToWebM(latestOutput, setExportProgress);
    } catch (err) {
      alert(`WebM export failed: ${err.message}`);
    } finally {
      setIsWebmExporting(false);
      setExportProgress(0);
    }
  }, [latestOutput]);

  return (
    <div className="render-farm-panel">
      <h2>🎬 Distributed Render Farm</h2>
      <p className="render-info">
        Distribute frame rendering across {workers.length} GPU worker node{workers.length !== 1 ? 's' : ''}.
        Upload or paste your Three.js scene JSON to get started.
      </p>

      <div className="render-controls">
        <div className="control-group">
          <label htmlFor="scene-file">Scene File (JSON)</label>
          <div className="file-input-wrapper">
            <input
              ref={fileInputRef}
              type="file"
              id="scene-file"
              accept=".json"
              onChange={handleSceneFileUpload}
              style={{ display: 'none' }}
            />
            <button
              className="btn-upload"
              onClick={() => fileInputRef.current?.click()}
              disabled={isLoading}
            >
              📁 Upload Scene
            </button>
          </div>
        </div>

        <div className="control-group">
          <label htmlFor="scene-json">Scene JSON (Paste or Upload)</label>
          <textarea
            id="scene-json"
            value={sceneJson}
            onChange={handleSceneJsonChange}
            placeholder={'{\n  "type": "Scene",\n  "children": [...]\n}'}
            rows={8}
            disabled={isLoading}
          />
        </div>

        <div className="control-row">
          <div className="control-group">
            <label htmlFor="total-frames">Total Frames</label>
            <input
              id="total-frames"
              type="number"
              min="1"
              max="10000"
              value={totalFrames}
              onChange={(e) => setTotalFrames(parseInt(e.target.value) || 1)}
              disabled={isLoading}
            />
          </div>

          <div className="control-group">
            <label htmlFor="fps">FPS</label>
            <input
              id="fps"
              type="number"
              min="1"
              max="120"
              value={fps}
              onChange={(e) => setFps(parseInt(e.target.value) || 1)}
              disabled={isLoading}
            />
          </div>

          <div className="control-group">
            <label>&nbsp;</label>
            <button
              className="btn-submit-render"
              onClick={handleSubmitRender}
              disabled={isLoading || workers.length === 0}
            >
              {isLoading ? 'Rendering...' : '▶ Start Render'}
            </button>
          </div>
        </div>
      </div>

      {jobStatus && (
        <div className="render-status">
          <h3>Render Progress</h3>
          <div className="job-stats">
            <span className="stat">
              Frames Collected: <strong>{jobStatus.frameCount} / {totalFrames}</strong>
            </span>
            <span className="stat">
              Progress: <strong>{Math.round((jobStatus.frameCount / totalFrames) * 100)}%</strong>
            </span>
          </div>
          <RenderProgress
            workers={workers}
            jobStatus={jobStatus}
            totalFrames={totalFrames}
          />
        </div>
      )}

      {renderLog.length > 0 && (
        <div className="render-log">
          <h3>Render Activity Log</h3>
          <div className="log-container">
            {renderLog.slice(-20).map((entry, idx) => (
              <div key={idx} className={`log-entry log-${entry.level}`}>
                <span className="log-time">{entry.timestamp}</span>
                <span className="log-level">[{entry.level.toUpperCase()}]</span>
                <span className="log-message">{entry.message}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="render-output">
        <h3>Rendered Output</h3>
        {!latestOutput ? (
          <p className="output-empty">No completed render output yet. Finish a render job to preview and export.</p>
        ) : (
          <>
            <div className="output-meta">
              <span>Job: <strong>{latestOutput.jobId.slice(0, 8)}</strong></span>
              <span>Frames: <strong>{latestOutput.frameCount}</strong></span>
              <span>FPS: <strong>{latestOutput.fps}</strong></span>
            </div>

            <div className="output-actions">
              <button
                className="btn-output"
                onClick={handleDownloadZip}
                disabled={isZipExporting || isWebmExporting || isRenderingActive}
              >
                {isZipExporting ? 'Preparing ZIP...' : 'Download Frames (.zip)'}
              </button>
              <button
                className="btn-output"
                onClick={handleExportWebM}
                disabled={!webmSupported || isZipExporting || isWebmExporting || isRenderingActive}
                title={!webmSupported ? 'WebCodecs is not available in this browser' : ''}
              >
                {isWebmExporting ? 'Encoding WebM...' : 'Export Video (.webm)'}
              </button>
            </div>

            {(isZipExporting || isWebmExporting) && (
              <div className="export-progress">Export progress: {Math.round(exportProgress * 100)}%</div>
            )}

            <div className="frame-preview-grid">
              {previewFrames.map((frame) => (
                <button
                  key={frame.frameIndex}
                  className="frame-preview-item"
                  onClick={() => window.open(frame.dataUrl, '_blank', 'noopener,noreferrer')}
                  title={`Open frame ${frame.frameIndex}`}
                >
                  <img src={frame.dataUrl} alt={`Frame ${frame.frameIndex}`} loading="lazy" />
                  <span>Frame {frame.frameIndex}</span>
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default RenderFarmPanel;
