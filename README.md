# Emily outbound voice-agent lab

A standalone browser lab for testing a lower-cost, open-source-orchestrated alternative to the current Retell outbound towing agent. It uses [Pipecat](https://github.com/pipecat-ai/pipecat) for the realtime voice pipeline, Anthropic for the conversation model, and Deepgram for speech recognition and synthesis.

This repository is isolated from `us-tow-ai-connect`. The Emily Voice Lab uses sanitized fixture data, does not place telephone calls, and keeps its tools simulated. The separately authorized Social Planner connects to live GHL social accounts and can publish only after an operator chooses that action in the planner.

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
- Node.js 22.13+ for the combined website
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

## Deploy to Railway

Create two Railway services from this repository. Set the backend service Root
Directory to `/server` and its Config File Path to `/server/railway.json`. Set
the frontend service Root Directory to `/client` and its Config File Path to
`/client/railway.json`. Railway cannot detect the application when the repository
root is deployed because this is an isolated Python/Node monorepo.

Backend variables:

```text
ANTHROPIC_API_KEY=...
DEEPGRAM_API_KEY=...
ANTHROPIC_MODEL=claude-sonnet-4-6
DEEPGRAM_VOICE=aura-2-luna-en
SAFE_TEST_MODE=true
PIPECAT_ALLOWED_ORIGINS=https://YOUR-FRONTEND.up.railway.app
```

Frontend build variable:

```text
VITE_AGENT_URL=https://YOUR-BACKEND.up.railway.app
```

Generate a public domain for both services. Do not set `PORT`; Railway supplies it.

## Cost display

Pipecat forwards Anthropic's reported input/output token usage and speech usage to the browser. The UI calculates:

- Deepgram speech-to-text cost
- Deepgram text-to-speech cost
- Claude input/output cost for the selected model
- Combined cost for the test call

Provider invoices remain the billing source of truth. Pricing constants in the prototype should be reviewed before a production deployment.

The lab reports consumption for the current call. It does not query or display the remaining prepaid balance in either provider account.

## Safety

`SAFE_TEST_MODE=true` is required for the Emily voice backend. Its included tool functions are deterministic simulations. The separately authorized Blue Collar Command planner uses live GHL APIs. Keep API keys only in `server/.env` locally or in secret environment variables on a hosting provider. The checked-in `.gitignore` excludes environment files, virtual environments, dependencies, and generated builds.

## Production work still required

The browser lab proves the conversation pipeline. Real outbound calling additionally requires a carrier such as Twilio, call queuing/concurrency controls, production job lookup and writeback tools, webhook-compatible transcripts/outcomes, monitoring, and deployment hardening.

## Combined website: Social Planner + Voice Lab

The downloaded `bluecollar-command` app is the website's Social Planner section.
It keeps its dashboard, creation, calendar, campaigns, approvals, and analytics
screens. The Voice Lab is available at `/voice-lab/`; both sections link to each
other on the same origin. The earlier browser-only draft form is replaced, but
any drafts previously saved in browser storage are not deleted.

Use Node 22.13 or newer. Install dependencies in `client` and
`bluecollar-command`, then run from the repository root:

```sh
node scripts/build-website.mjs
cd bluecollar-command
npm start
```

Set `APP_ACCESS_PASSWORD` and `SESSION_SECRET` in the server environment before
starting. Use `openssl rand -hex 32` to generate the latter. `npm start` loads the
local `.env` automatically. Copy `.env.example` first if no local file exists.
Configure the GHL token, location, and the two brand agent IDs there as well.
For separate frontend development, the Voice Lab's Social Planner link points
to `http://localhost:3000/`; `VITE_SOCIAL_PLANNER_URL` can override it.

### Railway combined website

Create a **new website service** from `chrispeer69/voice-agent-test`, branch
`main`. Set its Root Directory to `/` and leave Config File Path blank.
Railway detects the root `Dockerfile`, builds the Social Planner and Voice Lab,
and starts the planner's Node server. Keep the existing Python voice backend as
a separate service with Root Directory `/server`; do not replace it. Leave the
old `/client` frontend service running until this new website passes checks.
In the website service's Settings, set the healthcheck path to `/login` and
generate a public domain. Do not override the Dockerfile start command.

Website variables:

- `APP_ACCESS_PASSWORD`: a strong, unique planner login password.
- `SESSION_SECRET`: a fresh random secret (`openssl rand -hex 32`).
- `GHL_PRIVATE_INTEGRATION_TOKEN`: the existing authorized subaccount token. Keep it in Railway Variables, never Git.
- `GHL_LOCATION_ID=o3Za6RJnsGJSqkXrWgVc`.
- `GHL_TIMEZONE=America/New_York`.
- `CONVINI_AGENT_ID=33dda291-e410-4dab-a358-31ef98c2fed8`.
- `USTOW_AGENT_ID=b3480481-37d8-48da-8ebb-18e71a80a8f9`.
- `PLANNER_DATA_DIR=/app/data`.
- `VITE_AGENT_URL=https://YOUR-VOICE-BACKEND.up.railway.app`: the existing voice backend public URL, supplied at build time. The Docker build fails if omitted.
- `SAFE_TEST_MODE=true`: Emily remains simulated; this flag does not disable the planner's authorized GHL connection.

Attach a Railway volume to the **website service** at `/app/data` before its
first deployment. Railway sets `RAILWAY_VOLUME_MOUNT_PATH` automatically; do
not add it yourself. The planner stores drafts, account assignments, sessions,
and delivery records in SQLite on that volume. Run one website replica to keep
those records consistent. PostgreSQL is not needed for this planner.

Add the new website origin to the voice backend's `PIPECAT_ALLOWED_ORIGINS`.
Keep `SAFE_TEST_MODE=true` on that backend. Railway supplies `PORT`; do not set
it yourself. Visit `/login` for the planner and `/voice-lab/` for Emily. Login
protects planner data; the Voice Lab remains accessible as before. Check the
agent selector, connected social accounts with profile images, Content and
Calendar reads, and one draft save. Do not select Publish or Schedule during
the connection check. After the new website works, switch traffic from the old
`/client` frontend service if desired.

The planner uses live GHL accounts, posts, comments, statistics, and agents.
Select an account's brand in Settings to import existing posts into the correct
calendar. Posts created here retain their selected brand. Unassigned existing
posts are not silently attributed to Convini. GHL reads are authenticated; a
read failure is displayed rather than disguised as an empty account list.

Publishing and scheduling require a separate explicit action after approval.
The server records each per-account delivery before/after the remote request;
repeated successful submissions reuse the remote result. Rescheduling uses PUT
for an existing post rather than creating another post. If a request loses its
response, the result is marked uncertain and automatic retry is blocked: check
GHL before reconciling that delivery. No live posts or replies are sent by tests.

Drafts, campaigns, agent sessions, brand assignments, and delivery outcomes are
stored transactionally in `planner.sqlite` under `PLANNER_DATA_DIR` (default
`.data` for local runs). Keep the website at one Railway replica with an attached
volume and enable volume backups. Startup refuses Railway's ephemeral storage.
Do not delete the database or copy it while writes are active; use a SQLite
backup or a stopped-service volume backup. Existing memory-only drafts from the
old build cannot be recovered automatically after that server stops.

GHL scopes used: `socialplanner/account.readonly`, `socialplanner/post.readonly`,
`socialplanner/post.write`, `socialplanner/comments.readonly`,
`socialplanner/comments.write`, `socialplanner/statistics.readonly`,
`users.readonly`, `managed-agents.readonly`, and the Managed Agent execute scope.
GHL agent tools remain configured in GHL. Content-generation instructions tell
the agents to draft content; review their tool permissions before production use.

Verification:

```sh
cd bluecollar-command
npm test
npm run build
npm start
```

The tests use temporary databases and mocked GHL responses. They cover account
reads, post-list requests, per-brand agent selection, persistence across process
restarts, publication responses, duplicate prevention, rescheduling, and error
handling. Live connection verification is read-only; a successful test does not
claim a real social-network publish has been performed.
