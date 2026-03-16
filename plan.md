# Render Output Preview And Download Plan

## Goal
Add post-render output UX so users can immediately see rendered visuals and download results.

## Scope
1. Frame preview strip in Render Farm tab
2. One-click ZIP download of rendered frames
3. Optional WebM export using WebCodecs when supported

## Current State
1. Distributed rendering works across donor nodes.
2. Receiver collects frames in memory.
3. No visual output preview UI.
4. No downloadable artifact generation yet.

## Implementation Plan

### 1. Expose frame data cleanly from render hook
1. Extend render state in useRenderFarm to expose latest completed job frames and metadata.
2. Normalize frame ordering by frame index before any display/export.
3. Keep memory usage bounded by allowing only latest N jobs in memory.

### 2. Add preview UI in RenderFarmPanel
1. Add a post-job "Output" section below progress/logs.
2. Render thumbnail strip/grid from received data URLs.
3. Add controls:
   - Show first frame
   - Show last frame
   - Open full-size frame in new tab
4. Add empty/loading/error states.

### 3. Add ZIP frames download
1. Add a utility module to package ordered frame images into ZIP.
2. Naming convention:
   - render-{jobId}/frame-000001.webp
3. Trigger browser download via Blob + object URL.
4. Include guardrails:
   - disable while rendering
   - show errors if no frames available

### 4. Add optional WebM export (feature-detected)
1. Detect WebCodecs support:
   - VideoEncoder
   - VideoFrame
2. If supported, enable "Export WebM" button.
3. Encode ordered frames using configured fps from job metadata.
4. Trigger browser download for final .webm.
5. If unsupported, hide/disable action with helpful tooltip.

### 5. Integrate actions into App flow
1. On job completion, persist output metadata in state:
   - jobId
   - frameCount
   - fps
   - ordered frames
2. Pass output model and actions into RenderFarmPanel.
3. Keep existing render behavior unchanged for donors/receivers.

### 6. Reliability and performance checks
1. Ensure frame ordering is deterministic with multi-donor jobs.
2. Handle partial/missing frames gracefully in preview/export.
3. Add lightweight progress indicator for ZIP/WebM export.
4. Revoke object URLs after download.

### 7. Validation checklist
1. Single donor: preview + ZIP + WebM (if supported) works.
2. Multi donor: merged frame order is correct.
3. Invalid/empty output: UI shows safe fallback messages.
4. Existing inference tab behavior remains unaffected.

## Deliverables
1. Render output preview panel
2. ZIP download for frames
3. Optional WebM export action
4. Updated test notes for output verification
