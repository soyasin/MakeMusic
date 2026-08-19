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

# I-IV-V-I chord progression degrees (0-indexed)
CHORD_PROGRESSION = [0, 3, 4, 0]  # I, IV, V, I

# Major chord intervals
MAJOR_CHORD = [0, 4, 7]

# Simple drum pattern (General MIDI channel 10, 0-indexed = ch 9)
KICK   = 36
SNARE  = 38
HIHAT  = 42

def _ticks_per_beat(bpm, desired_ms=500):
    return 480  # standard

def generate_midi(bpm: int, key: str, genre: str, bars: int) -> bytes:
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
    for bar in range(bars):
        bar_start = bar * beat * 4
        for i in range(8):
            t = bar_start + i * eighth
            events.append((t,          'note_on',  9, HIHAT, 70))
            events.append((t + eighth - 1, 'note_off', 9, HIHAT, 0))
        for beat_num in [0, 2]:
            t = bar_start + beat_num * beat
            events.append((t,          'note_on',  9, KICK, 100))
            events.append((t + beat - 1, 'note_off', 9, KICK, 0))
        for beat_num in [1, 3]:
            t = bar_start + beat_num * beat
            events.append((t,          'note_on',  9, SNARE, 90))
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
    scale = [root + i for i in MAJOR_SCALE]

    chord_events = []
    beats_per_chord = 4  # one chord per bar (4/4)
    for bar in range(bars):
        degree = CHORD_PROGRESSION[bar % len(CHORD_PROGRESSION)]
        chord_root = scale[degree]
        notes = [chord_root + i for i in MAJOR_CHORD]
        t_on = bar * beat * 4
        t_off = t_on + beat * 4 - 1
        for n in notes:
            chord_events.append((t_on,  'note_on',  0, n, 80))
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
    for bar in range(bars):
        degree = CHORD_PROGRESSION[bar % len(CHORD_PROGRESSION)]
        chord_root = scale[degree]
        # pick scale notes around chord root
        available = [chord_root + i for i in MAJOR_SCALE if 0 <= i <= 12]
        note_duration = beat  # quarter notes
        for beat_i in range(4):
            note = random.choice(available)
            t_on  = bar * beat * 4 + beat_i * beat
            t_off = t_on + note_duration - 1
            melody_events.append((t_on,  'note_on',  1, note, 90))
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
