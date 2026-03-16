import JSZip from 'jszip';
import { Muxer, ArrayBufferTarget } from 'webm-muxer';

function padFrame(frameIndex) {
  return String(frameIndex).padStart(6, '0');
}

async function dataUrlToBlob(dataUrl) {
  const response = await fetch(dataUrl);
  return response.blob();
}

function triggerDownload(blob, fileName) {
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}

export function isWebCodecsExportSupported() {
  return typeof window !== 'undefined' && !!window.VideoEncoder && !!window.VideoFrame;
}

export async function downloadFramesAsZip(output, onProgress) {
  if (!output?.frames?.length) {
    throw new Error('No rendered frames available');
  }

  const zip = new JSZip();
  const root = zip.folder(`render-${output.jobId}`);

  for (let i = 0; i < output.frames.length; i++) {
    const frame = output.frames[i];
    const blob = await dataUrlToBlob(frame.dataUrl);
    const extension = blob.type.includes('webp') ? 'webp' : 'png';
    root.file(`frame-${padFrame(frame.frameIndex)}.${extension}`, blob);

    if (typeof onProgress === 'function') {
      onProgress((i + 1) / output.frames.length);
    }
  }

  const zipBlob = await zip.generateAsync({ type: 'blob' });
  triggerDownload(zipBlob, `render-${output.jobId}.zip`);
}

export async function exportFramesToWebM(output, onProgress) {
  if (!isWebCodecsExportSupported()) {
    throw new Error('WebCodecs is not supported in this browser');
  }
  if (!output?.frames?.length) {
    throw new Error('No rendered frames available');
  }

  const firstBlob = await dataUrlToBlob(output.frames[0].dataUrl);
  const firstBitmap = await createImageBitmap(firstBlob);
  const width = firstBitmap.width;
  const height = firstBitmap.height;
  firstBitmap.close();

  const target = new ArrayBufferTarget();
  const muxer = new Muxer({
    target,
    video: {
      codec: 'V_VP8',
      width,
      height,
      frameRate: output.fps || 30,
    },
    fastStart: 'in-memory',
  });

  const encoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (err) => {
      throw err;
    },
  });

  encoder.configure({
    codec: 'vp8',
    width,
    height,
    bitrate: 3_000_000,
    framerate: output.fps || 30,
  });

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { alpha: false });

  for (let i = 0; i < output.frames.length; i++) {
    const frame = output.frames[i];
    const blob = await dataUrlToBlob(frame.dataUrl);
    const bitmap = await createImageBitmap(blob);
    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();

    const timestamp = Math.round((i * 1_000_000) / (output.fps || 30));
    const videoFrame = new VideoFrame(canvas, {
      timestamp,
      duration: Math.round(1_000_000 / (output.fps || 30)),
    });

    encoder.encode(videoFrame);
    videoFrame.close();

    if (typeof onProgress === 'function') {
      onProgress((i + 1) / output.frames.length);
    }
  }

  await encoder.flush();
  encoder.close();
  muxer.finalize();

  const webmBlob = new Blob([target.buffer], { type: 'video/webm' });
  triggerDownload(webmBlob, `render-${output.jobId}.webm`);
}
