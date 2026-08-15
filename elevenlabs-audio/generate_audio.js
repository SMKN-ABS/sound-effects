"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");

const API_URL = "https://api.elevenlabs.io/v1/sound-generation";
const DEFAULT_OUTPUT_PATH = path.join("generated", "dog-barking.mp3");

class AudioGenerationError extends Error {
  constructor(message, options) {
    super(message, options);
    this.name = "AudioGenerationError";
  }
}

/**
 * Generate audio for `prompt` with the ElevenLabs Sound Effects API and save
 * the result as an MP3 file.
 *
 * @param {string} prompt
 * @param {string} [outputPath]
 * @param {{durationSeconds?: number}} [options]
 * @returns {Promise<string>} The path to the saved audio file.
 */
async function generateAudio(prompt, outputPath = DEFAULT_OUTPUT_PATH, options = {}) {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    throw new AudioGenerationError(
      "Missing ELEVENLABS_API_KEY environment variable.",
    );
  }

  const destination = path.resolve(outputPath);
  if (path.extname(destination).toLowerCase() !== ".mp3") {
    throw new AudioGenerationError("outputPath must have an .mp3 extension.");
  }

  let response;
  try {
    response = await fetch(API_URL, {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        Accept: "audio/mpeg",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text: prompt,
        ...(options.durationSeconds === undefined
          ? {}
          : { duration_seconds: options.durationSeconds }),
      }),
      signal: AbortSignal.timeout(60_000),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText}`.trim());
    }
  } catch (error) {
    if (error instanceof AudioGenerationError) {
      throw error;
    }
    throw new AudioGenerationError(`ElevenLabs request failed: ${error.message}`, {
      cause: error,
    });
  }

  let audio;
  try {
    audio = Buffer.from(await response.arrayBuffer());
  } catch (error) {
    throw new AudioGenerationError(`ElevenLabs request failed: ${error.message}`, {
      cause: error,
    });
  }

  if (audio.length === 0) {
    throw new AudioGenerationError("ElevenLabs returned empty audio.");
  }

  try {
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.writeFile(destination, audio);
  } catch (error) {
    throw new AudioGenerationError(`Could not save audio file: ${error.message}`, {
      cause: error,
    });
  }

  return destination;
}

if (require.main === module) {
  generateAudio(
    "A soft, clean wooden swish with a gentle air whoosh for a rectangular wooden stick rotating smoothly clockwise. Light and subtle natural wood texture, soft start, slightly fuller middle, smooth fade-out. No impact, hit, collision, crack, music, voice, mechanical, or metallic sound. Clean, crisp, child-friendly educational game SFX.",
    path.join("generated", "wooden-stick-clockwise-rotation.mp3"),
    { durationSeconds: 1 },
  )
    .then((savedPath) => console.log(`Audio saved to ${savedPath}`))
    .catch((error) => {
      console.error(`Audio generation failed: ${error.message}`);
      process.exitCode = 1;
    });
}

module.exports = {
  API_URL,
  AudioGenerationError,
  DEFAULT_OUTPUT_PATH,
  generateAudio,
};
