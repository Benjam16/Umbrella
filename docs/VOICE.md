# Voice (optional)

Umbrella does not bundle STT/TTS. Supported paths:

## HTTP + external STT executable

When the dashboard API is enabled (`UMBRELLA_DASHBOARD_PORT`):

1. Set **`UMBRELLA_VOICE_STT`** to an executable path. It receives the path to a temp audio file as **argv[1]** and must print the transcript on **stdout** (exit 0).
2. **`POST /api/voice-transcribe`** with **`Authorization: Bearer $UMBRELLA_INBOUND_SECRET`**:
   - **JSON:** `{ "audioBase64": "<base64>", "filename": "clip.webm", "setForegroundGoal": true }` (optional `setForegroundGoal` queues the transcript like **`POST /api/goal`**).
   - **Raw body:** upload bytes with a non-JSON `Content-Type` (e.g. `audio/webm`). Optional header **`X-Umbrella-Filename: clip.webm`** picks a file extension for the temp file.
3. Response: `{ "ok": true, "transcript": "..." }`. Max upload **6 MiB**. Timeout: **`UMBRELLA_VOICE_STT_TIMEOUT_MS`** (default 120000).

## Chat-only flow

1. Record audio with your OS or a CLI.
2. Transcribe offline (same binary as above, or cloud STT).
3. Send the text with **`POST /api/goal`**, Telegram **`/umb task …`**, Discord **`!umb task …`**, or Slack **`!umb task …`**.

For hands-free loops, wrap recording + `curl` to **`/api/voice-transcribe`** or **`/api/goal`** in a script, or use an external assistant that calls the HTTP API.
