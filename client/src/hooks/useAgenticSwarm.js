import { useState, useRef, useCallback } from 'react';
import { MSG, encodeMessage, decomposePrompt } from '../lib/protocol.js';
import { generate } from '../lib/webllm.js';
import { TASK_TIMEOUT_MS } from '../lib/constants.js';

/**
 * useAgenticSwarm - Task decomposition, routing, and reassembly over the WebRTC mesh.
 * Orchestrator is the peer with the lowest peerId lexicographically.
 */
export function useAgenticSwarm(myPeerId, peers, channelStatus, sendToPeer) {
  const [taskQueue, setTaskQueue] = useState([]);       // { id, prompt, assignee, status }
  const taskResults = useRef(new Map());                // taskId -> { fullText, done }
  const [swarmStatus, setSwarmStatus] = useState('idle'); // idle | decomposing | routing | assembling
  const [assembledOutput, setAssembledOutput] = useState('');

  const getOpenPeers = useCallback(() => {
    return peers
      .filter((p) => channelStatus.get(p.peerId) === 'open')
      .map((p) => p.peerId);
  }, [peers, channelStatus]);

  /**
   * Submit a prompt - orchestrator decomposes, scores, dispatches, and assembles.
   */
  const submitPrompt = useCallback(async (userPrompt, onToken) => {
    const openPeers = getOpenPeers();
    const totalNodes = openPeers.length + 1; // +1 for self

    setSwarmStatus('decomposing');
    const subPrompts = decomposePrompt(userPrompt, totalNodes);

    // If only one subtask or no peers, run locally
    if (subPrompts.length === 1 || openPeers.length === 0) {
      setSwarmStatus('routing');
      const fullText = await generate(userPrompt, onToken);
      setAssembledOutput(fullText);
      setSwarmStatus('idle');
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
        return generate(task.prompt, (token) => onToken?.(token)).then((fullText) => {
          taskResults.current.set(task.id, { fullText, done: true });
          return fullText;
        });
      }

      const msg = encodeMessage(MSG.TASK_ASSIGN, { taskId: task.id, subPrompt: task.prompt });
      sendToPeer(task.assignee, msg, 'control');

      return new Promise((resolve) => {
        const timeout = setTimeout(() => {
          generate(task.prompt, (token) => onToken?.(token)).then((fallback) => {
            taskResults.current.set(task.id, { fullText: fallback, done: true });
            resolve(fallback);
          });
        }, TASK_TIMEOUT_MS);

        // Store resolve/timeout for result handler
        taskResults.current.set(task.id, { resolve, timeout, fullText: '', done: false });
      });
    });

    const results = await Promise.all(resultPromises);

    setSwarmStatus('assembling');
    const assembled = results.join('\n\n');
    setAssembledOutput(assembled);
    setSwarmStatus('idle');

    return assembled;
  }, [myPeerId, getOpenPeers, sendToPeer]);

  /**
   * Handle incoming task assignment from orchestrator (this node is a worker).
   */
  const handleIncomingTask = useCallback(async (fromPeerId, payload) => {
    const { taskId, subPrompt } = payload;

    try {
      const fullText = await generate(subPrompt, (token) => {
        const msg = encodeMessage(MSG.TASK_RESULT, { taskId, token });
        sendToPeer(fromPeerId, msg, 'inference');
      });

      const doneMsg = encodeMessage(MSG.TASK_DONE, { taskId, fullText });
      sendToPeer(fromPeerId, doneMsg, 'control');
    } catch (err) {
      const errMsg = encodeMessage(MSG.TASK_REJECT, { taskId, reason: err.message });
      sendToPeer(fromPeerId, errMsg, 'control');
    }
  }, [sendToPeer]);

  /**
   * Handle task result arriving from a worker peer.
   */
  const handleTaskResult = useCallback((_fromPeerId, payload) => {
    const { taskId, fullText } = payload;
    const entry = taskResults.current.get(taskId);
    if (entry && !entry.done) {
      clearTimeout(entry.timeout);
      taskResults.current.set(taskId, { fullText, done: true });
      entry.resolve?.(fullText);
    }
  }, []);

  return {
    submitPrompt,
    handleIncomingTask,
    handleTaskResult,
    taskQueue,
    swarmStatus,
    assembledOutput,
  };
}
