from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
import io
import os
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
    genre = data.get('genre', 'Pop')
    length_mode = data.get('length_mode', '1min')
    mood = data.get('mood', 'bright')
    complexity = data.get('complexity', 'normal')
    dynamics = data.get('dynamics', 'normal')

    # Clamp values
    bpm  = max(60, min(180, bpm))
    if key not in ('C', 'D', 'E', 'F', 'G', 'A', 'B'):
        key = 'C'
    if genre not in ('Ambient', 'Electronic', 'Hip-Hop', 'Pop', 'Game OST'):
        genre = 'Pop'
    if length_mode not in ('1min', '3min', 'loop'):
        length_mode = '1min'
    if mood not in ('bright', 'dark', 'mysterious'):
        mood = 'bright'
    if complexity not in ('simple', 'normal', 'complex'):
        complexity = 'normal'
    if dynamics not in ('soft', 'normal', 'strong'):
        dynamics = 'normal'

    midi_bytes = generate_midi(bpm, key, genre, length_mode, mood, complexity, dynamics)

    return send_file(
        io.BytesIO(midi_bytes),
        mimetype='audio/midi',
        as_attachment=True,
        download_name=f'music_{key}_{bpm}bpm.mid',
    )


if __name__ == '__main__':
    debug = os.getenv('FLASK_DEBUG', 'false').lower() == 'true'
    app.run(debug=debug, port=5000)
