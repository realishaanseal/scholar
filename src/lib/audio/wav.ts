/**
 * Convert recorded audio to 16 kHz mono WAV, in the browser.
 *
 * MediaRecorder produces WebM/Opus in Chrome and MP4 in Safari, and provider
 * support for those is inconsistent — Gemini accepts wav/mp3/ogg/flac/aac but
 * NOT webm, which is exactly what Chrome hands us. Rather than special-casing
 * every provider against every browser's container, everything is normalised to
 * WAV here: it is the one format all three transcription paths accept.
 *
 * 16 kHz mono is what speech models expect anyway, so downsampling costs no
 * accuracy and cuts the upload to roughly 32 KB per second.
 */

const TARGET_SAMPLE_RATE = 16_000;

export async function toWav(blob: Blob): Promise<Blob> {
  const arrayBuffer = await blob.arrayBuffer();

  const AudioCtx =
    (window as any).AudioContext || (window as any).webkitAudioContext;
  if (!AudioCtx) throw new Error("This browser can't process audio.");

  const ctx = new AudioCtx();
  try {
    const decoded: AudioBuffer = await ctx.decodeAudioData(arrayBuffer.slice(0));
    const mono = downmixToMono(decoded);
    const resampled = resample(mono, decoded.sampleRate, TARGET_SAMPLE_RATE);
    return encodeWav(resampled, TARGET_SAMPLE_RATE);
  } finally {
    // Chrome caps concurrent AudioContexts; leaving them open eventually makes
    // recording fail with an opaque error several sessions later.
    ctx.close?.();
  }
}

function downmixToMono(buffer: AudioBuffer): Float32Array {
  const channels = buffer.numberOfChannels;
  if (channels === 1) return buffer.getChannelData(0);

  const length = buffer.length;
  const out = new Float32Array(length);
  for (let c = 0; c < channels; c++) {
    const data = buffer.getChannelData(c);
    for (let i = 0; i < length; i++) out[i] += data[i] / channels;
  }
  return out;
}

/** Linear resampling. Adequate for speech; a full sinc filter is overkill here. */
function resample(input: Float32Array, fromRate: number, toRate: number): Float32Array {
  if (fromRate === toRate) return input;

  const ratio = fromRate / toRate;
  const newLength = Math.round(input.length / ratio);
  const out = new Float32Array(newLength);

  for (let i = 0; i < newLength; i++) {
    const position = i * ratio;
    const left = Math.floor(position);
    const right = Math.min(left + 1, input.length - 1);
    const weight = position - left;
    out[i] = input[left] * (1 - weight) + input[right] * weight;
  }
  return out;
}

function encodeWav(samples: Float32Array, sampleRate: number): Blob {
  const bytesPerSample = 2; // 16-bit PCM
  const buffer = new ArrayBuffer(44 + samples.length * bytesPerSample);
  const view = new DataView(buffer);

  const writeString = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i));
  };

  const dataSize = samples.length * bytesPerSample;

  writeString(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);          // PCM header size
  view.setUint16(20, 1, true);           // format: PCM
  view.setUint16(22, 1, true);           // channels: mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * bytesPerSample, true); // byte rate
  view.setUint16(32, bytesPerSample, true);              // block align
  view.setUint16(34, 16, true);          // bits per sample
  writeString(36, "data");
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    // Clamp before scaling: values outside [-1,1] wrap around and produce
    // loud clicks rather than clipping cleanly.
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    offset += bytesPerSample;
  }

  return new Blob([buffer], { type: "audio/wav" });
}

/** Best container MediaRecorder can give us on this browser. */
export function pickRecordingMime(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/ogg;codecs=opus",
    "audio/webm",
    "audio/mp4",
  ];
  return candidates.find((m) => MediaRecorder.isTypeSupported?.(m));
}
