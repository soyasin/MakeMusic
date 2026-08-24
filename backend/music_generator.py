import mido
from mido import MidiFile, MidiTrack, Message, MetaMessage
import io
import random
from typing import Dict, Any, Optional

# Note numbers for each key (MIDI)
KEY_ROOT = {
    'C': 60, 'D': 62, 'E': 64, 'F': 65,
    'G': 67, 'A': 69, 'B': 71,
}

# Major scale intervals
MAJOR_SCALE = [0, 2, 4, 5, 7, 9, 11]
MINOR_SCALE = [0, 2, 3, 5, 7, 8, 10]

# Chord root offsets in semitones from key root
CHORD_PROGRESSION = [0, 5, 7, 0]
GAME_OST_PROGRESSION = [0, 8, 3, 10]

# Major chord intervals
MAJOR_CHORD = [0, 4, 7]
MINOR_CHORD = [0, 3, 7]

# Simple drum pattern (General MIDI channel 10, 0-indexed = ch 9)
KICK   = 36
SNARE  = 38
HIHAT  = 42

MOOD_PROFILES: Dict[str, Dict[str, Any]] = {
    'bright': {'dark_tone': False, 'melodic_bias': [0, 2, 4, 5, 7, 9, 11], 'velocity_offset': 6, 'drum_density': 1.0},
    'dark': {'dark_tone': True, 'melodic_bias': [0, 2, 3, 5, 7, 8, 10], 'velocity_offset': -4, 'drum_density': 1.0},
    'dreamy': {'dark_tone': False, 'melodic_bias': [0, 2, 4, 7, 9], 'velocity_offset': -6, 'drum_density': 0.75},
    'tense': {'dark_tone': True, 'melodic_bias': [0, 1, 3, 6, 8, 10], 'velocity_offset': 2, 'drum_density': 1.2},
    'lyrical': {'dark_tone': False, 'melodic_bias': [0, 2, 4, 5, 7, 9], 'velocity_offset': -2, 'drum_density': 0.9},
    'epic': {'dark_tone': True, 'melodic_bias': [0, 3, 5, 7, 10], 'velocity_offset': 8, 'drum_density': 1.15},
    'lofi': {'dark_tone': True, 'melodic_bias': [0, 2, 3, 5, 7], 'velocity_offset': -10, 'drum_density': 0.65},
    'jazz': {'dark_tone': False, 'melodic_bias': [0, 2, 4, 6, 7, 9, 11], 'velocity_offset': -1, 'drum_density': 0.95},
    'cinematic': {'dark_tone': True, 'melodic_bias': [0, 2, 3, 5, 7, 8, 10], 'velocity_offset': 4, 'drum_density': 1.05},
    'mysterious': {'dark_tone': True, 'melodic_bias': [0, 2, 3, 5, 7, 8, 10], 'velocity_offset': -1, 'drum_density': 0.9},
}

REFERENCE_STYLE_TRAITS: Dict[str, Dict[str, Any]] = {
    'none': {},
    'imagine': {'mood': 'lyrical', 'rhythm_style': 'swing', 'section_repeats': 2, 'variation': 'medium'},
    'billie_jean': {'mood': 'tense', 'rhythm_style': 'syncopated', 'instrumentation': 'groove_band', 'variation': 'high'},
    'canon': {'mood': 'epic', 'rhythm_style': 'straight', 'section_repeats': 3, 'variation': 'low'},
    'shape_of_you': {'mood': 'bright', 'rhythm_style': 'pulse', 'instrumentation': 'groove_band', 'variation': 'medium'},
    'interstellar': {'mood': 'cinematic', 'rhythm_style': 'triplet', 'instrumentation': 'orchestral', 'variation': 'medium'},
}

def _bars_from_length_mode(length_mode: str) -> int:
    if length_mode == '3min':
        return 90
    if length_mode == 'loop':
        return 16
    return 30


def _drum_should_hit(index: int, rhythm_style: str, rng: random.Random, density: float) -> bool:
    base_probability = {
        'straight': 1.0,
        'swing': 0.8 if index % 2 == 1 else 1.0,
        'syncopated': 0.65 if index % 2 == 0 else 1.0,
        'triplet': 0.85,
        'pulse': 0.7 if index in (1, 3, 5, 7) else 1.0,
    }.get(rhythm_style, 1.0)
    return rng.random() <= max(0.25, min(1.0, base_probability * density))


def _notes_per_bar(complexity: str, variation: str, rhythm_style: str) -> int:
    base = {'simple': 2, 'normal': 4, 'complex': 8}.get(complexity, 4)
    variation_bonus = {'low': 0, 'medium': 1, 'high': 2}.get(variation, 1)
    rhythm_bonus = 1 if rhythm_style in ('syncopated', 'triplet') else 0
    return min(12, max(2, base + variation_bonus + rhythm_bonus))


def _clamp_velocity(value: int) -> int:
    return max(0, min(127, int(value)))


def generate_midi(
    bpm: int,
    key: str,
    genre: str,
    length_mode: str,
    mood: str = 'bright',
    scale: str = 'major',
    rhythm_style: str = 'straight',
    instrumentation: str = 'band',
    section_repeats: int = 2,
    complexity: str = 'normal',
    variation: str = 'medium',
    dynamics: str = 'normal',
    reference_style: str = 'none',
    seed: Optional[int] = None,
) -> bytes:
    traits = REFERENCE_STYLE_TRAITS.get(reference_style, {})
    mood = traits.get('mood', mood)
    rhythm_style = traits.get('rhythm_style', rhythm_style)
    instrumentation = traits.get('instrumentation', instrumentation)
    section_repeats = int(traits.get('section_repeats', section_repeats))
    variation = traits.get('variation', variation)

    bars = _bars_from_length_mode(length_mode)
    bars *= max(1, min(8, section_repeats))
    if genre == 'Game OST':
        bpm = max(80, min(100, bpm))
    rng = random.Random(seed)

    ticks_per_beat = 480
    tempo = mido.bpm2tempo(bpm)  # microseconds per beat

    mid = MidiFile(ticks_per_beat=ticks_per_beat)

    # ---- Drum track ----
    drum_track = MidiTrack()
    mid.tracks.append(drum_track)
    drum_track.append(MetaMessage('set_tempo', tempo=tempo, time=0))
    drum_track.append(MetaMessage('track_name', name='Drums', time=0))

    beat = ticks_per_beat  # quarter note
    eighth = beat // 2

    # Build drum events with delta times
    events = []
    mood_profile = MOOD_PROFILES.get(mood, MOOD_PROFILES['bright'])
    drum_density = mood_profile['drum_density']
    drum_velocity_scale = {'soft': 0.7, 'normal': 1.0, 'strong': 1.25}.get(dynamics, 1.0)
    if instrumentation in ('orchestral', 'piano_trio'):
        drum_velocity_scale *= 0.65
    elif instrumentation in ('electro_synth', 'groove_band'):
        drum_velocity_scale *= 1.1
    for bar in range(bars):
        bar_start = bar * beat * 4
        for i in range(8):
            t = bar_start + i * eighth
            if _drum_should_hit(i, rhythm_style, rng, drum_density) and not (dynamics == 'soft' and i == 6):
                events.append((t,          'note_on',  9, HIHAT, _clamp_velocity(70 * drum_velocity_scale)))
                events.append((t + eighth - 1, 'note_off', 9, HIHAT, 0))
        for beat_num in [0, 2]:
            t = bar_start + beat_num * beat
            events.append((t,          'note_on',  9, KICK, _clamp_velocity(100 * drum_velocity_scale)))
            events.append((t + beat - 1, 'note_off', 9, KICK, 0))
        for beat_num in [1, 3]:
            t = bar_start + beat_num * beat
            events.append((t,          'note_on',  9, SNARE, _clamp_velocity(90 * drum_velocity_scale)))
            events.append((t + beat - 1, 'note_off', 9, SNARE, 0))

    events.sort(key=lambda x: x[0])
    prev = 0
    for ev in events:
        t, kind, ch, note, vel = ev
        delta = t - prev
        drum_track.append(Message(kind, channel=ch, note=note, velocity=vel, time=delta))
        prev = t

    drum_track.append(MetaMessage('end_of_track', time=0))

    # ---- Chord track ----
    chord_track = MidiTrack()
    mid.tracks.append(chord_track)
    chord_track.append(MetaMessage('track_name', name='Chords', time=0))

    root = KEY_ROOT.get(key, 60)
    dark_tone = mood_profile['dark_tone'] or genre == 'Game OST' or scale == 'minor'
    scale_intervals = MINOR_SCALE if scale == 'minor' else MAJOR_SCALE if scale == 'major' else (MINOR_SCALE if dark_tone else MAJOR_SCALE)
    chord_progression = GAME_OST_PROGRESSION if dark_tone else CHORD_PROGRESSION
    chord_intervals = MINOR_CHORD if dark_tone else MAJOR_CHORD
    chord_velocity = {'soft': 60, 'normal': 80, 'strong': 96}.get(dynamics, 80) + mood_profile['velocity_offset']
    chord_velocity = max(30, min(120, chord_velocity))

    chord_events = []
    for bar in range(bars):
        semitone_offset = chord_progression[bar % len(chord_progression)]
        chord_root = root + semitone_offset
        notes = [chord_root + i for i in chord_intervals]
        t_on = bar * beat * 4
        t_off = t_on + beat * 4 - 1
        for n in notes:
            chord_events.append((t_on,  'note_on',  0, n, chord_velocity))
            chord_events.append((t_off, 'note_off', 0, n, 0))

    chord_events.sort(key=lambda x: x[0])
    prev = 0
    for ev in chord_events:
        t, kind, ch, note, vel = ev
        delta = t - prev
        chord_track.append(Message(kind, channel=ch, note=note, velocity=vel, time=delta))
        prev = t
    chord_track.append(MetaMessage('end_of_track', time=0))

    # ---- Bass track ----
    bass_track = MidiTrack()
    mid.tracks.append(bass_track)
    bass_track.append(MetaMessage('track_name', name='Bass', time=0))

    bass_events = []
    bass_velocity = {'soft': 56, 'normal': 72, 'strong': 88}.get(dynamics, 72) + mood_profile['velocity_offset'] // 2
    bass_velocity = max(28, min(110, bass_velocity))
    for bar in range(bars):
        semitone_offset = chord_progression[bar % len(chord_progression)]
        bass_root = root + semitone_offset - 12
        for beat_num in [0, 2]:
            t_on = bar * beat * 4 + beat_num * beat
            t_off = t_on + eighth - 1
            bass_events.append((t_on, 'note_on', 2, bass_root, bass_velocity))
            bass_events.append((t_off, 'note_off', 2, bass_root, 0))

    bass_events.sort(key=lambda x: x[0])
    prev = 0
    for ev in bass_events:
        t, kind, ch, note, vel = ev
        delta = t - prev
        bass_track.append(Message(kind, channel=ch, note=note, velocity=vel, time=delta))
        prev = t
    bass_track.append(MetaMessage('end_of_track', time=0))

    # ---- Melody track ----
    melody_track = MidiTrack()
    mid.tracks.append(melody_track)
    melody_track.append(MetaMessage('track_name', name='Melody', time=0))

    melody_events = []
    game_ost_pattern = [0, 3, 5, 3, 7, 5, 3, 2]
    melody_velocity = {'soft': 64, 'normal': 82, 'strong': 100}.get(dynamics, 82) + mood_profile['velocity_offset']
    melody_velocity = max(35, min(120, melody_velocity))
    notes_per_bar = _notes_per_bar(complexity, variation, rhythm_style)
    for bar in range(bars):
        semitone_offset = chord_progression[bar % len(chord_progression)]
        chord_root = root + semitone_offset
        if genre == 'Game OST' or mood in ('mysterious', 'cinematic'):
            note_duration = (beat * 4) // notes_per_bar
            for step in range(notes_per_bar):
                jitter = rng.choice([0, 0, 1, -1]) if variation == 'high' else 0
                note = chord_root + game_ost_pattern[(step + bar) % len(game_ost_pattern)] + jitter
                t_on = bar * beat * 4 + step * note_duration
                t_off = t_on + note_duration - 1
                melody_events.append((t_on, 'note_on', 1, note, melody_velocity - 8))
                melody_events.append((t_off, 'note_off', 1, note, 0))
        else:
            available = [chord_root + i for i in mood_profile['melodic_bias'] if i in scale_intervals or scale == 'minor']
            if not available:
                available = [chord_root + i for i in scale_intervals if 0 <= i <= 12]
            note_duration = (beat * 4) // notes_per_bar
            for beat_i in range(notes_per_bar):
                note = rng.choice(available)
                t_on  = bar * beat * 4 + beat_i * note_duration
                t_off = t_on + note_duration - 1
                melody_events.append((t_on,  'note_on',  1, note, melody_velocity))
                melody_events.append((t_off, 'note_off', 1, note, 0))

    melody_events.sort(key=lambda x: x[0])
    prev = 0
    for ev in melody_events:
        t, kind, ch, note, vel = ev
        delta = t - prev
        melody_track.append(Message(kind, channel=ch, note=note, velocity=vel, time=delta))
        prev = t
    melody_track.append(MetaMessage('end_of_track', time=0))

    buf = io.BytesIO()
    mid.save(file=buf)
    return buf.getvalue()
