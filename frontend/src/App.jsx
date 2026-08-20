import { useState, useRef, useEffect, useCallback } from 'react';
import * as Tone from 'tone';
import './App.css';

const KEYS    = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const GENRES  = ['Ambient', 'Electronic', 'Hip-Hop', 'Pop', 'Game OST'];
const LENGTH_MODES = [
  { value: '1min', label: '1분', bars: 30, approx: '완성도 확인용 긴 구조', isLoop: false },
  { value: '3min', label: '3분', bars: 90, approx: '확장 편곡용', isLoop: false },
  { value: 'loop', label: '루프형', bars: 16, approx: '16마디 반복', isLoop: true },
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
const GAME_PRESETS = [
  {
    id: 'field',
    label: '필드',
    description: '탐험/던전용 차분한 루프',
    settings: { bpm: 88, key: 'A', genre: 'Game OST', lengthMode: 'loop', mood: 'mysterious', complexity: 'simple', dynamics: 'normal' },
  },
  {
    id: 'battle',
    label: '전투',
    description: '더 빠르고 밀도 있는 루프',
    settings: { bpm: 100, key: 'E', genre: 'Game OST', lengthMode: 'loop', mood: 'dark', complexity: 'complex', dynamics: 'strong' },
  },
  {
    id: 'town',
    label: '메뉴/마을',
    description: '밝고 단순한 반복 훅',
    settings: { bpm: 92, key: 'C', genre: 'Game OST', lengthMode: 'loop', mood: 'bright', complexity: 'simple', dynamics: 'soft' },
  },
];

function midiToFreq(midi) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

function getEffectiveBpm(genre, bpm) {
  return genre === 'Game OST' ? Math.max(80, Math.min(100, bpm)) : bpm;
}

function getDownloadName(res, fallback) {
  const disposition = res.headers.get('Content-Disposition') || '';
  const match = disposition.match(/filename="?([^"]+)"?/);
  return match?.[1] || fallback;
}

export default function App() {
  const [bpm,     setBpm]     = useState(88);
  const [key,     setKey]     = useState('A');
  const [genre,   setGenre]   = useState('Game OST');
  const [lengthMode, setLengthMode] = useState('loop');
  const [mood, setMood] = useState('mysterious');
  const [complexity, setComplexity] = useState('simple');
  const [dynamics, setDynamics] = useState('normal');
  const [status,  setStatus]  = useState('idle'); // idle | generating | playing | error
  const [midiUrl, setMidiUrl] = useState(null);
  const [midiName, setMidiName] = useState('');

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

  const effectiveBpm = getEffectiveBpm(genre, bpm);
  const activePreset = GAME_PRESETS.find((preset) => (
    Object.entries(preset.settings).every(([settingKey, value]) => ({
      bpm,
      key,
      genre,
      lengthMode,
      mood,
      complexity,
      dynamics,
    }[settingKey] === value))
  ))?.id;

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
      oscillator: { type: isDarkTone ? 'square' : 'triangle' },
      envelope: { attack: 0.01, decay: 0.08, sustain: 0.45, release: 0.15 },
      volume: -12,
    }).toDestination();

    const melodySynth = new Tone.Synth({
      oscillator: { type: mood === 'bright' ? 'square' : 'triangle' },
      envelope: { attack: 0.005, decay: 0.05, sustain: 0.35, release: 0.08 },
      volume: dynamicMap[dynamics] ?? -8,
    }).toDestination();

    const bassSynth = new Tone.MonoSynth({
      oscillator: { type: 'square' },
      filter: { Q: 1, type: 'lowpass', rolloff: -12 },
      envelope: { attack: 0.005, decay: 0.12, sustain: 0.3, release: 0.08 },
      filterEnvelope: { attack: 0.001, decay: 0.08, sustain: 0.2, release: 0.05, baseFrequency: 120, octaves: 2 },
      volume: -10,
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
    bassSynth.connect(analyserRef.current);

    // Track synths for cleanup
    synthsRef.current = [chordSynth, melodySynth, bassSynth, kickSynth, snareSynth, hihatSynth];

    const seqEvents = [];
    const hookPattern = [0, 3, 5, 3];
    const quarter = Tone.Time('4n').toSeconds();
    const eighth = Tone.Time('8n').toSeconds();

    for (let bar = 0; bar < bars; bar++) {
      const degree    = chordDegrees[bar % chordDegrees.length];
      const chordRoot = rootMidi + degree;
      const chordNotes = chordIntervals.map(i => Tone.Frequency(chordRoot + i, 'midi').toNote());

      const barTime = `${bar}m`;

      // Chord (whole bar)
      seqEvents.push({ time: barTime, fn: () => chordSynth.triggerAttackRelease(chordNotes, '2n') });

      // Melody density by complexity
      const notesPerBar = (genre === 'Game OST' || mood === 'mysterious')
        ? (complexity === 'complex' ? 8 : 4)
        : complexity === 'simple' ? 2 : complexity === 'complex' ? 8 : 4;
      const noteUnit = notesPerBar === 2 ? '2n' : notesPerBar === 8 ? '16n' : '4n';
      const stepDuration = (Tone.Time('1m').toSeconds()) / notesPerBar;
      for (let step = 0; step < notesPerBar; step++) {
        const noteMidi = (genre === 'Game OST' || mood === 'mysterious')
          ? chordRoot + hookPattern[step % hookPattern.length]
          : scale[Math.floor(Math.random() * scale.length)];
        const noteFreq = Tone.Frequency(noteMidi, 'midi').toNote();
        const stepTime = Tone.Time(`${bar}m`).toSeconds() + step * stepDuration;
        seqEvents.push({ time: stepTime, fn: () => melodySynth.triggerAttackRelease(noteFreq, noteUnit) });
      }

      // Bass on root notes
      [0, 2].forEach((beatIndex) => {
        const bassTime = Tone.Time(`${bar}m`).toSeconds() + beatIndex * quarter;
        const bassNote = Tone.Frequency(chordRoot - 12, 'midi').toNote();
        seqEvents.push({ time: bassTime, fn: () => bassSynth.triggerAttackRelease(bassNote, '8n') });
      });

      // Drums per beat
      for (let beat = 0; beat < 4; beat++) {
        const tSec = Tone.Time(`${bar}m`).toSeconds() + beat * quarter;
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
          const offSec = tSec + eighth;
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
  }, [effectiveBpm, key, genre, lengthMode, mood, complexity, dynamics, stopPlayback, drawWave]);

  const applyPreset = (preset) => {
    setBpm(preset.settings.bpm);
    setKey(preset.settings.key);
    setGenre(preset.settings.genre);
    setLengthMode(preset.settings.lengthMode);
    setMood(preset.settings.mood);
    setComplexity(preset.settings.complexity);
    setDynamics(preset.settings.dynamics);
  };

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
      const name = getDownloadName(res, `music_${key}_${effectiveBpm}bpm.mid`);
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
        <p>16비트 게임 음악 스케치용 MIDI 생성기 — 루프를 만든 뒤 DAW에서 음색을 입히세요</p>
      </header>

      <main>
        <section className="workflow-card">
          <h2>게임 음악 작업 흐름</h2>
          <ul>
            <li>먼저 루프형 MIDI로 필드/전투/메뉴용 짧은 시안을 만듭니다.</li>
            <li>MakeMusic은 구조 스케치용이고, 최종 16비트 질감은 Ableton 같은 DAW에서 만듭니다.</li>
            <li>내려받은 MIDI는 드럼/코드/베이스/멜로디 트랙으로 분리되어 리메이크하기 쉽습니다.</li>
          </ul>
        </section>

        <section className="preset-section">
          <div className="section-heading">
            <h2>빠른 시작 프리셋</h2>
            <p>게임 용도에 맞는 루프 설정을 바로 불러옵니다.</p>
          </div>
          <div className="preset-grid">
            {GAME_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                className={`preset-card ${activePreset === preset.id ? 'active' : ''}`}
                onClick={() => applyPreset(preset)}
              >
                <strong>{preset.label}</strong>
                <span>{preset.description}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="controls">
          {/* BPM */}
          <div className="control-group">
            <label>템포 (BPM) <span className="val">{effectiveBpm}</span></label>
            <input
              type="range" min={60} max={180} value={bpm}
              onChange={e => setBpm(Number(e.target.value))}
            />
            {genre === 'Game OST' && (
              <p className="helper-text">Game OST는 80–100 BPM으로 자동 정리되어 차분한 게임 루프 제작에 맞춰집니다.</p>
            )}
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
            <p className="helper-text">게임 삽입용 첫 시안은 루프형부터 만들고, 마음에 드는 아이디어만 긴 구조로 확장하세요.</p>
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

        <section className="export-card">
          <h2>내보낸 뒤 이렇게 진행하세요</h2>
          <ol>
            <li>MIDI를 Ableton Live로 가져옵니다.</li>
            <li>멜로디는 square/triangle 계열, 베이스는 단순 루트음, 드럼은 노이즈 계열로 교체합니다.</li>
            <li>루프가 자연스럽게 이어지면 WAV/OGG로 렌더링해 게임에 넣습니다.</li>
          </ol>
        </section>

        {status === 'error' && (
          <p className="error-msg">⚠ 백엔드 연결 오류 — 서버가 실행 중인지 확인하세요.</p>
        )}
      </main>
    </div>
  );
}
