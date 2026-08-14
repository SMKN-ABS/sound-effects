"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  API_URL,
  AudioGenerationError,
  generateAudio,
} = require("./generate_audio");

const originalFetch = global.fetch;
const originalApiKey = process.env.ELEVENLABS_API_KEY;

function restoreEnvironment() {
  global.fetch = originalFetch;
  if (originalApiKey === undefined) {
    delete process.env.ELEVENLABS_API_KEY;
  } else {
    process.env.ELEVENLABS_API_KEY = originalApiKey;
  }
}

test.afterEach(restoreEnvironment);

test("missing API key raises a clear error", async () => {
  delete process.env.ELEVENLABS_API_KEY;

  await assert.rejects(
    generateAudio("A dog barking for 5 seconds."),
    (error) =>
      error instanceof AudioGenerationError &&
      error.message.includes("ELEVENLABS_API_KEY"),
  );
});

test("API request failure raises a clear error", async () => {
  process.env.ELEVENLABS_API_KEY = "x".repeat(20);
  global.fetch = async () => {
    throw new Error("network unavailable");
  };

  await assert.rejects(
    generateAudio("A dog barking for 5 seconds."),
    (error) =>
      error instanceof AudioGenerationError &&
      error.message.includes("request failed"),
  );
});

test("empty audio response raises a generation error", async () => {
  process.env.ELEVENLABS_API_KEY = "x".repeat(20);
  global.fetch = async () =>
    new Response(new ArrayBuffer(0), {
      status: 200,
      headers: { "content-type": "audio/mpeg" },
    });

  await assert.rejects(
    generateAudio("A dog barking for 5 seconds."),
    (error) =>
      error instanceof AudioGenerationError &&
      error.message.includes("empty audio"),
  );
});

test("generated audio is saved as MP3 and sends the expected request", async () => {
  process.env.ELEVENLABS_API_KEY = "x".repeat(20);
  const fakeAudio = Buffer.from("fake-mp3-data");
  let request;

  global.fetch = async (...args) => {
    request = args;
    return new Response(fakeAudio, {
      status: 200,
      headers: { "content-type": "audio/mpeg" },
    });
  };

  const temporaryDirectory = await fs.mkdtemp(
    path.join(os.tmpdir(), "elevenlabs-audio-"),
  );
  const outputPath = path.join(temporaryDirectory, "dog-barking.mp3");

  try {
    const result = await generateAudio(
      "A dog barking for 5 seconds.",
      outputPath,
    );

    assert.equal(result, path.resolve(outputPath));
    assert.deepEqual(await fs.readFile(outputPath), fakeAudio);
    assert.equal(request[0], API_URL);
    assert.equal(request[1].method, "POST");
    assert.equal(request[1].headers["xi-api-key"], "x".repeat(20));
    assert.equal(request[1].headers.Accept, "audio/mpeg");
    assert.equal(request[1].headers["Content-Type"], "application/json");
    assert.deepEqual(JSON.parse(request[1].body), {
      text: "A dog barking for 5 seconds.",
    });
  } finally {
    await fs.rm(temporaryDirectory, { recursive: true, force: true });
  }
});
