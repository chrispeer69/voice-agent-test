# Social Planner: setup and operations

This is the handoff for anyone, including Chris's coding agent, working on the Social Planner in `chrispeer69/voice-agent-test`. Read the root `AGENTS.md` first. The planner lives in `bluecollar-command/`; Emily's separate voice backend lives in `server/` and must stay in `SAFE_TEST_MODE=true`.

## Where it runs

The current Railway project has a **Social planner** website service plus the existing **Frontend** and **Backend** voice services. The Social planner public URL is `https://social-planner-production-692d8ad8.up.railway.app/`. It is built from the repository root with the root `Dockerfile` (Root Directory `/`; no custom start command). The Dockerfile builds `client/` into `/voice-lab/` and `bluecollar-command/` as the main app. The voice backend remains a separate service with Root Directory `/server` and `server/railway.json`. The older frontend may remain online; it is not the Social Planner's server.

Use Node.js 22.13+ locally. For a local planner, install dependencies in `client/` and `bluecollar-command/`, set variables in `bluecollar-command/.env` from `.env.example`, then run `node scripts/build-website.mjs` at the repository root and `npm start` inside `bluecollar-command/`. Never commit `.env` files.

## Railway Social planner service

Set these variables on **Social planner**, not on the voice Frontend or Backend services:

```text
APP_ACCESS_PASSWORD=<unique strong login password>
SESSION_SECRET=<random secret, for example from openssl rand -hex 32>
GHL_PRIVATE_INTEGRATION_TOKEN=<subaccount Private Integration token>
GHL_LOCATION_ID=o3Za6RJnsGJSqkXrWgVc
GHL_TIMEZONE=America/New_York
CONVINI_AGENT_ID=33dda291-e410-4dab-a358-31ef98c2fed8
USTOW_AGENT_ID=b3480481-37d8-48da-8ebb-18e71a80a8f9
PLANNER_DATA_DIR=/app/data
VITE_AGENT_URL=https://<voice-backend-public-domain>
SAFE_TEST_MODE=true
```

`VITE_AGENT_URL` is used at build time for the Voice Lab; it is not a GHL token. Railway supplies `PORT`. Mount a Railway volume at `/app/data` before deploying; the startup script checks that `PLANNER_DATA_DIR` is inside that volume. Run one Social planner replica. SQLite on the volume stores drafts, sessions, brand/account assignments, and delivery records; PostgreSQL is not required. Back up the volume. Set the Social planner healthcheck path to `/login`. The voice Backend should allow the Social planner origin in `PIPECAT_ALLOWED_ORIGINS`.

`APP_ACCESS_PASSWORD`, `SESSION_SECRET`, and the GHL token are secret values: get or rotate them in the appropriate service, then place them in Railway Variables. The GHL Secrets screen does not reveal an existing secret's value. Do not copy secrets into code, logs, chat, or this document. The agent IDs above are public IDs from the two Agent Studio URLs, not keys.

## GHL connection and permissions

The token belongs to the Blue Collar AI subaccount. In GHL, use **Settings → Developer → Private Integrations** and grant `managed-agents.readonly`, `managed-agents.write`, `socialplanner/account.readonly`, `socialplanner/post.readonly`, `socialplanner/post.write`, `socialplanner/comments.readonly`, `socialplanner/comments.write`, `socialplanner/statistics.readonly`, and `medias.write`. GHL user reads are used for the approver list and post ownership. See [GHL_AGENT_SETUP.md](GHL_AGENT_SETUP.md) for agent setup and scope details.

The planner lists published Managed Agents from the subaccount. The two ID variables above map the existing Convini and US Tow agents to familiar brand aliases; new published agents appear after **Refresh GHL agents** without another ID variable. Create agents and attach their correct knowledge bases in [GHL Agent Studio](https://app.gohighlevel.com/v2/location/o3Za6RJnsGJSqkXrWgVc/ai-agents/agent-studio). The planner does not copy full knowledge-base text. Its Settings content guide can add verified facts and writing constraints. AI ideas, captions, and supported media use the selected GHL agent; the planner does not require an Anthropic key.

## Posting and calendar behavior

One post asks for an agent, topic, goal, accounts, media, preview, and timing. Multiple posts uses a count, date range and posting window, then review. A GHL draft is synced when saved. Choosing **Schedule post** or **Publish now** in One post approves it in the planner and sends the requested GHL action; no second approval is needed for an already scheduled post. Batch drafts go through their review controls. Do not run live publish or reply calls as connection tests.

The calendar reads GHL live posts and combines them with genuinely local drafts. GHL is authoritative for a post that was previously synced there: deleting it in GHL removes it from the planner calendar after refresh. **Entire subaccount** shows existing GHL posts even if their connected accounts have no brand assignment. A brand-only calendar requires assigning those accounts in Settings; unassigned posts are not attributed to Convini by guesswork. A post appearing in GHL after a scheduling error may still be a draft: check its GHL status before retrying.

GHL post writes are tracked per account in SQLite to avoid duplicate submissions. A successful update may omit the post ID; the planner reuses the ID of the draft it updated. If a request's outcome is uncertain, inspect GHL before trying again. The UI reports individual account failures rather than treating a partial success as complete.

## Checks before a change is considered ready

- For planner changes, run `PATH=/opt/homebrew/opt/node@22/bin:$PATH npm test` and `PATH=/opt/homebrew/opt/node@22/bin:$PATH npm run build` from `bluecollar-command/` (or use any Node.js 22.13+ on another machine).
- For voice backend changes, run Ruff and `py_compile` as required by the root `AGENTS.md`; keep `SAFE_TEST_MODE=true`.
- Check the public `/login` page and authenticated account/agent/calendar reads after Railway deploys. A build or push alone does not prove the deployment completed.
- Never commit API keys or secrets, and do not publish test posts or send test replies.
