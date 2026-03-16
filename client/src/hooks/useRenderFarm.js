import { useState, useCallback, useRef } from 'react';
import { MSG, encodeMessage } from '../lib/protocol.js';
import { RENDER_TIMEOUT_MS } from '../lib/constants.js';

const MAX_COMPLETED_JOBS = 3;

/**
 * useRenderFarm — Orchestrator + Worker logic for distributed video rendering
 *
 * Orchestrator side (receiver):
 *   - submitRenderJob: distribute frame ranges to worker nodes
 *   - collectFrames: gather rendered frame blobs back from workers
 *
 * Worker side (donor):
 *   - handleRenderJob: receive frame range + scene, render locally, stream back
 */
export function useRenderFarm(myPeerId, donorPeers, sendToPeer, broadcastToPeers) {
  const [renderJobs, setRenderJobs] = useState([]);       // reserved for queue visualization
  const [renderLog, setRenderLog] = useState([]);         // event log
  const [renderedFrameCount, setRenderedFrameCount] = useState({}); // { jobId: count }
  const [isRenderingActive, setIsRenderingActive] = useState(false);
  const [latestOutput, setLatestOutput] = useState(null);
  const [completedJobs, setCompletedJobs] = useState([]);

  // Track pending renders and collect frames
  const pendingRenderRef = useRef(new Map()); // jobId -> { resolve, reject, timeout, expectedWorkers, completedWorkers }
  const frameCollectorRef = useRef(new Map()); // jobId -> Map(frameIndex -> blob)
  const workerProgressRef = useRef(new Map()); // jobId -> Map(workerId -> progress)
  const jobMetaRef = useRef(new Map()); // jobId -> { fps, totalFrames, expectedWorkers }

  // Log rendering events
  const addLog = useCallback((event) => {
    setRenderLog(prev => [
      ...prev,
      {
        timestamp: new Date().toLocaleTimeString(),
        ...event,
      }
    ]);
  }, []);

  /**
   * Split frame range across available workers
   */
  const splitFrames = useCallback((totalFrames, workerCount) => {
    if (workerCount === 0) return [];
    const framesPerWorker = Math.ceil(totalFrames / workerCount);
    const ranges = [];
    for (let i = 0; i < workerCount; i++) {
      const start = i * framesPerWorker;
      const end = Math.min(start + framesPerWorker - 1, totalFrames - 1);
      if (start <= end) {
        ranges.push({ start, end, workerId: i });
      }
    }
    return ranges;
  }, []);

  /**
   * Submit a render job to worker nodes (Orchestrator side)
   *
   * @param {string} sceneJSON - Serialized Three.js scene
   * @param {number} totalFrames - Total frames to render
   * @param {number} fps - Frames per second
   * @param {string} jobId - UUID for this job
   */
  const submitRenderJob = useCallback(async (sceneJSON, totalFrames, fps, jobId) => {
    if (donorPeers.length === 0) {
      addLog({ level: 'error', message: 'No worker nodes available' });
      return null;
    }

    try {
      const frameRanges = splitFrames(totalFrames, donorPeers.length);
      frameCollectorRef.current.set(jobId, new Map());
      workerProgressRef.current.set(jobId, new Map());
      jobMetaRef.current.set(jobId, {
        fps,
        totalFrames,
        expectedWorkers: frameRanges.length,
      });
      setIsRenderingActive(true);

      addLog({
        level: 'info',
        message: `Starting render job ${jobId.slice(0, 8)}: ${totalFrames} frames @ ${fps} fps across ${donorPeers.length} workers`,
      });

      // Send RENDER_START to each worker with its frame range
      frameRanges.forEach((range, idx) => {
        const worker = donorPeers[idx];
        sendToPeer(
          worker.peerId,
          encodeMessage(MSG.RENDER_START, {
            jobId,
            sceneJSON,
            startFrame: range.start,
            endFrame: range.end,
            fps,
            workerId: range.workerId,
          }),
          'control'
        );
        addLog({
          level: 'debug',
          message: `Assigned frames ${range.start}-${range.end} to worker ${worker.username || worker.peerId.slice(0, 8)}`,
        });
      });

      // Set up timeout and tracking promise
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          addLog({ level: 'warn', message: `Render job ${jobId.slice(0, 8)} timed out` });
          pendingRenderRef.current.delete(jobId);
          jobMetaRef.current.delete(jobId);
          reject(new Error('Render timeout'));
        }, RENDER_TIMEOUT_MS);

        pendingRenderRef.current.set(jobId, {
          resolve,
          reject,
          timeout,
          expectedWorkers: frameRanges.length,
          completedWorkers: new Set(),
        });
      });
    } catch (err) {
      addLog({ level: 'error', message: `Failed to submit render job: ${err.message}` });
      throw err;
    }
  }, [donorPeers, sendToPeer, splitFrames, addLog]);

  /**
   * Handle incoming rendered frame chunk (Orchestrator side)
   */
  const handleRenderFrame = useCallback((fromPeerId, payload) => {
    const { jobId, frameIndex, blob } = payload;

    if (!frameCollectorRef.current.has(jobId)) {
      frameCollectorRef.current.set(jobId, new Map());
    }

    frameCollectorRef.current.get(jobId).set(frameIndex, blob);
    setRenderedFrameCount(prev => ({
      ...prev,
      [jobId]: (prev[jobId] || 0) + 1,
    }));

    addLog({
      level: 'debug',
      message: `Received frame ${frameIndex} for job ${jobId.slice(0, 8)} from ${fromPeerId.slice(0, 8)}`,
    });
  }, [addLog]);

  /**
   * Handle render job completion (Orchestrator side)
   */
  const handleRenderDone = useCallback((fromPeerId, payload) => {
    const { jobId } = payload;
    const pending = pendingRenderRef.current.get(jobId);

    if (pending) {
      pending.completedWorkers.add(fromPeerId);

      if (pending.completedWorkers.size < pending.expectedWorkers) {
        addLog({
          level: 'debug',
          message: `Worker ${fromPeerId.slice(0, 8)} finished job ${jobId.slice(0, 8)} (${pending.completedWorkers.size}/${pending.expectedWorkers})`,
        });
        return;
      }

      clearTimeout(pending.timeout);
      const frames = frameCollectorRef.current.get(jobId);
      const orderedFrames = [...frames.entries()]
        .sort(([a], [b]) => a - b)
        .map(([frameIndex, dataUrl]) => ({ frameIndex, dataUrl }));
      const meta = jobMetaRef.current.get(jobId);

      const output = {
        jobId,
        fps: meta?.fps || 30,
        totalFrames: meta?.totalFrames || orderedFrames.length,
        frameCount: orderedFrames.length,
        frames: orderedFrames,
        completedAt: Date.now(),
      };
      
      addLog({
        level: 'info',
        message: `Render job ${jobId.slice(0, 8)} complete: ${orderedFrames.length} frames collected`,
      });

      pending.resolve(output);

      setLatestOutput(output);
      setCompletedJobs((prev) => [output, ...prev.filter((job) => job.jobId !== jobId)].slice(0, MAX_COMPLETED_JOBS));

      pendingRenderRef.current.delete(jobId);
      frameCollectorRef.current.delete(jobId);
      workerProgressRef.current.delete(jobId);
      jobMetaRef.current.delete(jobId);
      setIsRenderingActive(false);
    }
  }, [addLog]);

  /**
   * Handle render abort signal (Orchestrator side)
   */
  const handleRenderAbort = useCallback((fromPeerId, payload) => {
    const { jobId, reason } = payload;
    const pending = pendingRenderRef.current.get(jobId);

    if (pending) {
      clearTimeout(pending.timeout);
      pending.reject(new Error(reason || 'Render job aborted'));
      pendingRenderRef.current.delete(jobId);
      frameCollectorRef.current.delete(jobId);
      workerProgressRef.current.delete(jobId);
      jobMetaRef.current.delete(jobId);
      setIsRenderingActive(false);
    }

    addLog({
      level: 'warn',
      message: `Worker ${fromPeerId.slice(0, 8)} aborted render job ${jobId.slice(0, 8)}: ${reason}`,
    });
  }, [addLog]);

  /**
   * Handle render progress update (Orchestrator side)
   */
  const handleRenderProgress = useCallback((fromPeerId, payload) => {
    const { jobId, progress } = payload;
    if (!workerProgressRef.current.has(jobId)) {
      workerProgressRef.current.set(jobId, new Map());
    }
    workerProgressRef.current.get(jobId).set(fromPeerId, progress);

    addLog({
      level: 'debug',
      message: `Worker ${fromPeerId.slice(0, 8)} progress: ${Math.round(progress * 100)}%`,
    });
  }, [addLog]);

  /**
   * Assemble collected frames into a video (placeholder for future Web Codecs API)
   */
  const assembleVideo = useCallback(async (frames, frameCount, fps) => {
    // TODO: Implement Web Codecs API or MediaRecorder-based video encoding
    // For now, return frames as-is; caller can handle download
    addLog({
      level: 'info',
      message: `Assembled video: ${frameCount} frames @ ${fps} fps`,
    });
    return {
      frameCount,
      fps,
      frames,
    };
  }, [addLog]);

  /**
   * Render Farm State Getter
   */
  const getRenderJobStatus = useCallback((jobId) => {
    const collected = frameCollectorRef.current.get(jobId);
    return {
      frameCount: collected ? collected.size : 0,
      progress: workerProgressRef.current.get(jobId) || new Map(),
    };
  }, []);

  return {
    // Orchestrator API
    submitRenderJob,
    handleRenderFrame,
    handleRenderDone,
    handleRenderAbort,
    handleRenderProgress,
    assembleVideo,
    getRenderJobStatus,

    // State
    renderJobs,
    renderLog,
    isRenderingActive,
    renderedFrameCount,
    latestOutput,
    completedJobs,

    // Refs for testing
    frameCollectorRef,
    workerProgressRef,
  };
}

export default useRenderFarm;
