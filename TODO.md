# TODO - Render env + config fixes

- [x] Inspect config loading to confirm it supports `SELF_BOT_TOKEN` env var.
- [x] Create a local `.env` template with `SELF_BOT_TOKEN`, `SELF_BOT_PREFIX`, `SELF_BOT_STATUS`, and `GROQ_API_KEY`.
- [x] Update `render.yaml` to set required env vars (`SELF_BOT_TOKEN`, `SELF_BOT_PREFIX`, `SELF_BOT_STATUS`, optional `GROQ_API_KEY`).
- [ ] If project expects `.env` loading locally, add `dotenv` usage (and dependency) OR document setting env vars in Render.

- [ ] Verify startup succeeds (token present) by running `npm start` with env vars.


