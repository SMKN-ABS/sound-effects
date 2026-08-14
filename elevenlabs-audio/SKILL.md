---
name: elevenlabs-audio
description: Generate an MP3 sound effect from a text prompt using only the ElevenLabs Sound Effects API and ELEVENLABS_API_KEY.
---

# ElevenLabs Audio Generation

Use this skill when a user wants to generate a sound effect from a text prompt with ElevenLabs.

## Provider requirement

Use **only ElevenLabs** for audio generation through the ElevenLabs Sound Effects API. Do not use OpenRouter, OpenAI, browser speech synthesis, local audio generators, or any other provider or fallback.

## Project structure

```text
.agents/skills/elevenlabs-audio/
├── SKILL.md
├── generate_audio.js
└── test_generate_audio.js
```

## Requirements

- Node.js 18 or newer (for the built-in `fetch` API)
- A valid ElevenLabs API key
- The key must be provided through `ELEVENLABS_API_KEY`; never hardcode it in JavaScript code.

Set the API key for the current shell session:

```bash
export ELEVENLABS_API_KEY="your-elevenlabs-api-key"
```

For Windows PowerShell:

```powershell
$env:ELEVENLABS_API_KEY = "your-elevenlabs-api-key"
```

## Run the test prompt

The script uses this prompt when run directly:

```text
A dog barking for 5 seconds.
```

Run it from the repository root:

```bash
node elevenlabs-audio/generate_audio.js
```

On success, it saves:

```text
dog-barking.mp3
```

## Use as a JavaScript function

```javascript
const { generateAudio } = require("./elevenlabs-audio/generate_audio");

const outputPath = await generateAudio(
  "A dog barking for 5 seconds.",
  "generated/dog-barking.mp3",
);
console.log(`Saved audio to ${outputPath}`);
```

The function reads `ELEVENLABS_API_KEY` at call time, sends the prompt to the
ElevenLabs Sound Effects API, and returns the absolute path to the saved MP3.

## Error handling

`generate_audio()` raises `AudioGenerationError` when:

- `ELEVENLABS_API_KEY` is missing
- the API request fails or returns an HTTP error
- ElevenLabs returns an empty audio response
- the output path cannot be written
- the output path does not end in `.mp3`

The command-line entry point turns these errors into a readable failure message
and a non-zero process exit.

## Implementation flow

```text
User Prompt
    ↓
JavaScript Skill
    ↓
Read ELEVENLABS_API_KEY
    ↓
ElevenLabs Sound Effects API
    ↓
Generate Audio
    ↓
Save Audio File (.mp3)
```

This is a simple audio-generation service: the JavaScript function sends the
user’s audio prompt directly to ElevenLabs without adding queues, databases,
agents, other providers, fallbacks, or other infrastructure.

## Run local tests

The tests stub the HTTP request and do not require an API key or network access:

```bash
node --test elevenlabs-audio/test_generate_audio.js
```
