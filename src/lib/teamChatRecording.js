export async function startChatRecording({
  mediaDevices = navigator.mediaDevices,
  MediaRecorderCtor = globalThis.MediaRecorder,
  onState = () => {},
  onFile = () => {},
  onError = () => {},
} = {}) {
  if (!mediaDevices?.getUserMedia || !MediaRecorderCtor)
    throw new Error(
      "Este navegador no permite grabar. Puedes adjuntar un audio.",
    );
  const stream = await mediaDevices.getUserMedia({ audio: true });
  let recorder;
  try {
    const mimeType = [
      "audio/webm;codecs=opus",
      "audio/mp4;codecs=mp4a.40.2",
      "audio/mp4",
      "audio/ogg;codecs=opus",
    ].find((t) => MediaRecorderCtor.isTypeSupported(t));
    recorder = new MediaRecorderCtor(
      stream,
      mimeType ? { mimeType } : undefined,
    );
  } catch (error) {
    stream.getTracks().forEach((t) => t.stop());
    throw error;
  }
  const chunks = [];
  let settle;
  const stopped = new Promise(resolve => { settle = resolve; });
  let canceled = false,
    finished = false,
    elapsed = 0,
    last = Date.now();
  const release = () => {
    clearInterval(timer);
    stream.getTracks().forEach((t) => t.stop());
  };
  const seconds = () =>
    Math.floor(
      (elapsed + (recorder.state === "recording" ? Date.now() - last : 0)) /
        1000,
    );
  const publish = () => onState({ status: recorder.state, seconds: seconds() });
  const timer = setInterval(() => {
    publish();
    if (seconds() >= 300) session.stop();
  }, 250);
  timer.unref?.();
  recorder.ondataavailable = (e) => {
    if (e.data.size) chunks.push(e.data);
  };
  recorder.onerror = (e) => {
    canceled = true;
    onError(e.error || new Error("No se pudo grabar el audio."));
    session.cancel();
  };
  recorder.onstop = async () => {
    if (finished) return;
    finished = true;
    release();
    onState({ status: "inactive", seconds: 0 });
    if (canceled) { settle(null); return; }
    if (chunks.length) {
      const type = (recorder.mimeType || chunks[0].type).split(";")[0];
      const ext = type.includes("mp4")
        ? "m4a"
        : type.includes("ogg")
          ? "ogg"
          : "webm";
      const file = new File(chunks, `nota-de-voz-${Date.now()}.${ext}`, { type });
      try { await onFile(file); settle(file); }
      catch (error) { onError(error); settle(null); }
    } else { onError(new Error("La grabación está vacía. Graba de nuevo antes de enviar.")); settle(null); }
  };
  const session = {
    get state() { return recorder.state; },
    pause() {
      if (recorder.state === "recording") {
        elapsed += Date.now() - last;
        recorder.pause();
        publish();
      }
    },
    resume() {
      if (recorder.state === "paused") {
        last = Date.now();
        recorder.resume();
        publish();
      }
    },
    stop() {
      if (recorder.state !== "inactive") recorder.stop();
      return stopped;
    },
    cancel() {
      canceled = true;
      if (recorder.state !== "inactive") recorder.stop();
      else if (!finished) {
        finished = true;
        release();
        settle(null);
      }
    },
  };
  try {
    recorder.start(1000);
    publish();
    return session;
  } catch (error) {
    release();
    throw error;
  }
}
