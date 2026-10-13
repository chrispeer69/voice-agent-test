# Emily outbound voice-agent lab

A standalone browser lab for testing a lower-cost, open-source-orchestrated alternative to the current Retell outbound towing agent. It uses [Pipecat](https://github.com/pipecat-ai/pipecat) for the realtime voice pipeline, Anthropic for the conversation model, and Deepgram for speech recognition and synthesis.

This repository is isolated from `us-tow-ai-connect`. It uses sanitized fixture data, does not read tenant/customer records, does not place telephone calls, and cannot write to production systems.

## What Chris can test

- Talk to Emily from a browser with normal interruptions
- Compare Claude Sonnet 4.6 and Haiku 4.5
- Compare five Deepgram voices
- Edit the compact agent prompt and rendered two-offer call script
- Review the current Script Builder configuration without Offer 3
- Switch among the real production routes: competitor repair, auto body, residence, unknown, our shop, and AAA-branded destination
- See the live transcript, response latency, actual LLM input/output tokens, separate STT/TTS/LLM costs, and total estimated cost per call
- Save scored comparisons locally in the browser

The compact prompt preserves the current Emily flow while reducing combined prompt text from 30,691 to 8,193 characters (about 73%).

## Requirements

- Python 3.11–3.13
- [uv](https://docs.astral.sh/uv/)
- Node.js 20+
- Anthropic API key
- Deepgram API key

A phone number, Twilio account, Retell account, and LiveKit account are not required for browser testing.

## Run locally

Start the backend:

```bash
cd server
cp .env.example .env
# Add ANTHROPIC_API_KEY and DEEPGRAM_API_KEY to .env
uv sync
uv run bot.py
```

Start the frontend in another terminal:

```bash
cd client
cp .env.example .env.local
npm install
npm run dev
```

Open `http://127.0.0.1:5174`, allow microphone access, and click **Answer Emily's call**.

## Cost display

Pipecat forwards Anthropic's reported input/output token usage and speech usage to the browser. The UI calculates:

- Deepgram speech-to-text cost
- Deepgram text-to-speech cost
- Claude input/output cost for the selected model
- Combined cost for the test call

Provider invoices remain the billing source of truth. Pricing constants in the prototype should be reviewed before a production deployment.

The lab reports consumption for the current call. It does not query or display the remaining prepaid balance in either provider account.

## Safety

`SAFE_TEST_MODE=true` is required. All included tool functions are deterministic simulations. Keep API keys only in `server/.env` locally or in secret environment variables on a hosting provider. The checked-in `.gitignore` excludes environment files, virtual environments, dependencies, and generated builds.

## Production work still required

The browser lab proves the conversation pipeline. Real outbound calling additionally requires a carrier such as Twilio, call queuing/concurrency controls, production job lookup and writeback tools, webhook-compatible transcripts/outcomes, monitoring, and deployment hardening.
