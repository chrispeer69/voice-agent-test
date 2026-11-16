import { ghlFetch } from './ghl-client.server';
import { store, updateStore } from './marketing-store.server';
import { getBrand, type BrandId } from './types';

function agentIdFor(brandId: BrandId): string | undefined {
  return brandId === 'convini' ? process.env['CONVINI_AGENT_ID'] : brandId === 'ustow' ? process.env['USTOW_AGENT_ID'] : brandId;
}

export async function getSavedAgentDetails(brandId: BrandId) {
  const cached = store().agentSnapshots[brandId];
  if (cached) return cached;
  const agentId = agentIdFor(brandId);
  const token = process.env['GHL_PRIVATE_INTEGRATION_TOKEN'];
  const locationId = process.env['GHL_LOCATION_ID'];
  if (!agentId || !token || !locationId) return null;
  try {
    const response = await ghlFetch(`https://services.leadconnectorhq.com/agent-studio/managed-agents/${encodeURIComponent(agentId)}?locationId=${encodeURIComponent(locationId)}`, {
      headers: { Authorization: `Bearer ${token}`, Version: 'v3', Accept: 'application/json' },
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) return null;
    const raw = await response.json() as Record<string, unknown>;
    const agent = {
      name: typeof raw['name'] === 'string' ? raw['name'] : getBrand(brandId).name,
      description: typeof raw['description'] === 'string' ? raw['description'] : '',
      tools: Array.isArray(raw['tools']) ? raw['tools'].filter((item): item is string => typeof item === 'string') : [],
      knowledgeBaseIds: Array.isArray(raw['knowledgeBaseIds']) ? raw['knowledgeBaseIds'].filter((item): item is string => typeof item === 'string') : [],
      syncedAt: new Date().toISOString(),
    };
    updateStore(state => { state.agentSnapshots[brandId] = agent; });
    return agent;
  } catch { return null; }
}
