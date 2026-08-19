import { useState, useRef, useEffect, useCallback } from 'react';
import * as Tone from 'tone';
import './App.css';

const KEYS    = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const GENRES  = ['Ambient', 'Electronic', 'Hip-Hop', 'Pop', 'Game OST'];
const LENGTH_MODES = [
  { value: '1min', label: '1분', bars: 30, approx: '약 30초 재생', isLoop: false },
  { value: '3min', label: '3분', bars: 90, approx: '약 1.5분 재생', isLoop: false },
  { value: 'loop', label: '루프형', bars: 100, approx: '무한 반복', isLoop: true },
];
const MOODS = [
  { value: 'bright', label: '밝음' },
  { value: 'dark', label: '어두움' },
  { value: 'mysterious', label: '신비로움' },
];
const COMPLEXITIES = [
  { value: 'simple', label: '심플' },
  { value: 'normal', label: '보통' },
  { value: 'complex', label: '복잡' },
];
const DYNAMICS = [
  { value: 'soft', label: '부드럽게' },
  { value: 'normal', label: '보통' },
  { value: 'strong', label: '강하게' },
];

// I-IV-V-I chord roots in semitones above key root
const CHORD_DEGREES = [0, 5, 7, 0];
const DARK_CHORD_DEGREES = [0, 8, 3, 10];
const MAJOR_CHORD   = [0, 4, 7];
const MINOR_CHORD   = [0, 3, 7];
const MAJOR_SCALE   = [0, 2, 4, 5, 7, 9, 11];
const MINOR_SCALE   = [0, 2, 3, 5, 7, 8, 10];

// Note name -> MIDI-style number helper
const NOTE_MIDI = { C: 60, D: 62, E: 64, F: 65, G: 67, A: 69, B: 71 };

function midiToFreq(midi) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

export default function App() {
  const [bpm,     setBpm]     = useState(120);
  const [key,     setKey]     = useState('C');
  const [genre,   setGenre]   = useState('Pop');
  const [lengthMode, setLengthMode] = useState('1min');
  const [mood, setMood] = useState('bright');
  const [complexity, setComplexity] = useState('normal');
  const [dynamics, setDynamics] = useState('normal');
  const [status,  setStatus]  = useState('idle'); // idle | generating | playing | error
  const [midiUrl, setMidiUrl] = useState(null);
  const [midiName, setMidiName] = useState('');
  const [waveData, setWaveData] = useState([]);

  const partRef   = useRef(null);
  const analyserRef = useRef(null);
  const animFrameRef = useRef(null);
  const canvasRef = useRef(null);

  const synthsRef = useRef(null);

  // Stop any playing sequence
  const stopPlayback = useCallback(() => {
    if (partRef.current) {
      partRef.current.dispose();
      partRef.current = null;
    }
    Tone.getTransport().stop();
    Tone.getTransport().cancel();
    Tone.getTransport().loop = false;
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    if (synthsRef.current) {
      synthsRef.current.forEach(s => s.dispose());
      synthsRef.current = null;
    }
    if (analyserRef.current) { analyserRef.current.dispose(); analyserRef.current = null; }
    setStatus('idle');
  }, []);

  useEffect(() => () => stopPlayback(), [stopPlayback]);

  // Draw waveform from analyser
  const drawWave = useCallback(() => {
    if (!canvasRef.current || !analyserRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const data = analyserRef.current.getValue();
    const w = canvas.width, h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = '#7c6fff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < data.length; i++) {
      const x = (i / data.length) * w;
      const y = ((data[i] + 1) / 2) * h;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke();
    animFrameRef.current = requestAnimationFrame(drawWave);
  }, []);

  // Build Tone.js sequence from parameters and play it
  const playLocally = useCallback(async () => {
    await Tone.start();
    stopPlayback();

    const effectiveBpm = genre === 'Game OST' ? Math.max(80, Math.min(100, bpm)) : bpm;
    Tone.getTransport().bpm.value = effectiveBpm;
    const transport = Tone.getTransport();
    const selectedLength = LENGTH_MODES.find((m) => m.value === lengthMode) || LENGTH_MODES[0];
    const bars = selectedLength.bars;

    const rootMidi = NOTE_MIDI[key] || 60;
    const isDarkTone = genre === 'Game OST' || mood !== 'bright';
    const scaleIntervals = isDarkTone ? MINOR_SCALE : MAJOR_SCALE;
    const chordDegrees = isDarkTone ? DARK_CHORD_DEGREES : CHORD_DEGREES;
    const chordIntervals = isDarkTone ? MINOR_CHORD : MAJOR_CHORD;
    const scale = scaleIntervals.map(i => rootMidi + i);
    const dynamicMap = { soft: -12, normal: -8, strong: -4 };

    // Synths
    const chordSynth = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: mood === 'mysterious' ? 'sine' : 'triangle' },
      envelope: { attack: mood === 'mysterious' ? 0.2 : 0.05, decay: 0.1, sustain: 0.6, release: mood === 'mysterious' ? 1.2 : 0.5 },
      volume: -10,
    }).toDestination();

    const melodySynth = new Tone.Synth({
      oscillator: { type: mood === 'bright' ? 'triangle' : 'sine' },
      envelope: { attack: mood === 'mysterious' ? 0.08 : 0.01, decay: 0.05, sustain: 0.5, release: mood === 'mysterious' ? 0.8 : 0.3 },
      volume: dynamicMap[dynamics] ?? -8,
    }).toDestination();

    const drumVolMap = { soft: -16, normal: -9, strong: -4 };
    const kickSynth = new Tone.MembraneSynth({ volume: drumVolMap[dynamics] ?? -9 }).toDestination();
    const snareSynth = new Tone.NoiseSynth({
      noise: { type: 'white' },
      envelope: { attack: 0.001, decay: 0.15, sustain: 0, release: 0.05 },
      volume: (drumVolMap[dynamics] ?? -9) - 6,
    }).toDestination();
    const hihatSynth = new Tone.MetalSynth({
      frequency: 400,
      envelope: { attack: 0.001, decay: 0.05, release: 0.01 },
      harmonicity: 5.1,
      modulationIndex: 32,
      resonance: 4000,
      octaves: 1.5,
      volume: (drumVolMap[dynamics] ?? -9) - 10,
    }).toDestination();

    // Analyser
    analyserRef.current = new Tone.Analyser('waveform', 256);
    chordSynth.connect(analyserRef.current);
    melodySynth.connect(analyserRef.current);

    // Track synths for cleanup
    synthsRef.current = [chordSynth, melodySynth, kickSynth, snareSynth, hihatSynth];

    const seqEvents = [];

    for (let bar = 0; bar < bars; bar++) {
      const degree    = chordDegrees[bar % chordDegrees.length];
      const chordRoot = rootMidi + degree;
      const chordNotes = chordIntervals.map(i => Tone.Frequency(chordRoot + i, 'midi').toNote());

      const barTime = `${bar}m`;

      // Chord (whole bar)
      seqEvents.push({ time: barTime, fn: () => chordSynth.triggerAttackRelease(chordNotes, '2n') });

      // Melody density by complexity
      const notesPerBar = complexity === 'simple' ? 2 : complexity === 'complex' ? 8 : 4;
      const noteUnit = notesPerBar === 2 ? '2n' : notesPerBar === 8 ? '16n' : '4n';
      const stepDuration = (Tone.Time('1m').toSeconds()) / notesPerBar;
      for (let step = 0; step < notesPerBar; step++) {
        const noteIdx  = Math.floor(Math.random() * scale.length);
        const noteFreq = Tone.Frequency(scale[noteIdx], 'midi').toNote();
        const stepTime = Tone.Time(`${bar}m`).toSeconds() + step * stepDuration;
        seqEvents.push({ time: stepTime, fn: () => melodySynth.triggerAttackRelease(noteFreq, noteUnit) });
      }

      // Drums per beat
      for (let beat = 0; beat < 4; beat++) {
        const tSec = Tone.Time(`${bar}m`).toSeconds() + Tone.Time(`${beat}n`).toSeconds();
        // hi-hat every beat (skip some in soft mode)
        if (!(dynamics === 'soft' && beat === 3)) {
          seqEvents.push({ time: tSec, fn: () => hihatSynth.triggerAttackRelease('32n') });
        }
        // kick on 1 & 3
        if (beat === 0 || beat === 2) seqEvents.push({ time: tSec, fn: () => kickSynth.triggerAttackRelease('C1', '8n') });
        // snare on 2 & 4
        if (beat === 1 || beat === 3) seqEvents.push({ time: tSec, fn: () => snareSynth.triggerAttackRelease('8n') });
        // 8th note hi-hat (offbeat)
        if (complexity !== 'simple') {
          const offSec = tSec + Tone.Time('8n').toSeconds();
          seqEvents.push({ time: offSec, fn: () => hihatSynth.triggerAttackRelease('32n') });
        }
      }
    }

    // Use Tone.Part
    const part = new Tone.Part((time, ev) => {
      ev.fn();
    }, seqEvents.map(e => [e.time, e]));

    part.start(0);
    partRef.current = part;

    if (selectedLength.isLoop) {
      transport.loop = true;
      transport.loopStart = 0;
      transport.loopEnd = `${bars}m`;
    } else {
      transport.loop = false;
    }

    transport.start();
    setStatus('playing');
    drawWave();

    if (!selectedLength.isLoop) {
      const totalSecs = Tone.Time(`${bars}m`).toSeconds();
      setTimeout(() => stopPlayback(), (totalSecs + 1) * 1000);
    }
  }, [bpm, key, genre, lengthMode, mood, complexity, dynamics, stopPlayback, drawWave]);

  const handleGenerate = async () => {
    setStatus('generating');
    setMidiUrl(null);
    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bpm, key, genre, length_mode: lengthMode, mood, complexity, dynamics }),
      });
      if (!res.ok) throw new Error('서버 오류');
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const name = `music_${key}_${bpm}bpm.mid`;
      setMidiUrl(url);
      setMidiName(name);
      setStatus('idle');
      // Auto-play after generating
      playLocally();
    } catch {
      setStatus('error');
    }
  };

  const handlePlay = () => {
    if (status === 'playing') stopPlayback();
    else playLocally();
  };

  return (
    <div className="app">
      <header>
        <h1>🎵 MakeMusic</h1>
        <p>AI 음악 생성기 — 설정 후 생성하세요</p>
      </header>

      <main>
        <section className="controls">
          {/* BPM */}
          <div className="control-group">
            <label>템포 (BPM) <span className="val">{bpm}</span></label>
            <input
              type="range" min={60} max={180} value={bpm}
              onChange={e => setBpm(Number(e.target.value))}
            />
          </div>

          {/* Key */}
          <div className="control-group">
            <label>키 (Key)</label>
            <div className="btn-group">
              {KEYS.map(k => (
                <button key={k} className={key === k ? 'active' : ''} onClick={() => setKey(k)}>{k}</button>
              ))}
            </div>
          </div>

          {/* Genre */}
          <div className="control-group">
            <label>장르</label>
            <div className="btn-group">
              {GENRES.map(g => (
                <button key={g} className={genre === g ? 'active' : ''} onClick={() => setGenre(g)}>{g}</button>
              ))}
            </div>
          </div>

          {/* Length mode */}
          <div className="control-group">
            <label>길이</label>
            <div className="btn-group">
              {LENGTH_MODES.map(mode => (
                <button
                  key={mode.value}
                  className={lengthMode === mode.value ? 'active' : ''}
                  onClick={() => setLengthMode(mode.value)}
                >
                  {mode.label} ({mode.approx})
                </button>
              ))}
            </div>
          </div>

          <div className="control-group">
            <label>무드</label>
            <div className="btn-group">
              {MOODS.map(option => (
                <button
                  key={option.value}
                  className={mood === option.value ? 'active' : ''}
                  onClick={() => setMood(option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <div className="control-group">
            <label>리듬 복잡도</label>
            <div className="btn-group">
              {COMPLEXITIES.map(option => (
                <button
                  key={option.value}
                  className={complexity === option.value ? 'active' : ''}
                  onClick={() => setComplexity(option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <div className="control-group">
            <label>다이내믹</label>
            <div className="btn-group">
              {DYNAMICS.map(option => (
                <button
                  key={option.value}
                  className={dynamics === option.value ? 'active' : ''}
                  onClick={() => setDynamics(option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* Waveform canvas */}
        <canvas ref={canvasRef} className="waveform" width={600} height={100} />

        {/* Action buttons */}
        <div className="actions">
          <button
            className="btn-generate"
            onClick={handleGenerate}
            disabled={status === 'generating' || status === 'playing'}
          >
            {status === 'generating' ? '생성 중…' : '🎵 음악 생성'}
          </button>

          <button
            className="btn-play"
            onClick={handlePlay}
            disabled={status === 'generating'}
          >
            {status === 'playing' ? '⏹ 정지' : '▶ 재생'}
          </button>

          {midiUrl && (
            <a className="btn-download" href={midiUrl} download={midiName}>
              ⬇ MIDI 다운로드
            </a>
          )}
        </div>

        {status === 'error' && (
          <p className="error-msg">⚠ 백엔드 연결 오류 — 서버가 실행 중인지 확인하세요.</p>
        )}
      </main>
    </div>
  );
}
