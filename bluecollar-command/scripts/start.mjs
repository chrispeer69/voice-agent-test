import { resolve, relative, isAbsolute } from 'node:path';

for (const name of ['APP_ACCESS_PASSWORD', 'SESSION_SECRET', 'GHL_PRIVATE_INTEGRATION_TOKEN', 'GHL_LOCATION_ID']) {
  if (!process.env[name]?.trim()) throw new Error(`${name} must be configured before starting the planner.`);
}
// Railway's container filesystem is ephemeral; fail startup rather than silently lose drafts.
if (process.env.RAILWAY_ENVIRONMENT_ID) {
  const mount = process.env.RAILWAY_VOLUME_MOUNT_PATH;
  const directory = process.env.PLANNER_DATA_DIR;
  if (!mount || !directory) throw new Error('Attach a Railway volume and set PLANNER_DATA_DIR to its mount path.');
  const path = relative(resolve(mount), resolve(directory));
  if (path.startsWith('..') || isAbsolute(path)) throw new Error('PLANNER_DATA_DIR must be inside the Railway volume.');
}
await import('../.output/server/index.mjs');
