// Player intro clips are recorded on a phone (often 1080p/4K, sometimes longer than needed).
// Before upload we keep them small and short so the profile loads fast on mobile data:
// anything over ~4 MB or 6 seconds is re-recorded in the browser at 720p, first 6 seconds only.
const KEEP_BYTES = 4 << 20;
const MAX_SECONDS = 6;
const MAX_SIDE = 720;
const SERVER_LIMIT = 15 << 20; // must match maxVideoBytes in backend files.go

function probe(url) {
  return new Promise((resolve, reject) => {
    const v = document.createElement('video');
    v.preload = 'metadata';
    v.muted = true;
    const done = () => resolve({ duration: v.duration, width: v.videoWidth, height: v.videoHeight });
    v.onloadedmetadata = () => {
      if (Number.isFinite(v.duration)) { done(); return; }
      // Browser-recorded WebM often reports Infinity until you seek past the end.
      v.ondurationchange = () => { if (Number.isFinite(v.duration)) { v.ondurationchange = null; done(); } };
      v.currentTime = 1e101;
      setTimeout(done, 3000);
    };
    v.onerror = () => reject(new Error('Yeh video phone/browser mein khul nahi rahi. MP4 ya MOV video chuno.'));
    v.src = url;
  });
}

function pickType() {
  const types = ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
  return types.find((t) => window.MediaRecorder?.isTypeSupported?.(t)) || '';
}

export async function prepareIntroVideo(file, onStatus = () => {}) {
  const url = URL.createObjectURL(file);
  try {
    const meta = await probe(url);
    const longClip = Number.isFinite(meta.duration) && meta.duration > MAX_SECONDS + 0.3;
    if (file.size <= KEEP_BYTES && !longClip) return file;

    const type = pickType();
    if (!type || !HTMLCanvasElement.prototype.captureStream) {
      if (file.size <= SERVER_LIMIT) return file; // can't shrink here; the server still takes it
      throw new Error('Video 15 MB se badi hai. Phone camera ko 1080p par rakh kar 3-5 second ki video banao.');
    }

    const scale = Math.min(1, MAX_SIDE / Math.max(meta.width, meta.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round((meta.width * scale) / 2) * 2;
    canvas.height = Math.round((meta.height * scale) / 2) * 2;
    const ctx = canvas.getContext('2d');

    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.src = url;
    await new Promise((r) => { video.oncanplay = r; });

    const stream = canvas.captureStream(30);
    const rec = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: 2_500_000 });
    const chunks = [];
    rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    const stopped = new Promise((r) => { rec.onstop = r; });

    const end = Math.min(meta.duration || MAX_SECONDS, MAX_SECONDS);
    let done = false;
    const finish = () => { if (done) return; done = true; video.pause(); rec.stop(); };
    const draw = () => {
      if (done) return;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      onStatus(`Video chhoti ho rahi hai... ${Math.min(99, Math.round((video.currentTime / end) * 100))}%`);
      if (video.currentTime >= end || video.ended) { finish(); return; }
      if (video.requestVideoFrameCallback) video.requestVideoFrameCallback(draw);
      else requestAnimationFrame(draw);
    };
    video.onended = finish;
    rec.start(250);
    await video.play();
    draw();
    await stopped;

    const blob = new Blob(chunks, { type: type.split(';')[0] });
    if (!blob.size) throw new Error('Video chhoti nahi ho payi. Dusri video try karo.');
    const ext = blob.type === 'video/mp4' ? 'mp4' : 'webm';
    const base = file.name.replace(/\.[^.]+$/, '') || 'intro';
    return new File([blob], `${base}-intro.${ext}`, { type: blob.type });
  } finally {
    URL.revokeObjectURL(url);
  }
}
