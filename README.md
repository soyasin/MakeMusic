# MakeMusic 🎵

웹 기반 AI 음악 생성기 — 템포, 키, 장르, 길이를 설정하고 MIDI 음악을 생성하세요.

## 프로젝트 구조

```
MakeMusic/
├── frontend/          # React + Vite
│   ├── src/
│   │   ├── App.jsx
│   │   ├── App.css
│   │   ├── main.jsx
│   │   └── index.css
│   ├── index.html
│   ├── package.json
│   └── vite.config.js
├── backend/           # Python + Flask
│   ├── app.py
│   ├── music_generator.py
│   └── requirements.txt
└── README.md
```

## 시작하기

### 백엔드 실행

```bash
cd backend
pip install -r requirements.txt
python app.py
```

서버가 `http://localhost:5000` 에서 실행됩니다.

> ⚠️ **주의**: 개발 서버는 로컬 개발 전용입니다. `FLASK_DEBUG=true` 환경변수는 로컬에서만 사용하세요. 프로덕션 배포 시 절대 사용하지 마세요.

### 프론트엔드 실행

```bash
cd frontend
npm install
npm run dev
```

브라우저에서 `http://localhost:3000` 을 열어주세요.

## 기능

| 기능 | 설명 |
|------|------|
| 템포 (BPM) | 60–180 BPM 슬라이더 |
| 키 | C, D, E, F, G, A, B |
| 장르 | Ambient, Electronic, Hip-Hop, Pop, Game OST |
| 길이 | 1분, 3분, 루프형 |
| 재생 | Tone.js 를 통한 브라우저 내 실시간 재생 |
| 파형 시각화 | Canvas 기반 실시간 웨이브폼 |
| MIDI 다운로드 | Ableton Live 등에 임포트 가능한 `.mid` 파일 |

## Ableton 연동

1. **음악 생성** 클릭 → MIDI 파일 자동 생성
2. **MIDI 다운로드** 버튼으로 `.mid` 파일 저장
3. Ableton Live 에 드래그 & 드롭
