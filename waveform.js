// ===== Waveform rendering =====
// Decodes an audio file via the Web Audio API and draws its amplitude
// as bars on a canvas — a real visualization of the actual file, not a
// generic decoration. Fails silently if the audio can't be fetched or
// decoded (empty URL, CORS, unsupported format) since the play button
// itself should keep working even without a visible waveform.
window.qsDrawWaveform = async function drawWaveform(canvas, audioUrl) {
  if (!canvas || !audioUrl) return;
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    const audioCtx = new AudioContextClass();
    const response = await fetch(audioUrl);
    const arrayBuffer = await response.arrayBuffer();
    const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
    const rawData = audioBuffer.getChannelData(0);

    const width = canvas.width;
    const height = canvas.height;
    const barCount = Math.max(20, Math.floor(width / 4));
    const blockSize = Math.floor(rawData.length / barCount);
    const levels = [];
    for (let i = 0; i < barCount; i++) {
      const start = blockSize * i;
      let sum = 0;
      for (let j = 0; j < blockSize; j++) {
        sum += Math.abs(rawData[start + j] || 0);
      }
      levels.push(sum / blockSize);
    }
    const maxLevel = Math.max(...levels) || 1;

    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, width, height);
    const barWidth = width / barCount;
    levels.forEach((level, i) => {
      const normalized = level / maxLevel;
      const barHeight = Math.max(2, normalized * height);
      ctx.fillStyle = 'rgba(255,255,255,0.45)';
      ctx.fillRect(i * barWidth, (height - barHeight) / 2, Math.max(1, barWidth * 0.6), barHeight);
    });

    audioCtx.close();
  } catch (e) {
    // Silent failure — the play button remains fully functional either way.
  }
};
