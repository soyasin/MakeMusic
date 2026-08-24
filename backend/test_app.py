import unittest

from app import app


class GenerateApiTests(unittest.TestCase):
    def setUp(self):
        self.client = app.test_client()

    def test_generation_headers_reflect_payload(self):
        payload = {
            'bpm': 96,
            'key': 'C',
            'scale': 'minor',
            'genre': 'Pop',
            'rhythm_style': 'syncopated',
            'instrumentation': 'groove_band',
            'length_mode': 'loop',
            'section_repeats': 3,
            'mood': 'tense',
            'complexity': 'complex',
            'variation': 'high',
            'dynamics': 'strong',
            'reference_style': 'none',
            'seed': 123456,
        }
        response = self.client.post('/api/generate', json=payload)

        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data)
        self.assertEqual(response.headers.get('X-Generation-Seed'), '123456')
        params_header = response.headers.get('X-Generation-Params')
        self.assertIn('mood=tense', params_header)
        self.assertIn('rhythm=syncopated', params_header)
        self.assertIn('repeats=3', params_header)

    def test_different_seed_changes_midi_output(self):
        payload = {
            'bpm': 104,
            'key': 'D',
            'scale': 'major',
            'genre': 'Electronic',
            'rhythm_style': 'triplet',
            'instrumentation': 'electro_synth',
            'length_mode': 'loop',
            'section_repeats': 2,
            'mood': 'dreamy',
            'complexity': 'normal',
            'variation': 'high',
            'dynamics': 'normal',
            'reference_style': 'none',
        }

        first = self.client.post('/api/generate', json={**payload, 'seed': 101})
        second = self.client.post('/api/generate', json={**payload, 'seed': 202})

        self.assertEqual(first.status_code, 200)
        self.assertEqual(second.status_code, 200)
        self.assertNotEqual(first.data, second.data)


if __name__ == '__main__':
    unittest.main()
