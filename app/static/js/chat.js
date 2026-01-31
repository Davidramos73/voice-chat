// Voice Chat WebRTC Client
class VoiceChat {
    constructor() {
        this.peerConnection = null;
        this.dataChannel = null;
        this.audioElement = null;
        this.mediaStream = null;
        this.isConnected = false;
        this.isMicActive = false;
        this.config = null;

        // Track current conversation turn
        this.currentUserEntry = null;
        this.currentAssistantEntry = null;
        this.turnCounter = 0;

        // DOM elements
        this.micBtn = document.getElementById('mic-btn');
        this.micIcon = document.querySelector('.mic-icon');
        this.micOffIcon = document.querySelector('.mic-off-icon');
        this.micHint = document.getElementById('mic-hint');
        this.statusDot = document.querySelector('.status-dot');
        this.statusText = document.querySelector('.status-text');
        this.transcript = document.getElementById('transcript');
        this.visualizer = document.getElementById('visualizer');
        this.logoutBtn = document.getElementById('logout-btn');

        this.init();
    }

    async init() {
        // Setup logout button
        this.logoutBtn.addEventListener('click', () => this.logout());

        // Setup mic button
        this.micBtn.addEventListener('click', () => this.toggleMic());

        // Load config and connect
        await this.loadConfig();
        await this.connect();
    }

    async loadConfig() {
        try {
            const response = await fetch('/api/config');
            if (response.ok) {
                this.config = await response.json();
            } else {
                throw new Error('Failed to load config');
            }
        } catch (error) {
            console.error('Config load error:', error);
            this.updateStatus('error', 'Error de configuración');
        }
    }

    async connect() {
        this.updateStatus('connecting', 'Conectando...');

        try {
            // Get API key from backend
            const keyResponse = await fetch('/api/ephemeral-key');
            if (!keyResponse.ok) {
                throw new Error('Failed to get API key');
            }

            // Create peer connection
            this.peerConnection = new RTCPeerConnection();

            // Setup audio element for playback
            this.audioElement = document.createElement('audio');
            this.audioElement.autoplay = true;

            // Handle incoming audio track
            this.peerConnection.ontrack = (event) => {
                this.audioElement.srcObject = event.streams[0];
            };

            // Get microphone access
            this.mediaStream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                }
            });

            // Add audio track to peer connection (initially disabled)
            const audioTrack = this.mediaStream.getAudioTracks()[0];
            audioTrack.enabled = false;
            this.peerConnection.addTrack(audioTrack, this.mediaStream);

            // Create data channel for events
            this.dataChannel = this.peerConnection.createDataChannel('oai-events');
            this.setupDataChannel();

            // Create and set local description
            const offer = await this.peerConnection.createOffer();
            await this.peerConnection.setLocalDescription(offer);

            // Send SDP to OpenAI via our proxy
            const sdpResponse = await fetch('/api/realtime-proxy', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ sdp: offer.sdp })
            });

            if (!sdpResponse.ok) {
                throw new Error('Failed to establish WebRTC connection');
            }

            const answerSdp = await sdpResponse.text();

            // Set remote description
            await this.peerConnection.setRemoteDescription({
                type: 'answer',
                sdp: answerSdp
            });

            this.isConnected = true;
            this.updateStatus('connected', 'Conectado');
            this.micBtn.disabled = false;

        } catch (error) {
            console.error('Connection error:', error);
            this.updateStatus('error', 'Error de conexión');
            this.micBtn.disabled = true;
        }
    }

    setupDataChannel() {
        this.dataChannel.onopen = () => {
            this.sendSessionConfig();
        };

        this.dataChannel.onmessage = (event) => {
            const message = JSON.parse(event.data);
            this.handleServerMessage(message);
        };

        this.dataChannel.onerror = (error) => {
            console.error('Data channel error:', error);
        };

        this.dataChannel.onclose = () => {
            this.isConnected = false;
            this.updateStatus('disconnected', 'Desconectado');
        };
    }

    sendSessionConfig() {
        if (!this.dataChannel || this.dataChannel.readyState !== 'open') return;

        const sessionConfig = {
            type: 'session.update',
            session: {
                modalities: ['text', 'audio'],
                instructions: this.config?.system_prompt || 'Eres una asistente virtual amigable.',
                voice: this.config?.voice || 'coral',
                input_audio_format: 'pcm16',
                output_audio_format: 'pcm16',
                input_audio_transcription: {
                    model: 'whisper-1'
                },
                turn_detection: {
                    type: 'server_vad',
                    threshold: 0.5,
                    prefix_padding_ms: 300,
                    silence_duration_ms: 500
                }
            }
        };

        this.dataChannel.send(JSON.stringify(sessionConfig));
    }

    handleServerMessage(message) {
        switch (message.type) {
            case 'session.created':
            case 'session.updated':
                break;

            case 'input_audio_buffer.speech_started':
                this.updateStatus('listening', 'Escuchando...');
                this.setVisualizerActive(true);
                // Create placeholder for user message
                this.startUserTurn();
                break;

            case 'input_audio_buffer.speech_stopped':
                this.updateStatus('processing', 'Procesando...');
                break;

            case 'conversation.item.input_audio_transcription.completed':
                this.completeUserTurn(message.transcript);
                break;

            case 'response.audio_transcript.delta':
                // Append to assistant's response
                this.appendAssistantDelta(message.delta);
                break;

            case 'response.audio.delta':
                this.updateStatus('speaking', 'Maya está hablando...');
                this.setVisualizerActive(true, 'speaking');
                break;

            case 'response.audio.done':
            case 'response.done':
                if (this.isMicActive) {
                    this.updateStatus('listening', 'Escuchando...');
                } else {
                    this.updateStatus('connected', 'Conectado');
                }
                this.setVisualizerActive(false);
                this.finalizeAssistantTurn();
                break;

            case 'error':
                console.error('Server error:', message.error);
                this.updateStatus('error', 'Error: ' + (message.error?.message || 'Unknown'));
                break;
        }
    }

    removePlaceholder() {
        const placeholder = this.transcript.querySelector('.transcript-placeholder');
        if (placeholder) {
            placeholder.remove();
        }
    }

    startUserTurn() {
        this.removePlaceholder();
        this.turnCounter++;

        // Create user entry placeholder
        this.currentUserEntry = document.createElement('div');
        this.currentUserEntry.className = 'transcript-entry user pending';
        this.currentUserEntry.dataset.turn = this.turnCounter;
        this.currentUserEntry.innerHTML = `
            <span class="role">You:</span>
            <span class="text"><em>listening...</em></span>
        `;
        this.transcript.appendChild(this.currentUserEntry);

        // Pre-create assistant entry (will be filled when response comes)
        this.currentAssistantEntry = document.createElement('div');
        this.currentAssistantEntry.className = 'transcript-entry assistant streaming';
        this.currentAssistantEntry.dataset.turn = this.turnCounter;
        this.currentAssistantEntry.innerHTML = `
            <span class="role">Maya:</span>
            <span class="text"></span>
        `;
        this.transcript.appendChild(this.currentAssistantEntry);

        this.transcript.scrollTop = this.transcript.scrollHeight;
    }

    completeUserTurn(transcript) {
        // Find all pending user entries and get the last one
        const pendingEntries = this.transcript.querySelectorAll('.transcript-entry.user.pending');
        const pendingEntry = pendingEntries.length > 0
            ? pendingEntries[pendingEntries.length - 1]
            : null;

        const entryToUpdate = pendingEntry || this.currentUserEntry;

        if (entryToUpdate) {
            entryToUpdate.classList.remove('pending');
            const textSpan = entryToUpdate.querySelector('.text');
            textSpan.innerHTML = transcript || '<em>(no transcription)</em>';
            this.transcript.scrollTop = this.transcript.scrollHeight;
        }
    }

    appendAssistantDelta(delta) {
        // If no current assistant entry, create one (for initial greeting)
        if (!this.currentAssistantEntry) {
            this.removePlaceholder();
            this.currentAssistantEntry = document.createElement('div');
            this.currentAssistantEntry.className = 'transcript-entry assistant streaming';
            this.currentAssistantEntry.innerHTML = `
                <span class="role">Maya:</span>
                <span class="text"></span>
            `;
            this.transcript.appendChild(this.currentAssistantEntry);
        }

        const textSpan = this.currentAssistantEntry.querySelector('.text');
        textSpan.textContent += delta;
        this.transcript.scrollTop = this.transcript.scrollHeight;
    }

    finalizeAssistantTurn() {
        if (this.currentAssistantEntry) {
            this.currentAssistantEntry.classList.remove('streaming');

            // Remove empty assistant entries
            const textSpan = this.currentAssistantEntry.querySelector('.text');
            if (!textSpan.textContent.trim()) {
                this.currentAssistantEntry.remove();
            }
        }

        // Reset for next turn
        this.currentUserEntry = null;
        this.currentAssistantEntry = null;
    }

    toggleMic() {
        if (!this.isConnected || !this.mediaStream) return;

        this.isMicActive = !this.isMicActive;

        // Enable/disable audio track
        const audioTrack = this.mediaStream.getAudioTracks()[0];
        audioTrack.enabled = this.isMicActive;

        // Update UI
        if (this.isMicActive) {
            this.micBtn.classList.add('active');
            this.micIcon.style.display = 'none';
            this.micOffIcon.style.display = 'block';
            this.micHint.textContent = 'Presiona para silenciar';
            this.updateStatus('listening', 'Escuchando...');
            this.setVisualizerActive(true);
        } else {
            this.micBtn.classList.remove('active');
            this.micIcon.style.display = 'block';
            this.micOffIcon.style.display = 'none';
            this.micHint.textContent = 'Presiona para hablar';
            this.updateStatus('connected', 'Conectado');
            this.setVisualizerActive(false);
        }
    }

    updateStatus(state, text) {
        this.statusDot.className = 'status-dot ' + state;
        this.statusText.textContent = text;
    }

    setVisualizerActive(active, mode = 'listening') {
        if (active) {
            this.visualizer.classList.add('active');
            this.visualizer.classList.toggle('speaking', mode === 'speaking');
        } else {
            this.visualizer.classList.remove('active', 'speaking');
        }
    }

    async logout() {
        // Cleanup WebRTC
        if (this.peerConnection) {
            this.peerConnection.close();
        }
        if (this.mediaStream) {
            this.mediaStream.getTracks().forEach(track => track.stop());
        }

        // Call logout API
        await fetch('/api/logout', { method: 'POST' });

        // Redirect to login
        window.location.href = '/login';
    }
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    new VoiceChat();
});
