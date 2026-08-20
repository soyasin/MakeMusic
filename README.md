# MakeMusic 🎵

웹 기반 AI 음악 생성기 — 템포, 키, 장르, 길이를 설정하고 MIDI 음악을 생성하세요.

기본 사용 시나리오는 **16비트 게임 음악용 MIDI 스케치 제작**입니다. MakeMusic에서 루프형 아이디어를 만든 뒤, Ableton Live 같은 DAW에서 칩튠/레트로 음색으로 다시 디자인하는 흐름을 권장합니다.

## 프로젝트 구조

```
MakeMusic/
├── frontend/          # React + Vite
│   ├── src/
│   │   ├── App.jsx
│   │   ├── App.css
│   │   ├── main.jsx
│   │   └── index.css
│   ├── index.html         # MakeMusic 페이지 엔트리
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
| 무드 | 밝음, 어두움, 신비로움 |
| 리듬 복잡도 | 심플, 보통, 복잡 |
| 다이내믹 | 부드럽게, 보통, 강하게 |
| 재생 | Tone.js 를 통한 브라우저 내 실시간 재생 |
| 파형 시각화 | Canvas 기반 실시간 웨이브폼 |
| MIDI 다운로드 | Ableton Live 등에 임포트 가능한 `.mid` 파일 |
| 게임 음악 프리셋 | 필드 / 전투 / 메뉴·마을용 루프 시작점 |
| 멀티트랙 MIDI | Drums / Chords / Bass / Melody 트랙 분리 |

## Ableton 연동

1. **음악 생성** 클릭 → MIDI 파일 자동 생성
2. **MIDI 다운로드** 버튼으로 `.mid` 파일 저장
3. Ableton Live 에 드래그 & 드롭
4. MIDI를 사각파/삼각파 리드, 단순 베이스, 노이즈 드럼으로 교체
5. 루프가 자연스럽게 이어지면 WAV/OGG 로 렌더링 후 게임에 삽입

## 16비트 게임 음악 작업 흐름

1. **루프형** 길이로 필드/전투/메뉴용 짧은 시안을 만듭니다.
2. 장르는 **Game OST**를 기본으로 사용하고, BPM은 80–100 범위에서 정리합니다.
3. MakeMusic에서는 구조, 리듬, 반복 훅을 잡고 최종 사운드는 DAW에서 만듭니다.
4. 내려받은 MIDI의 **Drums / Chords / Bass / Melody** 트랙을 기준으로 음색을 입힙니다.
5. 최종 결과물은 MIDI보다 **루프 가능한 WAV/OGG**로 관리하는 것을 권장합니다.
