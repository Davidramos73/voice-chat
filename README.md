# English with Maya - SwitchOnSchool

Real-time AI English teacher for B2 level practice, powered by OpenAI's Realtime WebRTC API.

## Features

- Real-time voice conversation with Maya, your AI English teacher
- Specializes in helping Spanish speakers reach B2 level
- Gentle grammar and pronunciation corrections
- B2-level vocabulary introduction
- WebRTC-based audio streaming
- Modern UI styled for SwitchOnSchool

## Quick Start

1. **Navigate to the project:**
   ```bash
   cd /home/david/Repos/aiCycle/voice-chat-mvp
   ```

2. **Configure environment:**
   ```bash
   cp .env.example .env
   # Edit .env and add your OpenAI API key
   ```

3. **Activate virtual environment and run:**
   ```bash
   source venv/bin/activate
   python -m uvicorn app.main:app --reload --port 8000
   ```

4. **Open in browser:**
   - Navigate to `http://localhost:8000`
   - Login with `admin` / `admin123`
   - Click the microphone button and start practicing English!

## Requirements

- Python 3.8+
- OpenAI API key with Realtime API access
- Modern browser with WebRTC support
- Microphone

## Maya - Your English Teacher

Maya is configured to:
- Speak at B2-appropriate pace
- Correct mistakes by naturally rephrasing
- Introduce B2-level vocabulary and phrasal verbs
- Encourage longer responses with follow-up questions
- Keep a warm, supportive teaching style

## Project Structure

```
voice-chat-mvp/
├── app/
│   ├── main.py              # FastAPI backend
│   ├── static/
│   │   ├── css/
│   │   │   └── styles.css   # SwitchOnSchool themed styles
│   │   └── js/
│   │       ├── auth.js      # Login logic
│   │       └── chat.js      # WebRTC client
│   └── templates/
│       ├── login.html       # Login page
│       └── chat.html        # Chat interface
├── venv/                    # Python virtual environment
├── .env                     # Configuration
├── .env.example             # Example configuration
├── requirements.txt         # Python dependencies
└── README.md
```

## API Endpoints

- `GET /` - Redirect to login or chat
- `GET /login` - Login page
- `POST /api/login` - Authenticate user
- `GET /chat` - Chat interface (requires auth)
- `GET /api/config` - Get chat configuration
- `POST /api/realtime-proxy` - Proxy SDP to OpenAI
- `POST /api/logout` - Clear session

---

Powered by [SwitchOnSchool](https://www.switchonschool.com/)
