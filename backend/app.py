from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
import io
import os
import random
from music_generator import generate_midi

app = Flask(__name__)
CORS(app)


@app.route('/api/health', methods=['GET'])
def health():
    return jsonify({'status': 'ok'})


@app.route('/api/generate', methods=['POST'])
def generate():
    data = request.get_json(force=True)
    bpm   = int(data.get('bpm', 120))
    key   = data.get('key', 'C')
    scale = data.get('scale', 'major')
    genre = data.get('genre', 'Pop')
    rhythm_style = data.get('rhythm_style', 'straight')
    instrumentation = data.get('instrumentation', 'band')
    section_repeats = int(data.get('section_repeats', 2))
    length_mode = data.get('length_mode', '1min')
    mood = data.get('mood', 'bright')
    complexity = data.get('complexity', 'normal')
    variation = data.get('variation', 'medium')
    dynamics = data.get('dynamics', 'normal')
    reference_style = data.get('reference_style', 'none')
    seed = data.get('seed')
    if seed is None:
        seed = random.randint(1, 2_147_483_647)
    seed = int(seed)

    # Clamp values
    bpm  = max(60, min(180, bpm))
    if key not in ('C', 'D', 'E', 'F', 'G', 'A', 'B'):
        key = 'C'
    if scale not in ('major', 'minor'):
        scale = 'major'
    if genre not in ('Ambient', 'Electronic', 'Hip-Hop', 'Pop', 'Game OST', 'Jazz', 'Lofi', 'Cinematic'):
        genre = 'Pop'
    if rhythm_style not in ('straight', 'swing', 'syncopated', 'triplet', 'pulse'):
        rhythm_style = 'straight'
    if instrumentation not in ('band', 'piano_trio', 'electro_synth', 'orchestral', 'groove_band'):
        instrumentation = 'band'
    section_repeats = max(1, min(8, section_repeats))
    if length_mode not in ('1min', '3min', 'loop'):
        length_mode = '1min'
    if mood not in ('bright', 'dark', 'dreamy', 'tense', 'lyrical', 'epic', 'lofi', 'jazz', 'cinematic', 'mysterious'):
        mood = 'bright'
    if complexity not in ('simple', 'normal', 'complex'):
        complexity = 'normal'
    if variation not in ('low', 'medium', 'high'):
        variation = 'medium'
    if dynamics not in ('soft', 'normal', 'strong'):
        dynamics = 'normal'
    if reference_style not in ('none', 'imagine', 'billie_jean', 'canon', 'shape_of_you', 'interstellar'):
        reference_style = 'none'

    midi_bytes = generate_midi(
        bpm, key, genre, length_mode,
        mood=mood, scale=scale, rhythm_style=rhythm_style, instrumentation=instrumentation,
        section_repeats=section_repeats, complexity=complexity, variation=variation,
        dynamics=dynamics, reference_style=reference_style, seed=seed
    )

    response = send_file(
        io.BytesIO(midi_bytes),
        mimetype='audio/midi',
        as_attachment=True,
        download_name=f'music_{key}_{bpm}bpm.mid',
    )
    response.headers['X-Generation-Seed'] = str(seed)
    response.headers['X-Generation-Params'] = (
        f"mood={mood};scale={scale};genre={genre};rhythm={rhythm_style};inst={instrumentation};"
        f"length={length_mode};repeats={section_repeats};complexity={complexity};variation={variation};"
        f"dynamics={dynamics};reference={reference_style}"
    )
    return response


if __name__ == '__main__':
    debug = os.getenv('FLASK_DEBUG', 'false').lower() == 'true'
    app.run(debug=debug, port=5000)
