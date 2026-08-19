import mido
from mido import MidiFile, MidiTrack, Message, MetaMessage
import io
import random

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

def _bars_from_length_mode(length_mode: str) -> int:
    if length_mode == '3min':
        return 90
    if length_mode == 'loop':
        return 100
    return 30


def generate_midi(
    bpm: int,
    key: str,
    genre: str,
    length_mode: str,
    mood: str = 'bright',
    complexity: str = 'normal',
    dynamics: str = 'normal',
) -> bytes:
    bars = _bars_from_length_mode(length_mode)
    if genre == 'Game OST':
        bpm = max(80, min(100, bpm))

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
    drum_velocity_scale = {'soft': 0.7, 'normal': 1.0, 'strong': 1.25}.get(dynamics, 1.0)
    for bar in range(bars):
        bar_start = bar * beat * 4
        for i in range(8):
            t = bar_start + i * eighth
            if not (dynamics == 'soft' and i == 6):
                events.append((t,          'note_on',  9, HIHAT, int(70 * drum_velocity_scale)))
                events.append((t + eighth - 1, 'note_off', 9, HIHAT, 0))
        for beat_num in [0, 2]:
            t = bar_start + beat_num * beat
            events.append((t,          'note_on',  9, KICK, int(100 * drum_velocity_scale)))
            events.append((t + beat - 1, 'note_off', 9, KICK, 0))
        for beat_num in [1, 3]:
            t = bar_start + beat_num * beat
            events.append((t,          'note_on',  9, SNARE, int(90 * drum_velocity_scale)))
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
    dark_tone = genre == 'Game OST' or mood in ('dark', 'mysterious')
    scale_intervals = MINOR_SCALE if dark_tone else MAJOR_SCALE
    chord_progression = GAME_OST_PROGRESSION if dark_tone else CHORD_PROGRESSION
    chord_intervals = MINOR_CHORD if dark_tone else MAJOR_CHORD
    scale = [root + i for i in scale_intervals]
    chord_velocity = {'soft': 60, 'normal': 80, 'strong': 96}.get(dynamics, 80)

    chord_events = []
    beats_per_chord = 4  # one chord per bar (4/4)
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

    # ---- Melody track ----
    melody_track = MidiTrack()
    mid.tracks.append(melody_track)
    melody_track.append(MetaMessage('track_name', name='Melody', time=0))

    melody_events = []
    game_ost_pattern = [0, 3, 5, 3]
    melody_velocity = {'soft': 64, 'normal': 82, 'strong': 100}.get(dynamics, 82)
    for bar in range(bars):
        semitone_offset = chord_progression[bar % len(chord_progression)]
        chord_root = root + semitone_offset
        if genre == 'Game OST' or mood == 'mysterious':
            notes_per_bar = 4 if complexity != 'complex' else 8
            note_duration = (beat * 4) // notes_per_bar
            for step in range(notes_per_bar):
                note = chord_root + game_ost_pattern[step % len(game_ost_pattern)]
                t_on = bar * beat * 4 + step * note_duration
                t_off = t_on + note_duration - 1
                melody_events.append((t_on, 'note_on', 1, note, melody_velocity - 8))
                melody_events.append((t_off, 'note_off', 1, note, 0))
        else:
            available = [chord_root + i for i in scale_intervals if 0 <= i <= 12]
            notes_per_bar = 2 if complexity == 'simple' else 8 if complexity == 'complex' else 4
            note_duration = (beat * 4) // notes_per_bar
            for beat_i in range(notes_per_bar):
                note = random.choice(available)
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
