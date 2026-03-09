# HunchDoctor — EVI Voice Integration
### Figma Make snippet to wire voice into your existing UI

---

## .env FILE

Create this inside your Figma Make project root:

```
VITE_HUME_API_KEY=your_hume_api_key
VITE_HUME_SECRET_KEY=your_hume_secret_key
VITE_HUME_CONFIG_ID=your_hume_config_id
```

---

## FIGMA MAKE — Voice Layer Snippet

Paste this `<script type="module">` block into your existing
Figma Make UI file.

Two integration points:
- Call `startEVI()` from your "I'm ready" button
- Handle `onFacialScanTriggered(voiceSignal)` to transition
  to your next screen

```html
<script type="module">
  import { HumeClient } from 'https://cdn.skypack.dev/hume'

  const HUME_API_KEY    = import.meta.env.VITE_HUME_API_KEY
  const HUME_SECRET_KEY = import.meta.env.VITE_HUME_SECRET_KEY
  const HUME_CONFIG_ID  = import.meta.env.VITE_HUME_CONFIG_ID

  // ── STATE ────────────────────────────────────────────────
  let socket        = null
  let mediaRecorder = null
  let audioContext  = null
  let audioQueue    = []
  let isPlaying     = false
  let voiceSignal   = 'Salt'  // built during conversation,
                               // passed to facial scan phase

  // ── VOCAL EMOTION → TASTE SIGNAL ────────────────────────
  const VOCAL_TO_SIGNAL = {
    Distress:    'Bitter',
    Tiredness:   'Umami',
    Anxiety:     'Sour',
    Fear:        'Sour',
    Sadness:     'Umami',
    Joy:         'Sweet',
    Contentment: 'Sweet',
    Calmness:    'Salt',
    Neutral:     'Salt',
    Anger:       'Bitter',
    Frustration: 'Bitter'
  }

  // ── GET ACCESS TOKEN DIRECTLY (no backend needed) ────────
  async function getHumeToken() {
    const response = await fetch('https://api.hume.ai/oauth2-cc/token', {
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + btoa(
          `${HUME_API_KEY}:${HUME_SECRET_KEY}`
        ),
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: 'grant_type=client_credentials'
    })
    const { access_token } = await response.json()
    return access_token
  }

  // ── START EVI ────────────────────────────────────────────
  // Wire this to your "I'm ready" button
  window.startEVI = async function () {
    const token  = await getHumeToken()
    const client = new HumeClient({ accessToken: token })

    socket = await client.empathicVoice.chat.connect({
      configId:  HUME_CONFIG_ID,
      onOpen:    () => { startMicCapture(); onEVIConnected() },
      onMessage: handleMessage,
      onError:   () => onEVIError(),
      onClose:   () => onEVIDisconnected()
    })
  }

  // ── MIC CAPTURE ──────────────────────────────────────────
  async function startMicCapture() {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,  // required by Hume
        noiseSuppression: true,  // required
        autoGainControl:  true   // required
      }
    })
    mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' })
    mediaRecorder.ondataavailable = async ({ data }) => {
      if (!socket || data.size === 0) return
      const reader = new FileReader()
      reader.onloadend = () =>
        socket.sendAudioInput({ data: reader.result.split(',')[1] })
      reader.readAsDataURL(data)
    }
    mediaRecorder.start(100)
  }

  // ── MESSAGE HANDLER ──────────────────────────────────────
  function handleMessage(msg) {
    switch (msg.type) {

      case 'user_message': {
        const scores = msg.models?.prosody?.scores
        if (scores) {
          const [topEmotion, score] = Object.entries(scores)
            .sort(([, a], [, b]) => b - a)[0]
          if (score > 0.4 && VOCAL_TO_SIGNAL[topEmotion])
            voiceSignal = VOCAL_TO_SIGNAL[topEmotion]
        }
        onUserSpoke(msg.message?.content, scores)
        break
      }

      case 'assistant_message':
        onHunchSpoke(msg.message?.content)
        break

      case 'audio_output':
        queueAudio(msg.data)
        break

      case 'assistant_end':
        onHunchFinishedSpeaking()
        break

      case 'user_interruption':
        stopAudio()
        break

      // ── TOOL FIRES → transition to facial scan ───────────
      case 'tool_call':
        if (msg.name === 'begin_facial_scan') {
          socket.sendToolResponse({
            tool_call_id: msg.tool_call_id,
            content: 'Facial scan initiated'
          })
          stopEVI()
          onFacialScanTriggered(voiceSignal)
        }
        break
    }
  }

  // ── AUDIO PLAYBACK ───────────────────────────────────────
  function queueAudio(base64) {
    audioQueue.push(base64)
    if (!isPlaying) playNext()
  }

  async function playNext() {
    if (!audioQueue.length) { isPlaying = false; return }
    isPlaying = true
    const base64 = audioQueue.shift()
    try {
      if (!audioContext)
        audioContext = new (window.AudioContext || window.webkitAudioContext)()
      const binary = atob(base64)
      const bytes  = new Uint8Array(binary.length)
      for (let i = 0; i < binary.length; i++)
        bytes[i] = binary.charCodeAt(i)
      const buf    = await audioContext.decodeAudioData(bytes.buffer)
      const source = audioContext.createBufferSource()
      source.buffer  = buf
      source.connect(audioContext.destination)
      source.onended = playNext
      source.start(0)
    } catch { playNext() }
  }

  function stopAudio() {
    audioQueue = []
    isPlaying  = false
    if (audioContext) { audioContext.close(); audioContext = null }
  }

  function stopEVI() {
    if (mediaRecorder) mediaRecorder.stop()
    if (socket) socket.close()
    stopAudio()
  }

  // ── UI HOOKS — wire these to your existing UI elements ───
  // Replace each function body with your actual UI calls

  function onEVIConnected() {
    // e.g. setStatus('Hunch is listening')
    // e.g. avatar.classList.add('listening')
  }

  function onEVIDisconnected() {
    // e.g. setStatus('Session ended')
  }

  function onEVIError() {
    // e.g. setStatus('Connection error')
    // e.g. startBtn.disabled = false
  }

  function onUserSpoke(transcript, prosodyScores) {
    // e.g. setTranscript(`"${transcript}"`)
    // e.g. showEmotionTags(prosodyScores)
    // e.g. avatar.classList.replace('speaking', 'listening')
  }

  function onHunchSpoke(text) {
    // e.g. setTranscript(text)
    // e.g. avatar.classList.replace('listening', 'speaking')
  }

  function onHunchFinishedSpeaking() {
    // e.g. avatar.classList.replace('speaking', 'listening')
  }

  function onFacialScanTriggered(voiceSignal) {
    // YOUR SCREEN TRANSITION GOES HERE
    // voiceSignal = taste signal built from the conversation
    // pass it into your existing VitalLens + face-api stack
    // e.g. navigateToCompass({ voiceSignal })
    console.log('Voice phase complete. Signal:', voiceSignal)
  }

</script>
```

---

## WHAT GETS PASSED TO YOUR NEXT SCREEN

When `begin_facial_scan` fires, `onFacialScanTriggered` receives:

```
voiceSignal  →  'Bitter' | 'Sweet' | 'Sour' | 'Salt' | 'Umami'
```

Feed this into your existing VitalLens + face-api.js stack
as the voice channel of the four-channel signal fusion.

---

*HunchDoctor — FigBuild 2026*
