# Emily voice-agent lab

- Keep this repository isolated from `us-tow-ai-connect`.
- Keep `SAFE_TEST_MODE=true` for the Emily voice lab; its tools remain simulated until a sandbox backend is explicitly configured.
- The user explicitly authorized live GHL access for `bluecollar-command`, overriding the simulation-only rule for that planner. Its saved GHL token may be used for account/post reads and integration checks. Publishing and replies must remain explicit user-initiated actions in the app; do not publish test posts or send test replies.
- Never commit API keys or copy secrets from another repository.
- Validate server changes with Ruff and `py_compile`.
- Validate client changes with `npm run build`.
