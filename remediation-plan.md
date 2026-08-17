# Sound Effects Repository Remediation Plan

## Purpose

This document defines the changes required to address the repository review findings and make the ElevenLabs sound-effects workflow reliable, discoverable, documented, and testable.

The scope is limited to the existing ElevenLabs integration. It does not add another provider, fallback generator, queue, database, or service layer.

## Current state

The repository currently contains:

- `.agents/skills/elevenlabs-audio/generate_audio.js` — ElevenLabs Sound Effects API client and CLI entry point.
- `.agents/skills/elevenlabs-audio/test_generate_audio.js` — Node test-runner tests.
- `.agents/skills/elevenlabs-audio/SKILL.md` — agent skill documentation.
- `generated/*.mp3` — checked-in generated examples.

The existing tests pass with Node's built-in test runner, but coverage does not yet include several failure modes described below.

## Target repository layout

Move the skill into the location advertised by its own documentation:

```text
.agents/
└── skills/
    └── elevenlabs-audio/
        ├── SKILL.md
        ├── generate_audio.js
        └── test_generate_audio.js

generated/
├── dog-barking.mp3
├── goat-bleat.mp3
├── single-drum-beat.mp3
├── single-drum-hit.mp3
└── stick-rotating-air-whoosh.mp3

README.md
remediation-plan.md
package.json
.github/
└── workflows/
    └── test.yml
```

If the host agent intentionally discovers skills from the repository root instead of `.agents/skills`, document that convention explicitly and update the path references consistently. There must be one canonical location, not two independently maintained copies.

## Required fixes

### 1. Correct the skill location and references

**Problem:** `SKILL.md` claims that the skill is under `.agents/skills/elevenlabs-audio`, while the files are currently under `elevenlabs-audio`.

**Changes:**

1. Move the three skill files to `.agents/skills/elevenlabs-audio/`.
2. Update all commands and imports in documentation to use the new path.
3. Ensure tests still run from the repository root.
4. Search the repository for stale `elevenlabs-audio/` references and update each one where it refers to the skill location.

Expected root-level test command after the move:

```bash
node --test .agents/skills/elevenlabs-audio/test_generate_audio.js
```

### 2. Make output-path documentation accurate

**Problem:** The implementation writes the default artifact to `generated/dog-barking.mp3`, but the documentation currently says `dog-barking.mp3`.

**Changes:**

- Document `generated/dog-barking.mp3` as the default output.
- State that an explicitly supplied output path is used as supplied, after resolution to an absolute return value.
- Keep generated examples under `generated/`.
- Include both CLI and JavaScript API examples with the correct path.

### 3. Validate inputs before making an API request

Add explicit `AudioGenerationError` validation for:

- `prompt` must be a string;
- `prompt.trim()` must not be empty;
- `outputPath` must be a non-empty string;
- `outputPath` must have a case-insensitive `.mp3` extension.

Validation must happen before reading the API key or calling `fetch`, so invalid input cannot consume API quota.

Suggested behavior:

```text
prompt must be a non-empty string.
outputPath must be a non-empty string.
outputPath must have an .mp3 extension.
```

Do not expose native `TypeError` messages for normal caller mistakes. Convert expected validation failures to `AudioGenerationError`.

### 4. Validate successful API responses before saving

**Problem:** A non-empty HTTP 2xx response is currently saved as an MP3 even if the body is JSON, HTML, or another non-audio payload.

Implement response validation in two layers:

1. Verify the response `Content-Type` is an accepted audio MIME type, at minimum `audio/mpeg`.
2. Verify the body is plausibly MP3 data before writing it. Support normal MP3 files with an ID3 header as well as raw MPEG audio frames; do not require every file to begin with `ID3`.

When validation fails, throw an `AudioGenerationError` and do not create or replace the destination file.

Use an explicit error such as:

```text
ElevenLabs returned a non-MP3 response.
```

The implementation should not silently trust the `.mp3` extension.

### 5. Add bounded retries for transient API failures

Retry only transient failures:

- HTTP `429`;
- HTTP `500`, `502`, `503`, and `504`;
- network errors that are not caused by caller validation;
- timeout/abort errors, subject to the retry budget.

Do not retry permanent errors such as `400`, `401`, `403`, or `404`.

Recommended defaults:

- maximum attempts: 3 total;
- exponential backoff: 250 ms, then 500 ms;
- no unbounded loops;
- preserve the final error and status in the thrown `AudioGenerationError`.

The delay implementation should be injectable or easily stubbed in tests so the test suite remains fast.

### 6. Write output files atomically

**Problem:** Direct `writeFile(destination, audio)` can leave a truncated destination if the process is interrupted or the disk fills.

Implement the following sequence:

1. Create the destination directory.
2. Create a uniquely named temporary file in that same directory.
3. Write the validated audio to the temporary file.
4. Rename the temporary file to the final destination.
5. Remove the temporary file in a `finally` block if any step fails.

The temporary file must be in the same directory so that rename is atomic on the target filesystem. An existing destination must remain intact if validation, download, or writing fails.

### 7. Add project metadata and user documentation

Create `package.json` with:

```json
{
  "name": "sound-effects",
  "private": true,
  "description": "ElevenLabs sound-effects generation workflow",
  "scripts": {
    "test": "node --test .agents/skills/elevenlabs-audio/test_generate_audio.js"
  },
  "engines": {
    "node": ">=18"
  }
}
```

Create `README.md` covering:

- prerequisites, including Node.js 18+;
- how to set `ELEVENLABS_API_KEY`;
- how to run the CLI;
- default and custom output paths;
- how to run tests;
- the fact that only ElevenLabs is used;
- expected error behavior;
- the location of the skill files.

Do not put API keys in source code, committed files, or test fixtures.

### 8. Add continuous integration

Create `.github/workflows/test.yml` that:

1. checks out the repository;
2. installs Node.js 18 or a current supported LTS version;
3. runs `npm test`;
4. does not require an API key because tests stub network calls.

The workflow should run on pushes and pull requests.

## Test plan

Expand the test suite to cover the following cases.

### Input validation

- missing API key;
- empty prompt;
- whitespace-only prompt;
- non-string prompt;
- empty output path;
- non-string output path;
- non-MP3 output extension;
- uppercase `.MP3` extension is accepted;
- invalid input does not call `fetch`.

### API behavior

- successful request sends `POST` to the ElevenLabs sound-generation endpoint;
- request includes `xi-api-key`, `Accept: audio/mpeg`, and JSON content type;
- request body contains the prompt;
- HTTP 400/401/403/404 fails without retry;
- HTTP 429 retries and eventually succeeds;
- HTTP 500/502/503/504 retries;
- a persistent transient error stops after the configured attempt limit;
- network failure retries according to the limit;
- timeout is converted to `AudioGenerationError`;
- `response.arrayBuffer()` failure is converted to `AudioGenerationError`.

### Response validation

- empty body fails;
- `text/html` response fails;
- `application/json` response fails;
- non-empty invalid bytes fail;
- valid ID3-prefixed MP3 data succeeds;
- valid raw MPEG-frame MP3 data succeeds;
- invalid responses do not overwrite an existing destination.

### File handling

- destination directory is created;
- output bytes are preserved exactly;
- returned path is absolute;
- existing output is preserved if the write fails;
- temporary files are cleaned up after failure;
- a successful write replaces the destination atomically;
- concurrent calls use distinct temporary files.

### CLI behavior

- successful CLI execution exits with status 0 and prints the saved path;
- missing API key exits non-zero and prints a readable error;
- API errors do not produce an unhandled rejection.

Avoid real network calls in tests. Use injected fetch/backoff dependencies or controlled stubs rather than sleeps and external services.

## Implementation notes

### Error boundaries

All expected operational failures should be represented by `AudioGenerationError` and should retain the original error as `cause` where available. Error messages should be useful to a CLI user but must not include the API key.

### API key handling

Read `ELEVENLABS_API_KEY` at function-call time, as the current implementation does. Treat an empty string as missing. Never log the key or include it in an error message.

### Prompt handling

Send the user prompt as the API's `text` field after validation. Do not silently rewrite the prompt or add a provider fallback.

### Output-path safety

The existing API intentionally accepts arbitrary user-provided filesystem paths. Preserve that behavior unless the caller contract is changed. If path restrictions are later introduced, they must be documented and tested separately.

### Generated artifacts

The checked-in MP3 files should remain unchanged unless there is a deliberate regeneration task. The remediation work is code, documentation, tests, metadata, and CI—not replacement of existing generated samples.

## Acceptance checklist

- [ ] Skill files are in the canonical discoverable directory.
- [ ] No documentation claims that the default file is written at repository root.
- [ ] Invalid prompt and output arguments fail before network access.
- [ ] Successful responses are verified as MP3 audio before saving.
- [ ] Transient errors use bounded retries; permanent errors do not retry.
- [ ] File writes are atomic and temporary files are cleaned up.
- [ ] `package.json` provides a working `npm test` command and Node version requirement.
- [ ] `README.md` documents setup, usage, paths, and testing.
- [ ] CI runs the complete offline test suite.
- [ ] Tests cover all cases in the test plan.
- [ ] `npm test` passes locally and in CI.
- [ ] No API keys or other secrets are committed.

## Verification commands

Run these from the repository root after implementation:

```bash
npm test

git status --short

git grep -n "dog-barking.mp3"
```

The final grep should distinguish the default path (`generated/dog-barking.mp3`) from any custom-path examples, and the test command should pass without `ELEVENLABS_API_KEY` or network access.
 