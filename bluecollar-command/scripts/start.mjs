for (const name of ['APP_ACCESS_PASSWORD', 'SESSION_SECRET', 'GHL_PRIVATE_INTEGRATION_TOKEN', 'GHL_LOCATION_ID']) {
  if (!process.env[name]?.trim()) throw new Error(`${name} must be configured before starting the planner.`);
}
// Railway's container filesystem is ephemeral; require a persistent database.
if (process.env.RAILWAY_ENVIRONMENT_ID && !process.env.DATABASE_URL?.trim()) {
  throw new Error('Set DATABASE_URL to the Railway PostgreSQL service before starting the planner.');
}
await import('../.output/server/index.mjs');
