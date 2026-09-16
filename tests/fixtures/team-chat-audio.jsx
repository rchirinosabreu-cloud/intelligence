// Test source only: real MediaRecorder with a synthetic tone, no physical microphone.
// Exercise recording, upload, protected playback and blob drafts under production CSP.
let audioContext;
Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {
  value: async () => {
    audioContext ||= new AudioContext();
    await audioContext.resume();
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    const destination = audioContext.createMediaStreamDestination();
    oscillator.frequency.value = 440;
    gain.gain.value = 0.03;
    oscillator.connect(gain).connect(destination);
    oscillator.start();
    const track = destination.stream.getAudioTracks()[0];
    const stop = track.stop.bind(track);
    track.stop = () => { oscillator.stop(); oscillator.disconnect(); gain.disconnect(); stop(); };
    return destination.stream;
  },
});
void import('./team-chat.jsx');
