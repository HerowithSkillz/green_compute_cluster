import { useState, useRef, useCallback } from 'react';
import { MSG, encodeMessage, decomposePrompt } from '../lib/protocol.js';
import { generate } from '../lib/webllm.js';
import { TASK_TIMEOUT_MS } from '../lib/constants.js';

/**
 * useAgenticSwarm — Task decomposition, routing, and reassembly over the WebRTC mesh.
 * Orchestrator is the peer with the lowest peerId lexicographically.
 */
export function useAgenticSwarm(myPeerId, peers, channelStatus, sendToPeer) {
  const [taskQueue, setTaskQueue] = useState([]);       // { id, prompt, assignee, status }
  const taskResults = useRef(new Map());                 // taskId → { fullText, done }
  const [swarmStatus, setSwarmStatus] = useState('idle'); // idle | decomposing | routing | assembling
  const [assembledOutput, setAssembledOutput] = useState('');
  const [swarmLog, setSwarmLog] = useState([]);

  const addLog = useCallback((message, level = 'info') => {
    setSwarmLog(prev => [...prev, { message, level, ts: Date.now() }]);
  }, []);

  const getOpenPeers = useCallback(() => {
    return peers
      .filter(p => channelStatus.get(p.peerId) === 'open')
      .map(p => p.peerId);
  }, [peers, channelStatus]);

  /**
   * Submit a prompt — orchestrator decomposes, scores, dispatches, and assembles.
   */
  const submitPrompt = useCallback(async (userPrompt, onToken) => {
    const openPeers = getOpenPeers();
    const totalNodes = openPeers.length + 1; // +1 for self

    setSwarmStatus('decomposing');
    addLog(`Decomposing prompt across ${totalNodes} node(s)...`);

    const subPrompts = decomposePrompt(userPrompt, totalNodes);
    addLog(`Split into ${subPrompts.length} sub-task(s).`);

    // If only one subtask or no peers, run locally
    if (subPrompts.length === 1 || openPeers.length === 0) {
      setSwarmStatus('routing');
      addLog('Running inference locally (no decomposition or no peers).');
      const fullText = await generate(userPrompt, onToken);
      setAssembledOutput(fullText);
      setSwarmStatus('idle');
      addLog('Local inference complete.', 'success');
      return fullText;
    }

    // Create tasks
    setSwarmStatus('routing');
    const tasks = subPrompts.map((prompt, i) => {
      const assignee = i < openPeers.length ? openPeers[i] : myPeerId;
      return {
        id: `${myPeerId}-task-${Date.now()}-${i}`,
        prompt,
        assignee,
        status: 'pending',
      };
    });

    setTaskQueue(tasks);
    taskResults.current.clear();

    // Dispatch to peers (or self)
    const resultPromises = tasks.map((task) => {
      if (task.assignee === myPeerId) {
        addLog(`Task ${task.id.slice(-4)} → local`, 'info');
        return generate(task.prompt, (token) => onToken?.(token)).then(fullText => {
          taskResults.current.set(task.id, { fullText, done: true });
          return fullText;
        });
      } else {
        addLog(`Task ${task.id.slice(-4)} → peer ${task.assignee.slice(0, 8)}`, 'info');
        const msg = encodeMessage(MSG.TASK_ASSIGN, { taskId: task.id, subPrompt: task.prompt });
        sendToPeer(task.assignee, msg, 'control');

        return new Promise((resolve) => {
          const timeout = setTimeout(() => {
            addLog(`Task ${task.id.slice(-4)} timed out, running locally.`, 'warn');
            generate(task.prompt, (token) => onToken?.(token)).then(fallback => {
              taskResults.current.set(task.id, { fullText: fallback, done: true });
              resolve(fallback);
            });
          }, TASK_TIMEOUT_MS);

          // Store resolve/timeout for result handler
          taskResults.current.set(task.id, { resolve, timeout, fullText: '', done: false });
        });
      }
    });

    const results = await Promise.all(resultPromises);

    setSwarmStatus('assembling');
    addLog('Assembling results...', 'info');

    const assembled = results.join('\n\n');
    setAssembledOutput(assembled);
    setSwarmStatus('idle');
    addLog('Swarm inference complete.', 'success');

    return assembled;
  }, [myPeerId, getOpenPeers, addLog, sendToPeer]);

  /**
   * Handle incoming task assignment from orchestrator (this node is a worker).
   */
  const handleIncomingTask = useCallback(async (fromPeerId, payload) => {
    const { taskId, subPrompt } = payload;
    addLog(`Received task ${taskId.slice(-4)} from ${fromPeerId.slice(0, 8)}`, 'info');

    try {
      const fullText = await generate(subPrompt, (token) => {
        const msg = encodeMessage(MSG.TASK_RESULT, { taskId, token });
        sendToPeer(fromPeerId, msg, 'inference');
      });

      const doneMsg = encodeMessage(MSG.TASK_DONE, { taskId, fullText });
      sendToPeer(fromPeerId, doneMsg, 'control');
      addLog(`Task ${taskId.slice(-4)} completed.`, 'success');
    } catch (err) {
      const errMsg = encodeMessage(MSG.TASK_REJECT, { taskId, reason: err.message });
      sendToPeer(fromPeerId, errMsg, 'control');
      addLog(`Task ${taskId.slice(-4)} failed: ${err.message}`, 'error');
    }
  }, [addLog, sendToPeer]);

  /**
   * Handle task result arriving from a worker peer.
   */
  const handleTaskResult = useCallback((fromPeerId, payload) => {
    const { taskId, fullText } = payload;
    const entry = taskResults.current.get(taskId);
    if (entry && !entry.done) {
      clearTimeout(entry.timeout);
      taskResults.current.set(taskId, { fullText, done: true });
      entry.resolve?.(fullText);
      addLog(`Got result for task ${taskId.slice(-4)} from ${fromPeerId.slice(0, 8)}`, 'success');
    }
  }, [addLog]);

  return {
    submitPrompt,
    handleIncomingTask,
    handleTaskResult,
    taskQueue,
    swarmStatus,
    assembledOutput,
    swarmLog,
  };
}
