# Quick Testing Guide - Distributed Video Rendering

## ⚡ Fast Track: Test in 5 Minutes

### Step 1: Start Dev Server
```bash
cd client
npm run dev
```
Visit http://localhost:5173

### Step 2: Open Two Browser Tabs/Windows

**Tab 1 - Receiver Node:**
- Username: `renderer`
- Role: **Receiver** ✓
- Room: `render-test`
- **Leave LLM Inference tab** (default)

**Tab 2 - Donor Node:**
- Username: `gpu-donor`
- Role: **Donor** ✓
- Room: `render-test`
- Wait for both to show "connected" status

### Step 3: Submit Render Job (from Tab 1 Receiver)

1. Click **"🎬 Render Farm"** tab
2. Paste this test scene:
```json
{
  "type": "Scene",
  "children": []
}
```
3. Set **Total Frames: 10** (quick test)
4. Set **FPS: 30**
5. Click **"▶ Start Render"**

### Step 4: Watch It Work!

**Expected on Tab 1 (Receiver):**
```
[INFO] Starting render job [uuid]: 10 frames @ 30 fps across 1 workers
[DEBUG] Assigned frames 0-9 to worker gpu-donor
[Render Progress bar appears]
Frame count: 0/10 → 1/10 → 2/10 ... → 10/10
[INFO] Render job complete: 10 frames collected
```

**Expected on Tab 2 (Donor):**
- Console logs (F12):
```
[Render] Starting job [uuid]: frames 0-9 @ 30 fps
[Render] Job [uuid]: Frame 0 rendered (10%)
[Render] Job [uuid]: Frame 1 rendered (20%)
...
[Render] Job [uuid] complete
```

---

## ✅ What Should Happen

### Data Flow

1. **Receiver submits job** → sends RENDER_START to donor
2. **Donor receives RENDER_START** → starts rendering frames
3. **Donor renders each frame** → creates colored test image
4. **Donor sends RENDER_FRAME** → transfers blob back to receiver (10 times)
5. **Donor sends RENDER_PROGRESS** → updates progress (10 updates)
6. **Donor sends RENDER_DONE** → signals completion
7. **Receiver collects frames** → shows progress bar and frame count
8. **Receiver shows completion** → "Render job complete: 10 frames collected"

### UI Elements to Verify

- ✅ Tab switching works (💬 LLM Inference ↔ 🎬 Render Farm)
- ✅ Scene JSON textarea accepts JSON
- ✅ Frame count input (1-10000)
- ✅ FPS input (1-120)
- ✅ "Start Render" button enables when workers available
- ✅ Progress bar fills smoothly
- ✅ Frame count increments
- ✅ Log entries appear with timestamps
- ✅ Green accent for active tab

### Network Messages

Open DevTools → Network tab, filter by WebSocket:

You should see _many_ WebRTC DataChannel messages (harder to debug directly, but these carry):
- 1× RENDER_START (control channel)
- 10× RENDER_FRAME (inference channel - fast)
- 10× RENDER_PROGRESS (control channel - reliable)
- 1× RENDER_DONE (control channel)

---

## 🧪 Advanced Tests

### Test 1: Multiple Donors (Load Distribution)

1. Open **3 tabs** with same room `render-test`
2. Tab 1: Receiver
3. Tabs 2-3: Donors
4. Submit job with **60 frames**
5. Expected: Frames split 30-30 between 2 donors
6. Check Tab 1 logs: "Assigned frames 0-29 to donor-1"
7. Check Tab 1 logs: "Assigned frames 30-59 to donor-2"

### Test 2: Timeout Handling

1. Submit render job (5 frames, slow rendering)
2. Close **donor tab immediately** after job starts
3. Receiver should wait ~120 seconds then show timeout error
4. Log shows: "Render job [uuid] timed out"

### Test 3: Progress Real-Time Updates

1. Submit job and watch progress bar
2. It should update smoothly (not jump)
3. Rendering time depends on scene complexity and donor GPU capability
4. For the minimal test scene, completion should usually be within a few seconds

### Test 4: Tab Un-Focus Persistence

1. Submit render job
2. Switch away from browser tab
3. Come back 2 seconds later
4. Progress should have continued (not paused)

---

## 🐛 Debugging

### Check Console (F12 → Console)

**Donor's console should show:**
```javascript
[Render] Starting job abc123: frames 0-9 @ 30 fps
[Render] Job abc123: Frame 0 rendered (10%)
[Render] Job abc123: Frame 1 rendered (20%)
...
[Render] Job abc123 complete
```

**Receiver's console should show:**
```javascript
[useRenderFarm] Starting render job abc123: 10 frames @ 30 fps across 1 workers
```

### Check Network Activity (F12 → Network)

Filter WebSocket. You won't see individual frames directly but you'll see data packets.

### Check React State

Open React DevTools extension:
1. Select `RenderFarmPanel` component
2. Check props:
   - `isRenderingActive`: should be `true` during render
   - `renderLog`: should have 5+ entries
   - `workers`: should show your donors

---

## ❌ Common Issues & Fixes

| Issue | Cause | Fix |
|-------|-------|-----|
| "No worker nodes available" | No donors in room | Open Tab 2 as Donor |
| Progress bar doesn't update | WebRTC connection failing | Check browser console errors |
| Frames showing as received but no progress bar | State not updating | Refresh receiver tab |
| Render job doesn't start | Scene JSON invalid | Use test JSON above |
| Donor tab doesn't show render logs | handleRenderJob not called | Check App.jsx MSG.RENDER_START case |
| Frame count stuck at 0/10 | renderFarm.handleRenderFrame not called | Check message dispatch routing |
| 120s timeout immediately | RENDER_START not received | Check DataChannel status |

---

## 🎨 What the Three.js Worker Rendering Does

Each frame is rendered by a real **Three.js WebGLRenderer** on donor nodes where:
- Scene JSON is parsed into an actual Three.js scene graph
- A camera is extracted from scene JSON (or auto-created fallback camera)
- Meshes are animated across frames and rendered in WebGL
- Frames are encoded as image payloads and streamed back to receiver

Example:
```
Frame 0: Initial scene state
Frame 5: Scene with mid-animation transform updates
Frame 9: Scene with later animation transform updates
```

This proves **end-to-end P2P rendering + data transfer** is working using real Three.js on worker donors.

---

## 🚀 Next Steps After Successful Test

1. ✅ **Test UI & messaging works** (you're here!)
2. ✅ Replace mock rendering with **actual Three.js**
3. Add **scene JSON parsing** (THREE.ObjectLoader)
4. Implement **OffscreenCanvas** for non-blocking rendering
5. Add **Web Codecs API** for video assembly
6. Create **video download** button
7. Add **frame compression** (WebP instead of PNG)

---

## 📝 Test Report Template

```
# Render Farm Test Report - [DATE]

## Environment
- Device: [MacBook/PC/etc]
- Browser: [Chrome/Edge version]
- GPU: [Model/available]
- Network: [WiFi/LAN]

## Test Duration
- Setup: [X] minutes
- Rendering: [Y] seconds for 10 frames
- Total: [Z] minutes

## Results
- ✓ Receiver tab loads
- ✓ Donor tab loads
- ✓ WebRTC connection establishes
- ✓ Render job submitted
- ✓ Frames received: [X]/10
- ✓ Progress bar smooth
- ✓ No console errors

## Performance
- Frame rate: ~[X] fps
- Average latency per frame: [Y]ms
- Memory usage: ~[Z]MB

## Issues Found
[List any bugs or unexpected behavior]

## Notes
[Any additional observations]
```

Save this and share for debugging!

---

**Ready to test? Start at Step 1 above. Should take ~3 minutes total.** 🟢
