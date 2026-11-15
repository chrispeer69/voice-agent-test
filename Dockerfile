FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY client/package*.json ./client/
RUN npm ci --prefix client
COPY bluecollar-command/package*.json ./bluecollar-command/
RUN npm ci --prefix bluecollar-command
COPY client ./client
COPY bluecollar-command ./bluecollar-command
COPY scripts/build-website.mjs ./scripts/build-website.mjs
ARG VITE_AGENT_URL
ENV VITE_AGENT_URL=$VITE_AGENT_URL
RUN test -n "$VITE_AGENT_URL" || (echo "Set VITE_AGENT_URL to the HTTPS voice backend URL before building the website." >&2; exit 1)
RUN node scripts/build-website.mjs

FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 SAFE_TEST_MODE=true
COPY --from=build --chown=node:node /app/bluecollar-command/.output ./.output
COPY --from=build /app/bluecollar-command/scripts/start.mjs ./scripts/start.mjs
CMD ["node", "scripts/start.mjs"]
