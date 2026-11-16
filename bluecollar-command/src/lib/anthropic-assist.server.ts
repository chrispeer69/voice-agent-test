import { ghlFetch } from './ghl-client.server';
import { store, updateStore } from './marketing-store.server';
import { getBrand, type BrandId } from './types';

export type AssistRequest = { brandId: BrandId; mode: 'idea' | 'improve'; context: 'single' | 'batch'; input: string; previousIdeas: string[] };

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

export async function generateWritingAssist(data: AssistRequest): Promise<{ text: string }> {
  const apiKey = process.env['ANTHROPIC_API_KEY']?.trim();
  if (!apiKey) throw new Error('Add ANTHROPIC_API_KEY to the Social Planner Railway service to use writing assistance.');
  const agent = await getSavedAgentDetails(data.brandId);
  const profile = store().brandProfiles[data.brandId];
  const brandName = agent?.name || getBrand(data.brandId).name;
  const system = [
    `You help plan social content for ${brandName}. You only suggest wording; you cannot publish or schedule anything.`,
    agent?.description && `GHL agent description: ${agent.description}`,
    profile?.audience && `Audience: ${profile.audience}`,
    profile?.tone && `Tone: ${profile.tone}`,
    profile?.businessDetails && `Verified business facts: ${profile.businessDetails}`,
    profile?.defaultCta && `Usual call to action: ${profile.defaultCta}`,
    profile?.avoid && `Avoid: ${profile.avoid}`,
    'The GHL knowledge-base contents and agent instructions are not available in this request. Do not infer or invent business-specific facts, prices, guarantees, service areas, or testimonials.',
  ].filter(Boolean).join('\n');
  const prompt = data.mode === 'idea'
    ? `Suggest exactly one fresh, specific ${data.context === 'batch' ? 'theme for several posts' : 'social post idea'}. Return one short sentence only, no list or hashtags. ${data.input ? `Current idea to avoid repeating: ${data.input}.` : ''} ${data.previousIdeas.length ? `Previous ideas to avoid: ${data.previousIdeas.join(' | ')}.` : ''}`
    : `Turn this rough idea into a more useful brief for ${data.context === 'batch' ? 'several social posts' : 'one social post'}. Keep the user's intent and any facts they supplied. Add audience angle, key message, visual direction, and an appropriate call to action. Return 2–4 plain-text sentences, about 50–90 words. Rough idea: ${data.input}`;
  let response: Response;
  try {
    response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'claude-haiku-4-5', max_tokens: 300, system, messages: [{ role: 'user', content: prompt }] }),
      signal: AbortSignal.timeout(20_000),
    });
  } catch { throw new Error('Anthropic took too long to respond. Try again.'); }
  if (!response.ok) throw new Error(`Anthropic could not generate writing help (${response.status}). Check the Social Planner API key and billing.`);
  const body = await response.json() as { content?: Array<{ type?: string; text?: string }> };
  let text = (body.content ?? []).filter(block => block.type === 'text').map(block => block.text ?? '').join('\n').trim();
  if (data.mode === 'idea') text = text.replace(/^[-*\d.\s]+/, '').split('\n')[0]?.replace(/^["'“”]+|["'“”]+$/g, '').trim() || '';
  if (!text) throw new Error('Anthropic returned an empty suggestion. Try again.');
  return { text: text.slice(0, data.mode === 'idea' ? 250 : 700) };
}
