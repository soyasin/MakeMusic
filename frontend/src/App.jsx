import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import * as Tone from 'tone';
import './App.css';

const KEYS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const SCALES = [
  { value: 'major', label: 'Major' },
  { value: 'minor', label: 'Minor' },
];
const GENRES = ['Ambient', 'Electronic', 'Hip-Hop', 'Pop', 'Game OST', 'Jazz', 'Lofi', 'Cinematic'];
const RHYTHM_STYLES = [
  { value: 'straight', label: 'Straight' },
  { value: 'swing', label: 'Swing' },
  { value: 'syncopated', label: 'Syncopated' },
  { value: 'triplet', label: 'Triplet' },
  { value: 'pulse', label: 'Pulse' },
];
const INSTRUMENTATIONS = [
  { value: 'band', label: 'Band' },
  { value: 'piano_trio', label: 'Piano Trio' },
  { value: 'electro_synth', label: 'Electro Synth' },
  { value: 'orchestral', label: 'Orchestral' },
  { value: 'groove_band', label: 'Groove Band' },
];
const LENGTH_MODES = [
  { value: '1min', label: '1분', bars: 30, approx: '완성도 확인용 긴 구조', isLoop: false },
  { value: '3min', label: '3분', bars: 90, approx: '확장 편곡용', isLoop: false },
  { value: 'loop', label: '루프형', bars: 16, approx: '16마디 반복', isLoop: true },
];
const MOODS = [
  { value: 'bright', label: '밝음' },
  { value: 'dark', label: '어두움' },
  { value: 'dreamy', label: '몽환' },
  { value: 'tense', label: '긴장' },
  { value: 'lyrical', label: '서정' },
  { value: 'epic', label: '장엄' },
  { value: 'lofi', label: '로파이' },
  { value: 'jazz', label: '재즈' },
  { value: 'cinematic', label: '시네마틱' },
  { value: 'mysterious', label: '신비로움' },
];
const COMPLEXITIES = [
  { value: 'simple', label: '심플' },
  { value: 'normal', label: '보통' },
  { value: 'complex', label: '복잡' },
];
const VARIATIONS = [
  { value: 'low', label: '낮음' },
  { value: 'medium', label: '보통' },
  { value: 'high', label: '높음' },
];
const DYNAMICS = [
  { value: 'soft', label: '부드럽게' },
  { value: 'normal', label: '보통' },
  { value: 'strong', label: '강하게' },
];
const REFERENCE_STYLES = [
  { value: 'none', label: '레퍼런스 없음', note: '사용자 옵션 그대로 작곡' },
  { value: 'imagine', label: 'Imagine 계열', note: '서정적·스윙 리듬 감성만 반영' },
  { value: 'billie_jean', label: 'Billie Jean 계열', note: '긴장감 있는 베이스 그루브 성향만 반영' },
  { value: 'canon', label: 'Canon 계열', note: '반복 구조와 점층감만 반영' },
  { value: 'shape_of_you', label: 'Shape of You 계열', note: '펄스 중심 리듬감만 반영' },
  { value: 'interstellar', label: 'Interstellar 계열', note: '시네마틱 확장감만 반영' },
];
const REFERENCE_TRAITS = {
  none: {},
  imagine: { mood: 'lyrical', rhythm_style: 'swing', section_repeats: 2, variation: 'medium' },
  billie_jean: { mood: 'tense', rhythm_style: 'syncopated', instrumentation: 'groove_band', variation: 'high' },
  canon: { mood: 'epic', rhythm_style: 'straight', section_repeats: 3, variation: 'low' },
  shape_of_you: { mood: 'bright', rhythm_style: 'pulse', instrumentation: 'groove_band', variation: 'medium' },
  interstellar: { mood: 'cinematic', rhythm_style: 'triplet', instrumentation: 'orchestral', variation: 'medium' },
};

const WORKFLOW_PHASES = {
  EMPTY: 'empty',
  GENERATING: 'generating',
  READY: 'ready',
  PLAYING: 'playing',
  ERROR: 'error',
};

const DEFAULT_OPTIONS = {
  bpm: 88,
  key: 'A',
  scale: 'minor',
  genre: 'Game OST',
  rhythm_style: 'straight',
  instrumentation: 'band',
  length_mode: 'loop',
  section_repeats: 2,
  mood: 'mysterious',
  complexity: 'simple',
  variation: 'medium',
  dynamics: 'normal',
  reference_style: 'none',
};

const CHORD_DEGREES = [0, 5, 7, 0];
const DARK_CHORD_DEGREES = [0, 8, 3, 10];
const MAJOR_CHORD = [0, 4, 7];
const MINOR_CHORD = [0, 3, 7];
const MAJOR_SCALE = [0, 2, 4, 5, 7, 9, 11];
const MINOR_SCALE = [0, 2, 3, 5, 7, 8, 10];

const NOTE_MIDI = { C: 60, D: 62, E: 64, F: 65, G: 67, A: 69, B: 71 };
const GAME_PRESETS = [
  {
    id: 'field',
    label: '필드',
    description: '탐험/던전용 차분한 루프',
    settings: { ...DEFAULT_OPTIONS, bpm: 88, key: 'A', mood: 'mysterious', complexity: 'simple', variation: 'low' },
  },
  {
    id: 'battle',
    label: '전투',
    description: '더 빠르고 밀도 있는 루프',
    settings: { ...DEFAULT_OPTIONS, bpm: 100, key: 'E', mood: 'tense', complexity: 'complex', variation: 'high', dynamics: 'strong' },
  },
  {
    id: 'town',
    label: '메뉴/마을',
    description: '밝고 단순한 반복 훅',
    settings: { ...DEFAULT_OPTIONS, bpm: 92, key: 'C', scale: 'major', mood: 'bright', complexity: 'simple', dynamics: 'soft' },
  },
];

function getEffectiveBpm(genre, bpm) {
  return genre === 'Game OST' ? Math.max(80, Math.min(100, bpm)) : bpm;
}

function getDownloadName(res, fallback) {
  const disposition = res.headers.get('Content-Disposition') || '';
  const match = disposition.match(/filename="?([^"]+)"?/);
  return match?.[1] || fallback;
}

function createSeed() {
  return Math.floor((Date.now() + Math.random() * 10_000_000) % 2_147_483_647) || 1;
}

function mulberry32(seed) {
  let t = seed || 1;
  return () => {
    t += 0x6D2B79F5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function applyReferenceTraits(options) {
  const traits = REFERENCE_TRAITS[options.reference_style] || {};
  return { ...options, ...traits };
}

export default function App() {
  const [options, setOptions] = useState(DEFAULT_OPTIONS);
  const [phase, setPhase] = useState(WORKFLOW_PHASES.EMPTY);
  const [midiUrl, setMidiUrl] = useState(null);
  const [midiName, setMidiName] = useState('');
  const [currentSong, setCurrentSong] = useState(null);
  const [lastParams, setLastParams] = useState('');
  const [lastSeed, setLastSeed] = useState(null);

  const partRef = useRef(null);
  const analyserRef = useRef(null);
  const animFrameRef = useRef(null);
  const canvasRef = useRef(null);
  const synthsRef = useRef(null);

  const effectiveBpm = useMemo(() => getEffectiveBpm(options.genre, options.bpm), [options.genre, options.bpm]);

  const activePreset = GAME_PRESETS.find((preset) => (
    Object.entries(preset.settings).every(([settingKey, value]) => options[settingKey] === value)
  ))?.id;

  const updateOption = useCallback((field, value) => {
    setOptions((prev) => ({ ...prev, [field]: value }));
  }, []);

  const cleanupAudio = useCallback(() => {
    if (partRef.current) {
      partRef.current.dispose();
      partRef.current = null;
    }
    Tone.getTransport().stop();
    Tone.getTransport().cancel();
    Tone.getTransport().loop = false;

    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    if (synthsRef.current) {
      synthsRef.current.forEach((s) => s.dispose());
      synthsRef.current = null;
    }
    if (analyserRef.current) {
      analyserRef.current.dispose();
      analyserRef.current = null;
    }
  }, []);

  const stopPlayback = useCallback(() => {
    cleanupAudio();
    setPhase((prev) => (
      prev === WORKFLOW_PHASES.GENERATING
        ? WORKFLOW_PHASES.GENERATING
        : (currentSong ? WORKFLOW_PHASES.READY : WORKFLOW_PHASES.EMPTY)
    ));
  }, [cleanupAudio, currentSong]);

  const clearCurrentComposition = useCallback(() => {
    cleanupAudio();
    setMidiUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setMidiName('');
    setCurrentSong(null);
    setLastParams('');
    setLastSeed(null);
  }, [cleanupAudio]);

  useEffect(() => () => {
    cleanupAudio();
    if (midiUrl) URL.revokeObjectURL(midiUrl);
  }, [cleanupAudio, midiUrl]);

  const drawWave = useCallback(() => {
    if (!canvasRef.current || !analyserRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const data = analyserRef.current.getValue();
    const w = canvas.width;
    const h = canvas.height;
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

  const playLocally = useCallback(async (song) => {
    if (!song) return;

    const resolvedOptions = applyReferenceTraits(song.options);
    const random = mulberry32(song.seed);
    const localBpm = getEffectiveBpm(resolvedOptions.genre, resolvedOptions.bpm);
    const selectedLength = LENGTH_MODES.find((m) => m.value === resolvedOptions.length_mode) || LENGTH_MODES[0];
    const bars = selectedLength.bars * Math.max(1, Math.min(8, Number(resolvedOptions.section_repeats) || 1));

    await Tone.start();
    cleanupAudio();

    const transport = Tone.getTransport();
    transport.bpm.value = localBpm;

    const rootMidi = NOTE_MIDI[resolvedOptions.key] || 60;
    const darkMoods = new Set(['dark', 'mysterious', 'tense', 'epic', 'lofi', 'cinematic']);
    const isDarkTone = resolvedOptions.scale === 'minor' || darkMoods.has(resolvedOptions.mood) || resolvedOptions.genre === 'Game OST';
    const scaleIntervals = resolvedOptions.scale === 'minor' ? MINOR_SCALE : MAJOR_SCALE;
    const chordDegrees = isDarkTone ? DARK_CHORD_DEGREES : CHORD_DEGREES;
    const chordIntervals = isDarkTone ? MINOR_CHORD : MAJOR_CHORD;
    const scale = scaleIntervals.map((i) => rootMidi + i);

    const dynamicMap = { soft: -12, normal: -8, strong: -4 };
    const instrumentOsc = {
      band: 'triangle',
      piano_trio: 'sine',
      electro_synth: 'sawtooth',
      orchestral: 'triangle',
      groove_band: 'square',
    };

    const chordSynth = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: instrumentOsc[resolvedOptions.instrumentation] || 'triangle' },
      envelope: { attack: 0.01, decay: 0.08, sustain: 0.45, release: 0.15 },
      volume: -12,
    }).toDestination();

    const melodySynth = new Tone.Synth({
      oscillator: { type: resolvedOptions.mood === 'bright' ? 'square' : (instrumentOsc[resolvedOptions.instrumentation] || 'triangle') },
      envelope: { attack: 0.005, decay: 0.05, sustain: 0.35, release: 0.08 },
      volume: dynamicMap[resolvedOptions.dynamics] ?? -8,
    }).toDestination();

    const bassSynth = new Tone.MonoSynth({
      oscillator: { type: resolvedOptions.instrumentation === 'piano_trio' ? 'triangle' : 'square' },
      filter: { Q: 1, type: 'lowpass', rolloff: -12 },
      envelope: { attack: 0.005, decay: 0.12, sustain: 0.3, release: 0.08 },
      filterEnvelope: { attack: 0.001, decay: 0.08, sustain: 0.2, release: 0.05, baseFrequency: 120, octaves: 2 },
      volume: -10,
    }).toDestination();

    const drumVolMap = { soft: -16, normal: -9, strong: -4 };
    const drumAdjustment = resolvedOptions.instrumentation === 'orchestral' ? -5 : 0;
    const kickSynth = new Tone.MembraneSynth({ volume: (drumVolMap[resolvedOptions.dynamics] ?? -9) + drumAdjustment }).toDestination();
    const snareSynth = new Tone.NoiseSynth({
      noise: { type: 'white' },
      envelope: { attack: 0.001, decay: 0.15, sustain: 0, release: 0.05 },
      volume: (drumVolMap[resolvedOptions.dynamics] ?? -9) - 6 + drumAdjustment,
    }).toDestination();
    const hihatSynth = new Tone.MetalSynth({
      frequency: 400,
      envelope: { attack: 0.001, decay: 0.05, release: 0.01 },
      harmonicity: 5.1,
      modulationIndex: 32,
      resonance: 4000,
      octaves: 1.5,
      volume: (drumVolMap[resolvedOptions.dynamics] ?? -9) - 10 + drumAdjustment,
    }).toDestination();

    analyserRef.current = new Tone.Analyser('waveform', 256);
    chordSynth.connect(analyserRef.current);
    melodySynth.connect(analyserRef.current);
    bassSynth.connect(analyserRef.current);
    synthsRef.current = [chordSynth, melodySynth, bassSynth, kickSynth, snareSynth, hihatSynth];

    const seqEvents = [];
    const hookPattern = [0, 3, 5, 3, 7, 5, 3, 2];
    const quarter = Tone.Time('4n').toSeconds();
    const eighth = Tone.Time('8n').toSeconds();

    const variationMap = { low: 0, medium: 1, high: 2 };
    const complexityBase = { simple: 2, normal: 4, complex: 8 };
    const notesPerBar = Math.min(12, complexityBase[resolvedOptions.complexity] + variationMap[resolvedOptions.variation]);

    const shouldHitHiHat = (beatIndex) => {
      const rhythmStyle = resolvedOptions.rhythm_style;
      const randomValue = random();
      const styleChance = {
        straight: 1,
        swing: beatIndex % 2 === 1 ? 0.78 : 1,
        syncopated: beatIndex % 2 === 0 ? 0.62 : 1,
        triplet: 0.86,
        pulse: [1, 3].includes(beatIndex) ? 0.7 : 1,
      };
      return randomValue <= (styleChance[rhythmStyle] ?? 1);
    };

    for (let bar = 0; bar < bars; bar++) {
      const degree = chordDegrees[bar % chordDegrees.length];
      const chordRoot = rootMidi + degree;
      const chordNotes = chordIntervals.map((i) => Tone.Frequency(chordRoot + i, 'midi').toNote());
      const barTime = `${bar}m`;

      seqEvents.push({ time: barTime, fn: () => chordSynth.triggerAttackRelease(chordNotes, '2n') });

      const noteUnit = notesPerBar <= 2 ? '2n' : notesPerBar >= 8 ? '16n' : '4n';
      const stepDuration = Tone.Time('1m').toSeconds() / notesPerBar;
      for (let step = 0; step < notesPerBar; step++) {
        const styleNote = resolvedOptions.genre === 'Game OST' || resolvedOptions.mood === 'mysterious'
          ? chordRoot + hookPattern[(step + bar) % hookPattern.length] + (resolvedOptions.variation === 'high' ? Math.round(random() * 2) - 1 : 0)
          : scale[Math.floor(random() * scale.length)];
        const noteFreq = Tone.Frequency(styleNote, 'midi').toNote();
        const stepTime = Tone.Time(`${bar}m`).toSeconds() + step * stepDuration;
        seqEvents.push({ time: stepTime, fn: () => melodySynth.triggerAttackRelease(noteFreq, noteUnit) });
      }

      [0, 2].forEach((beatIndex) => {
        const bassTime = Tone.Time(`${bar}m`).toSeconds() + beatIndex * quarter;
        const bassNote = Tone.Frequency(chordRoot - 12, 'midi').toNote();
        seqEvents.push({ time: bassTime, fn: () => bassSynth.triggerAttackRelease(bassNote, '8n') });
      });

      for (let beat = 0; beat < 4; beat++) {
        const tSec = Tone.Time(`${bar}m`).toSeconds() + beat * quarter;
        if (!(resolvedOptions.dynamics === 'soft' && beat === 3) && shouldHitHiHat(beat)) {
          seqEvents.push({ time: tSec, fn: () => hihatSynth.triggerAttackRelease('32n') });
        }
        if (beat === 0 || beat === 2) seqEvents.push({ time: tSec, fn: () => kickSynth.triggerAttackRelease('C1', '8n') });
        if (beat === 1 || beat === 3) seqEvents.push({ time: tSec, fn: () => snareSynth.triggerAttackRelease('8n') });
        if (resolvedOptions.complexity !== 'simple' && resolvedOptions.rhythm_style !== 'straight') {
          const offSec = tSec + eighth;
          seqEvents.push({ time: offSec, fn: () => hihatSynth.triggerAttackRelease('32n') });
        }
      }
    }

    const part = new Tone.Part((time, ev) => {
      ev.fn();
    }, seqEvents.map((e) => [e.time, e]));

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
    setPhase(WORKFLOW_PHASES.PLAYING);
    drawWave();

    if (!selectedLength.isLoop) {
      const totalSecs = Tone.Time(`${bars}m`).toSeconds();
      setTimeout(() => {
        cleanupAudio();
        setPhase(WORKFLOW_PHASES.READY);
      }, (totalSecs + 1) * 1000);
    }
  }, [cleanupAudio, drawWave]);

  const applyPreset = (preset) => {
    setOptions({ ...preset.settings });
  };

  const handleGenerate = async () => {
    const optionsSnapshot = { ...options, bpm: effectiveBpm };
    const seed = createSeed();

    clearCurrentComposition();
    setPhase(WORKFLOW_PHASES.GENERATING);

    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...optionsSnapshot, seed }),
      });
      if (!res.ok) throw new Error('서버 오류');

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const name = getDownloadName(res, `music_${optionsSnapshot.key}_${optionsSnapshot.bpm}bpm.mid`);
      const backendSeed = Number(res.headers.get('X-Generation-Seed') || seed);
      const backendParams = res.headers.get('X-Generation-Params') || '';

      setMidiUrl(url);
      setMidiName(name);
      const generatedSong = { options: optionsSnapshot, seed: backendSeed, params: backendParams };
      setCurrentSong(generatedSong);
      setLastSeed(backendSeed);
      setLastParams(backendParams);
      setPhase(WORKFLOW_PHASES.READY);

      await playLocally(generatedSong);
    } catch {
      setPhase(WORKFLOW_PHASES.ERROR);
    }
  };

  const handlePlay = () => {
    if (!currentSong) return;
    if (phase === WORKFLOW_PHASES.PLAYING) stopPlayback();
    else playLocally(currentSong);
  };

  const handleDownload = () => {
    if (!midiUrl) return;
    const link = document.createElement('a');
    link.href = midiUrl;
    link.download = midiName || 'generated_music.mid';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const canPlay = !!currentSong && phase !== WORKFLOW_PHASES.GENERATING;
  const canDownload = !!midiUrl && phase !== WORKFLOW_PHASES.GENERATING;

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
          <div className="control-group">
            <label>템포 (BPM) <span className="val">{effectiveBpm}</span></label>
            <input
              type="range"
              min={50}
              max={180}
              value={options.bpm}
              onChange={(e) => updateOption('bpm', Number(e.target.value))}
            />
            {options.genre === 'Game OST' && (
              <p className="helper-text">Game OST는 80–100 BPM으로 자동 정리되어 차분한 게임 루프 제작에 맞춰집니다.</p>
            )}
          </div>

          <div className="control-group">
            <label>키 (Key)</label>
            <div className="btn-group">
              {KEYS.map((k) => (
                <button key={k} className={options.key === k ? 'active' : ''} onClick={() => updateOption('key', k)}>{k}</button>
              ))}
            </div>
          </div>

          <div className="control-group">
            <label>스케일</label>
            <div className="btn-group">
              {SCALES.map((s) => (
                <button key={s.value} className={options.scale === s.value ? 'active' : ''} onClick={() => updateOption('scale', s.value)}>{s.label}</button>
              ))}
            </div>
          </div>

          <div className="control-group">
            <label>장르</label>
            <div className="btn-group">
              {GENRES.map((g) => (
                <button key={g} className={options.genre === g ? 'active' : ''} onClick={() => updateOption('genre', g)}>{g}</button>
              ))}
            </div>
          </div>

          <div className="control-group">
            <label>리듬 스타일</label>
            <div className="btn-group">
              {RHYTHM_STYLES.map((style) => (
                <button
                  key={style.value}
                  className={options.rhythm_style === style.value ? 'active' : ''}
                  onClick={() => updateOption('rhythm_style', style.value)}
                >
                  {style.label}
                </button>
              ))}
            </div>
          </div>

          <div className="control-group">
            <label>악기 편성</label>
            <div className="btn-group">
              {INSTRUMENTATIONS.map((instrument) => (
                <button
                  key={instrument.value}
                  className={options.instrumentation === instrument.value ? 'active' : ''}
                  onClick={() => updateOption('instrumentation', instrument.value)}
                >
                  {instrument.label}
                </button>
              ))}
            </div>
          </div>

          <div className="control-group">
            <label>길이</label>
            <div className="btn-group">
              {LENGTH_MODES.map((mode) => (
                <button
                  key={mode.value}
                  className={options.length_mode === mode.value ? 'active' : ''}
                  onClick={() => updateOption('length_mode', mode.value)}
                >
                  {mode.label} ({mode.approx})
                </button>
              ))}
            </div>
          </div>

          <div className="control-group">
            <label>섹션 반복 수 <span className="val">{options.section_repeats}</span></label>
            <input
              type="range"
              min={1}
              max={8}
              value={options.section_repeats}
              onChange={(e) => updateOption('section_repeats', Number(e.target.value))}
            />
          </div>

          <div className="control-group">
            <label>무드</label>
            <div className="btn-group">
              {MOODS.map((option) => (
                <button
                  key={option.value}
                  className={options.mood === option.value ? 'active' : ''}
                  onClick={() => updateOption('mood', option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <div className="control-group">
            <label>리듬 복잡도</label>
            <div className="btn-group">
              {COMPLEXITIES.map((option) => (
                <button
                  key={option.value}
                  className={options.complexity === option.value ? 'active' : ''}
                  onClick={() => updateOption('complexity', option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <div className="control-group">
            <label>변화량 (Variation)</label>
            <div className="btn-group">
              {VARIATIONS.map((option) => (
                <button
                  key={option.value}
                  className={options.variation === option.value ? 'active' : ''}
                  onClick={() => updateOption('variation', option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <div className="control-group">
            <label>다이내믹</label>
            <div className="btn-group">
              {DYNAMICS.map((option) => (
                <button
                  key={option.value}
                  className={options.dynamics === option.value ? 'active' : ''}
                  onClick={() => updateOption('dynamics', option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <div className="control-group">
            <label>유명곡 레퍼런스 스타일</label>
            <select
              className="select-control"
              value={options.reference_style}
              onChange={(e) => updateOption('reference_style', e.target.value)}
            >
              {REFERENCE_STYLES.map((reference) => (
                <option key={reference.value} value={reference.value}>{reference.label}</option>
              ))}
            </select>
            <p className="helper-text">
              {REFERENCE_STYLES.find((reference) => reference.value === options.reference_style)?.note}
              {' '}원곡 멜로디/리프를 복제하지 않고 분위기·리듬·구성 특징만 반영합니다.
            </p>
          </div>
        </section>

        <canvas ref={canvasRef} className="waveform" width={600} height={100} />

        <div className="actions">
          <button
            className="btn-generate"
            onClick={handleGenerate}
            disabled={phase === WORKFLOW_PHASES.GENERATING}
          >
            {phase === WORKFLOW_PHASES.GENERATING ? '생성 중…' : '🎵 곡 만들기'}
          </button>

          <button
            className="btn-new"
            onClick={handleGenerate}
            disabled={phase === WORKFLOW_PHASES.GENERATING}
          >
            ✨ 새로운 곡 만들기
          </button>

          <button
            className="btn-play"
            onClick={handlePlay}
            disabled={!canPlay}
          >
            {phase === WORKFLOW_PHASES.PLAYING ? '⏹ 정지' : '▶ 재생'}
          </button>

          <button
            className={`btn-download ${canDownload ? '' : 'disabled'}`}
            onClick={handleDownload}
            disabled={!canDownload}
          >
            ⬇ MIDI 파일로 저장
          </button>
        </div>

        {lastSeed && (
          <p className="helper-text state-log">
            최근 생성 seed: {lastSeed}<br />
            최근 생성 파라미터: {lastParams}
          </p>
        )}

        <section className="export-card">
          <h2>내보낸 뒤 이렇게 진행하세요</h2>
          <ol>
            <li>MIDI를 Ableton Live로 가져옵니다.</li>
            <li>멜로디는 square/triangle 계열, 베이스는 단순 루트음, 드럼은 노이즈 계열로 교체합니다.</li>
            <li>루프가 자연스럽게 이어지면 WAV/OGG로 렌더링해 게임에 넣습니다.</li>
          </ol>
        </section>

        {phase === WORKFLOW_PHASES.ERROR && (
          <p className="error-msg">⚠ 백엔드 연결 오류 — 서버가 실행 중인지 확인하세요.</p>
        )}
      </main>
    </div>
  );
}
