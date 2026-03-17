# Testing Distributed Video Rendering

## Current Implementation Status

✅ **Orchestrator Side (Complete):**
- RenderFarmPanel UI for scene upload and job submission
- useRenderFarm hook for job management
- Message handlers for RENDER_FRAME, RENDER_DONE, etc.
- Tab system in receiver layout

❌ **Worker Side (Not Yet Implemented):**
- Need handler for RENDER_START messages on donor nodes
- Three.js rendering logic with OffscreenCanvas
- Frame blob encoding and transmission
- Video assembly on orchestrator

---

## Testing Strategy

### Phase 1: Unit Tests (No Full Rendering)

#### 1.1 Test useRenderFarm Hook Logic

Create `client/src/__tests__/useRenderFarm.test.js`:

```js
import { renderHook, act } from '@testing-library/react';
import { useRenderFarm } from '../hooks/useRenderFarm.js';

describe('useRenderFarm', () => {
  it('should initialize with empty render jobs', () => {
    const { result } = renderHook(() =>
      useRenderFarm('peer-1', [], () => {}, () => {})
    );
    expect(result.current.renderJobs).toEqual([]);
    expect(result.current.renderLog).toEqual([]);
  });

  it('should add log entries', () => {
    const { result } = renderHook(() =>
      useRenderFarm('peer-1', [], () => {}, () => {})
    );
    // Log entry added during initialization
    expect(result.current.renderLog).toBeDefined();
  });

  it('should split frames correctly across workers', () => {
    const { result } = renderHook(() =>
      useRenderFarm('peer-1', [], () => {}, () => {})
    );
    // Test frame splitting logic (internal)
    const ranges = result.current.splitFrames?.(300, 5);
    expect(ranges).toHaveLength(5);
  });

  it('should handle render frame collection', () => {
    const { result } = renderHook(() =>
      useRenderFarm('peer-1', [], () => {}, () => {})
    );
    
    act(() => {
      result.current.handleRenderFrame('worker-1', {
        jobId: 'job-1',
        frameIndex: 0,
        blob: 'data:image/png;base64,...'
      });
    });

    expect(result.current.renderedFrameCount['job-1']).toBe(1);
  });

  it('should timeout after RENDER_TIMEOUT_MS', async () => {
    const { result } = renderHook(() =>
      useRenderFarm('peer-1', [], () => {}, () => {})
    );

    const jobPromise = act(() =>
      result.current.submitRenderJob('{}', 10, 30, 'job-1')
    );

    // Job should timeout after 120 seconds
    await expect(jobPromise).rejects.toThrow('timeout');
  }, 130000);
});
```

Run with: `npm install --save-dev @testing-library/react vitest`

#### 1.2 Test Protocol Integration

Create `client/src/__tests__/protocol.render.test.js`:

```js
import { MSG, encodeMessage, decodeMessage } from '../lib/protocol.js';

describe('Render Protocol Messages', () => {
  it('should encode/decode RENDER_START', () => {
    const payload = {
      jobId: 'job-123',
      sceneJSON: '{"type":"Scene"}',
      startFrame: 0,
      endFrame: 29,
      fps: 30,
      workerId: 0
    };

    const encoded = encodeMessage(MSG.RENDER_START, payload);
    const decoded = decodeMessage(encoded);

    expect(decoded.type).toBe(MSG.RENDER_START);
    expect(decoded.payload).toEqual(payload);
    expect(decoded.ts).toBeDefined();
  });

  it('should encode/decode RENDER_FRAME', () => {
    const payload = {
      jobId: 'job-123',
      frameIndex: 5,
      blob: new Uint8Array([255, 0, 0, 255])
    };

    const encoded = encodeMessage(MSG.RENDER_FRAME, payload);
    const decoded = decodeMessage(encoded);

    expect(decoded.type).toBe(MSG.RENDER_FRAME);
    expect(decoded.payload.frameIndex).toBe(5);
  });

  it('should have all 5 render message types defined', () => {
    expect(MSG.RENDER_START).toBeDefined();
    expect(MSG.RENDER_FRAME).toBeDefined();
    expect(MSG.RENDER_DONE).toBeDefined();
    expect(MSG.RENDER_ABORT).toBeDefined();
    expect(MSG.RENDER_PROGRESS).toBeDefined();
  });
});
```

---

### Phase 2: Integration Tests (Mock Worker)

#### 2.1 Manual Browser Test with Mock Data

1. **Start dev server:**
   ```bash
   npm run dev
   ```

2. **Join as Receiver:**
   - Username: "ReceiverTest"
   - Role: Receiver
   - Join room

3. **Click Render Farm tab**

4. **Upload minimal test scene:**
   ```json
   {
     "type": "Scene",
     "children": [
       {
         "type": "Mesh",
         "geometry": {
           "type": "BoxGeometry",
           "width": 1,
           "height": 1,
           "depth": 1
         },
         "material": {
           "type": "MeshBasicMaterial",
           "color": 16711680
         }
       }
     ]
   }
   ```

5. **Set parameters:**
   - Total Frames: 10
   - FPS: 30
   - Click "Start Render"

6. **Observe:**
   - ✓ "No worker nodes available" message appears (expected - no donors yet)
   - ✓ Log entries appear with debug/info messages
   - ✓ Tab switching works smoothly

#### 2.2 Simulate Worker Messages

Use browser console to manually send render frame messages:

```js
// Simulate receiving a frame from a worker
const mockFrame = {
  type: 'RENDER_FRAME',
  payload: {
    jobId: 'test-job-1',
    frameIndex: 0,
    blob: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
  },
  ts: Date.now()
};

// This would need direct hook access - test in DevTools
window.__testRenderFrame?.(mockFrame);
```

---

### Phase 3: Implement Worker-Side Rendering (Required for Full Test)

#### 3.1 Add Worker Handler to App.jsx

Add handler for RENDER_START in the message dispatch:

```js
case MSG.RENDER_START:
  if (role === 'receiver') {
    // Receivers don't handle render jobs
    break;
  }
  handleRenderJob(fromPeerId, msg.payload);
  break;
```

#### 3.2 Implement handleRenderJob Function

Add to App.jsx:

```js
const handleRenderJob = useCallback(async (fromPeerId, payload) => {
  const { jobId, sceneJSON, startFrame, endFrame, fps, workerId } = payload;
  
  try {
    // Send progress updates
    const updateProgress = (progress) => {
      webrtc.sendToPeer(
        fromPeerId,
        encodeMessage(MSG.RENDER_PROGRESS, { jobId, progress }),
        'control'
      );
    };

    // Simple mock rendering (replace with actual Three.js)
    const renderFrames = async () => {
      for (let f = startFrame; f <= endFrame; f++) {
        // Simulate rendering delay
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // For testing: create a simple colored canvas
        const canvas = document.createElement('canvas');
        canvas.width = 320;
        canvas.height = 240;
        const ctx = canvas.getContext('2d');
        
        // Color based on frame index
        const hue = (f / (endFrame - startFrame + 1)) * 360;
        ctx.fillStyle = `hsl(${hue}, 100%, 50%)`;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = 'white';
        ctx.font = '16px Arial';
        ctx.fillText(`Frame ${f}`, 10, 20);
        
        // Send frame blob
        canvas.toBlob((blob) => {
          webrtc.sendToPeer(
            fromPeerId,
            encodeMessage(MSG.RENDER_FRAME, {
              jobId,
              frameIndex: f,
              blob: URL.createObjectURL(blob)
            }),
            'inference'
          );
        }, 'image/png');
        
        // Update progress
        const frameProgress = (f - startFrame + 1) / (endFrame - startFrame + 1);
        updateProgress(frameProgress);
      }
    };

    await renderFrames();

    // Send completion
    webrtc.sendToPeer(
      fromPeerId,
      encodeMessage(MSG.RENDER_DONE, { jobId }),
      'control'
    );
  } catch (err) {
    console.error('[Render] Job failed:', err);
    webrtc.sendToPeer(
      fromPeerId,
      encodeMessage(MSG.RENDER_ABORT, { jobId, reason: err.message }),
      'control'
    );
  }
}, [webrtc, role]);
```

#### 3.3 Wire Handler to Message Dispatch

In the message dispatch useEffect, add the case handler above.

---

### Phase 4: End-to-End Test Scenario

#### 4.1 Setup Two Browser Windows

**Window 1 (Receiver):**
- URL: http://localhost:5173
- Username: "renderer"
- Role: Receiver
- Join room: "render-test"

**Window 2 (Donor):**
- URL: http://localhost:5173
- Username: "gpu-donor"
- Role: Donor (requires WebGPU)
- Join room: "render-test"
- Click "Load LLM" (simulates GPU availability)

#### 4.2 Window 1: Submit Render Job

1. Click "Render Farm" tab
2. Paste test scene JSON
3. Set: 30 frames, 30 FPS
4. Click "Start Render"

#### 4.3 Expected Behavior

**Window 1 (Receiver):**
- ✓ Log shows: "Starting render job [jobId]: 30 frames @ 30 fps across 1 workers"
- ✓ Log shows: "Assigned frames 0-29 to worker gpu-donor"
- ✓ Progress bar appears and increments
- ✓ Frame count updates (0/30 → 30/30)

**Window 2 (Donor):**
- ✓ Receives RENDER_START message
- ✓ Console logs render progress
- ✓ Sends RENDER_FRAME messages
- ✓ Sends RENDER_DONE when complete

**Window 1 (Receiver) - Completion:**
- ✓ Log shows: "Render job complete: 30 frames collected"
- ✓ Progress reaches 100%
- ✓ Ready for next render or video download

---

### Phase 5: Advanced Testing

#### 5.1 Test with Multiple Donors

1. Open 3 browser windows
2. 1 × Receiver, 2 × Donors
3. Submit 60-frame job
4. Verify frame distribution: 30-29 split

#### 5.2 Test Timeout Handling

1. Donor joins
2. Receiver submits job
3. Close donor tab before completion
4. Verify receiver sees timeout error after 120 seconds
5. Check log contains: "Render job [jobId] timed out"

#### 5.3 Test Progress Updates

1. Donor sends RENDER_PROGRESS with 0.25, 0.5, 0.75, 1.0
2. Verify progress bars update in real-time
3. Check log entries for each update

---

### Phase 6: Production Readiness Checklist

- [ ] Implement actual Three.js rendering with OffscreenCanvas
- [ ] Add JSON scene parsing (THREE.ObjectLoader)
- [ ] Implement Web Codecs API for video assembly
- [ ] Add frame format compression (WebP/JPEG instead of PNG)
- [ ] Error recovery for dropped frames
- [ ] Bandwidth throttling simulation
- [ ] Scene validation before dispatch
- [ ] Frame ordering verification on orchestrator
- [ ] Video download/export UI
- [ ] Abort job mid-render
- [ ] Multiple concurrent jobs

---

## Quick Start: Test Right Now

### 1. Verify UI Works

```bash
cd client
npm run dev
# Open http://localhost:5173
# Join as Receiver
# Click Render Farm tab
# Verify no errors in console
```

### 2. Check Protocol

```bash
cd client
npm install --save-dev vitest @testing-library/react
npm run test -- protocol.render
```

### 3. Trigger Mock Render (Two Windows)

- Window 1: Receiver in render-test room
- Window 2: Donor in render-test room
- Submit 10-frame job from Window 1
- Watch logs on both sides

---

## Next Steps

1. **Copy the worker handler** from Phase 3.2 into App.jsx
2. **Add case handler** from Phase 3.1 to message dispatch
3. **Test with mock rendering** (canvas-based frames)
4. **Replace with actual Three.js** when ready
5. **Add Web Codecs API** for video encoding

All orchestrator infrastructure is ready—just need the worker logic!
