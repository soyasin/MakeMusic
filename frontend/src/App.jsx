import { useState, useRef, useEffect, useCallback } from 'react';
import * as Tone from 'tone';
import './App.css';

const KEYS    = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const GENRES  = ['Ambient', 'Electronic', 'Hip-Hop', 'Pop'];
const BARS    = [4, 8, 12, 16];

// I-IV-V-I chord roots in semitones above key root
const CHORD_DEGREES = [0, 5, 7, 0];
const MAJOR_CHORD   = [0, 4, 7];
const MAJOR_SCALE   = [0, 2, 4, 5, 7, 9, 11];

// Note name -> MIDI-style number helper
const NOTE_MIDI = { C: 60, D: 62, E: 64, F: 65, G: 67, A: 69, B: 71 };

function midiToFreq(midi) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

export default function App() {
  const [bpm,     setBpm]     = useState(120);
  const [key,     setKey]     = useState('C');
  const [genre,   setGenre]   = useState('Pop');
  const [bars,    setBars]    = useState(8);
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

    Tone.getTransport().bpm.value = bpm;

    const rootMidi = NOTE_MIDI[key] || 60;
    const scale    = MAJOR_SCALE.map(i => rootMidi + i);

    // Synths
    const chordSynth = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: 'triangle' },
      envelope: { attack: 0.05, decay: 0.1, sustain: 0.6, release: 0.5 },
      volume: -10,
    }).toDestination();

    const melodySynth = new Tone.Synth({
      oscillator: { type: 'sine' },
      envelope: { attack: 0.01, decay: 0.05, sustain: 0.5, release: 0.3 },
      volume: -8,
    }).toDestination();

    const kickSynth = new Tone.MembraneSynth({ volume: -6 }).toDestination();
    const snareSynth = new Tone.NoiseSynth({
      noise: { type: 'white' },
      envelope: { attack: 0.001, decay: 0.15, sustain: 0, release: 0.05 },
      volume: -12,
    }).toDestination();
    const hihatSynth = new Tone.MetalSynth({
      frequency: 400,
      envelope: { attack: 0.001, decay: 0.05, release: 0.01 },
      harmonicity: 5.1,
      modulationIndex: 32,
      resonance: 4000,
      octaves: 1.5,
      volume: -20,
    }).toDestination();

    // Analyser
    analyserRef.current = new Tone.Analyser('waveform', 256);
    chordSynth.connect(analyserRef.current);
    melodySynth.connect(analyserRef.current);

    // Track synths for cleanup
    synthsRef.current = [chordSynth, melodySynth, kickSynth, snareSynth, hihatSynth];

    const seqEvents = [];

    for (let bar = 0; bar < bars; bar++) {
      const degree    = CHORD_DEGREES[bar % CHORD_DEGREES.length];
      const chordRoot = rootMidi + degree;
      const chordNotes = MAJOR_CHORD.map(i => Tone.Frequency(chordRoot + i, 'midi').toNote());

      const barTime = `${bar}m`;

      // Chord (whole bar)
      seqEvents.push({ time: barTime, fn: () => chordSynth.triggerAttackRelease(chordNotes, '2n') });

      // Melody — one note per beat
      for (let beat = 0; beat < 4; beat++) {
        const noteIdx  = Math.floor(Math.random() * scale.length);
        const noteFreq = Tone.Frequency(scale[noteIdx], 'midi').toNote();
        seqEvents.push({ time: Tone.Time(`${bar}m`).toSeconds() + Tone.Time(`${beat}n`).toSeconds(), fn: () => melodySynth.triggerAttackRelease(noteFreq, '8n') });
      }

      // Drums per beat
      for (let beat = 0; beat < 4; beat++) {
        const tSec = Tone.Time(`${bar}m`).toSeconds() + Tone.Time(`${beat}n`).toSeconds();
        // hi-hat every beat
        seqEvents.push({ time: tSec, fn: () => hihatSynth.triggerAttackRelease('32n') });
        // kick on 1 & 3
        if (beat === 0 || beat === 2) seqEvents.push({ time: tSec, fn: () => kickSynth.triggerAttackRelease('C1', '8n') });
        // snare on 2 & 4
        if (beat === 1 || beat === 3) seqEvents.push({ time: tSec, fn: () => snareSynth.triggerAttackRelease('8n') });
        // 8th note hi-hat (offbeat)
        const offSec = tSec + Tone.Time('8n').toSeconds();
        seqEvents.push({ time: offSec, fn: () => hihatSynth.triggerAttackRelease('32n') });
      }
    }

    // Use Tone.Part
    const part = new Tone.Part((time, ev) => {
      ev.fn();
    }, seqEvents.map(e => [e.time, e]));

    part.start(0);
    partRef.current = part;

    Tone.getTransport().start();
    setStatus('playing');
    drawWave();

    // Auto-stop after all bars played
    const totalSecs = Tone.Time(`${bars}m`).toSeconds();
    setTimeout(() => stopPlayback(), (totalSecs + 1) * 1000);
  }, [bpm, key, bars, stopPlayback, drawWave]);

  const handleGenerate = async () => {
    setStatus('generating');
    setMidiUrl(null);
    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bpm, key, genre, bars }),
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

          {/* Bars */}
          <div className="control-group">
            <label>길이 (마디)</label>
            <div className="btn-group">
              {BARS.map(b => (
                <button key={b} className={bars === b ? 'active' : ''} onClick={() => setBars(b)}>{b}</button>
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
