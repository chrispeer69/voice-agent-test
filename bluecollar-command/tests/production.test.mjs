import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import ts from 'typescript';

const directory = mkdtempSync(join(tmpdir(), 'planner-tests-'));
process.env.PLANNER_DATA_DIR = join(directory, 'data');
process.env.GHL_PRIVATE_INTEGRATION_TOKEN = 'test-token';
process.env.GHL_LOCATION_ID = 'test-location';
process.env.CONVINI_AGENT_ID = 'convini-agent';
process.env.USTOW_AGENT_ID = 'ustow-agent';
const modules = ['types','marketing-store.server','ghl-client.server','social-post-contract','caption-clean.server','agent.server','marketing.server','anthropic-assist.server','batch-schedule','batch.server'];
for (const name of modules) {
  const source = readFileSync(new URL(`../src/lib/${name}.ts`, import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText.replace(/from (["'])\.\/([^"']+)\1/g, 'from "./$2.mjs"');
  writeFileSync(join(directory, name + '.mjs'), compiled);
}
// Request-context auth is independently exercised by HTTP smoke tests.
writeFileSync(join(directory, 'auth.server.mjs'), 'export async function requireSession() { if (globalThis.denyTestSession) throw new Error("Unauthorized"); }');
const load = name => import(pathToFileURL(join(directory, name + '.mjs')));
const { ghlFetch } = await load('ghl-client.server');
const { store, updateStore } = await load('marketing-store.server');
const api = await load('marketing.server');
const { runAgentTurn } = await load('agent.server');
const { generateWritingAssist, getSavedAgentDetails } = await load('anthropic-assist.server');
const { buildBatchPosts } = await load('batch.server');
const contract = await load('social-post-contract');
const originalFetch = globalThis.fetch;
after(() => { globalThis.fetch = originalFetch; rmSync(directory, { recursive: true, force: true }); });
const account = { id: 'facebook-account', platform: 'facebook', name: 'Test Page', active: true, originId: 'native-page', profileId: 'profile-record' };
let calls = [];
let writeMode = 'success';
globalThis.fetch = async (input, init = {}) => {
  const url = new URL(input); calls.push({ url, init });
  if (url.pathname.endsWith('/accounts')) return Response.json({ results: { accounts: [account] } });
  if (url.pathname === '/users/') return Response.json({ users: [{ id: 'test-user' }] });
  if (url.pathname.includes('/execute')) return Response.json({ success: true, sessionId: 'session', finalText: url.pathname.includes('convini-agent') ? 'Convini reply' : 'US Tow reply' });
  if (url.pathname.endsWith('/posts/list')) return Response.json({ results: { posts: [{ _id: 'live-post', accountIds: [account.id], summary: 'Existing post', status: 'published', publishedAt: '2026-01-01T00:00:00Z', createdAt:'2026-01-01T00:00:00Z' }], count: 1 } });
  if (url.pathname.endsWith('/statistics')) return Response.json({ results: { breakdowns: {
    reach: { platforms: { facebook: { value: 12 } } },
    engagement: { facebook: { likes: 3, comments: 2, shares: 1 } },
    posts: { platforms: { facebook: { value: 1 } } },
  } } });
  if (url.pathname.endsWith('/comments/facebook/list')) return Response.json({results:{comments:[{_id:'comment-id',postId:'live-post',platform:'facebook',content:'A comment',author:{name:'Test'},createdAt:'2026-01-01T00:00:00Z'}],meta:{hasMore:false}}});
  if (url.pathname.endsWith('/comments/facebook')) return Response.json({success:true});
  if (url.pathname.includes('/posts') && init.method === 'DELETE') return Response.json({ success: true, results: { postId: url.pathname.split('/').at(-1) } });
  if (url.pathname.includes('/posts')) {
    if (writeMode === 'network-error') throw new Error('Connection lost');
    if (writeMode === 'reject') return Response.json({ message: 'Invalid media' }, { status: 422 });
    const body = JSON.parse(init.body);
    return Response.json({ success: true, results: { post: { _id: 'remote-post', status: body.status === 'published' ? 'in_progress' : body.status } } });
  }
  throw new Error('Unexpected request: ' + url.pathname);
};
const makePost = id => ({ id, brandId: 'convini', campaignId: null, type: 'custom', accountIds: [account.id], platforms:['facebook'], objective:'awareness', format:'text', title:'Test', body:'Test caption', media:[], commentToDm:false, status:'approved', createdAt:'2026-01-01T00:00:00Z', updatedAt:'2026-01-01T00:00:00Z' });

test('discard removes local and synced drafts, never published posts', async () => {
  await api.savePost({ ...makePost('discard-local'), status: 'draft' });
  await api.savePost({ ...makePost('keep-published'), status: 'published' });
  await api.savePost({ ...makePost('keep-remote'), status: 'draft', ghlPostId: 'remote-id' });
  assert.equal(await api.deletePost('discard-local'), true);
  assert.equal(await api.deletePost('keep-published'), false);
  assert.equal(await api.deletePost('keep-remote'), true);
  assert.ok(calls.some(call => call.init.method === 'DELETE' && call.url.pathname.endsWith('/posts/remote-id')));
  assert.equal(store().posts.some(post => post.id === 'discard-local'), false);
});

test('saving a draft syncs it to GHL without publishing to social accounts', async () => {
  const saved = await api.syncDraftToGhl({ ...makePost('sync-draft'), status: 'draft' });
  assert.equal(saved.status, 'draft');
  assert.equal(saved.publishResults[0].status, 'draft');
  const request = calls.findLast(call => call.url.pathname.endsWith('/posts') && call.init.method === 'POST');
  assert.equal(JSON.parse(request.init.body).status, 'draft');
  const writesBefore = calls.filter(call => call.url.pathname.includes('/posts') && ['POST', 'PUT'].includes(call.init.method) && !call.url.pathname.endsWith('/list')).length;
  await api.syncDraftToGhl(saved);
  const writesAfter = calls.filter(call => call.url.pathname.includes('/posts') && ['POST', 'PUT'].includes(call.init.method) && !call.url.pathname.endsWith('/list')).length;
  assert.equal(writesAfter, writesBefore, 'Unchanged drafts should not be duplicated in GHL');
  await api.schedulePostViaGhl({ ...saved, status: 'approved', scheduledAt: new Date(Date.now() + 86400000).toISOString() });
  assert.equal(calls.at(-1).init.method, 'PUT', 'Scheduling should update the synced draft');
});

test('Google Business Profile standard updates include required details and reject unsupported media', () => {
  const googlePost = { ...makePost('google'), accountIds: ['google-account'], platforms: ['google'] };
  const payload = contract.buildPostPayload(googlePost, 'google-account', 'google', 'published', 'user');
  assert.deepEqual(payload.gmbPostDetails, { gmbEventType: 'STANDARD' });
  assert.throws(() => contract.buildPostPayload({ ...googlePost, media: [{ id: 'video', url: 'https://example.com/video.mp4', type: 'video' }] }, 'google-account', 'google', 'published', 'user'), /no video/);
  assert.throws(() => contract.buildPostPayload({ ...googlePost, body: 'x'.repeat(1501) }, 'google-account', 'google', 'published', 'user'), /1,500 characters/);
});

test('GHL client reaches real transport even when Emily SAFE_TEST_MODE is true, and rejects other origins', async () => {
  process.env.SAFE_TEST_MODE = 'true';
  const response = await ghlFetch('https://services.leadconnectorhq.com/social-media-posting/test/accounts', { headers: { Authorization: 'Bearer test-token' } });
  assert.equal((await response.json()).results.accounts.length, 1);
  assert.equal(calls.at(-1).init.redirect, 'error');
  await assert.rejects(ghlFetch('https://other.invalid/'), /official API/);
});
test('account reads return actual GHL results and post lists use the documented POST endpoint', async () => {
  assert.equal((await api.fetchSocialAccounts()).accounts.length, 1);
  updateStore(s => { s.accountBrands[account.id] = 'convini'; });
  const posts = await api.fetchGhlPosts();
  assert.equal(posts[0].brandId, 'convini'); assert.equal(posts[0].brandUnassigned, false);
  const request = calls.find(c => c.url.pathname.endsWith('/posts/list'));
  assert.equal(request.init.method, 'POST'); assert.equal(JSON.parse(request.init.body).limit, '100');
  assert.equal(request.init.headers.Version, 'v3');
});
test('brand agent caching never reuses the other brand agent URL', async () => {
  assert.equal((await runAgentTurn('convini','test')).reply, 'Convini reply');
  assert.equal((await runAgentTurn('ustow','test')).reply, 'US Tow reply');
});
test('drafts and sessions survive a separate process; failed transactions roll back', async () => {
  const post=makePost('persist'); await api.savePost(post);
  await api.saveSession({executionId:'persist-session',brandId:'convini',turns:[],createdAt:post.createdAt});
  assert.throws(() => updateStore(s => { s.posts=[]; throw new Error('rollback'); }), /rollback/);
  assert.ok(store().posts.some(p=>p.id==='persist'));
  const child=spawnSync(process.execPath,['--input-type=module','-e',`import {store} from ${JSON.stringify(pathToFileURL(join(directory,'marketing-store.server.mjs')).href)};const s=store();if(!s.posts.some(p=>p.id==='persist')||!s.sessions.has('persist-session'))process.exit(1);`],{env:process.env,encoding:'utf8'});
  assert.equal(child.status,0,child.stderr);
});
test('publishing sends published, parses nested IDs, and does not falsely report processing as published', async () => {
  const post=makePost('publish');
  const results=await api.publishPostViaGhl(post);
  assert.equal(results[0].ghlPostId,'remote-post'); assert.equal(results[0].status,'publishing');
  const request=calls.findLast(c=>c.url.pathname.endsWith('/posts'));
  assert.equal(JSON.parse(request.init.body).status,'published');
  const before=calls.filter(c=>c.url.pathname.includes('/posts')&&!c.url.pathname.endsWith('/list')).length;
  await api.publishPostViaGhl(post);
  const after=calls.filter(c=>c.url.pathname.includes('/posts')&&!c.url.pathname.endsWith('/list')).length;
  assert.equal(after,before,'Repeated request should reuse persisted result');
});
test('rescheduling updates an existing remote post instead of creating a duplicate', async () => {
  const post={...makePost('reschedule'),scheduledAt:new Date(Date.now()+86400000).toISOString()};
  await api.schedulePostViaGhl(post);
  post.scheduledAt=new Date(Date.now()+172800000).toISOString();
  await api.schedulePostViaGhl(post);
  assert.equal(calls.at(-1).init.method,'PUT');
  assert.ok(calls.at(-1).url.pathname.endsWith('/posts/remote-post'));
});
test('missing accounts and past dates do not publish', async () => {
  await assert.rejects(api.publishPostViaGhl({...makePost('empty'),accountIds:[]}),/Select at least one/);
  const result=await api.schedulePostViaGhl({...makePost('past'),scheduledAt:'2020-01-01T00:00:00Z'});
  assert.equal(result[0].ok,false);assert.match(result[0].error,/future date/);
});
test('uncertain network outcomes block automatic retries to avoid duplicate posts', async () => {
  writeMode='network-error';
  const post=makePost('uncertain');
  assert.equal((await api.publishPostViaGhl(post))[0].ok,false);
  writeMode='success';
  const count=calls.length;
  const retry=await api.publishPostViaGhl(post);
  assert.equal(retry[0].ok,false);assert.match(retry[0].error,/outcome is unknown/);assert.equal(calls.length,count);
});
test('HTTP rejections are surfaced and may be retried after content correction', async () => {
  writeMode='reject'; const post=makePost('reject');
  assert.equal((await api.publishPostViaGhl(post))[0].ok,false);
  writeMode='success'; assert.equal((await api.publishPostViaGhl(post))[0].ok,true);
});
test('publication cannot proceed without a session', async () => {
  globalThis.denyTestSession=true;
  await assert.rejects(api.publishPostViaGhl(makePost('unauthorized')),/Unauthorized/);
  globalThis.denyTestSession=false;
});
test('response and media validation reject false confirmations and unsupported media', () => {
  assert.throws(()=>contract.parsePostWriteResponse({success:true}),/post ID/);
  assert.throws(()=>contract.parsePostWriteResponse({success:false}),/rejected/);
  assert.throws(()=>contract.buildPostPayload(makePost('media'),account.id,'instagram','published','user'),/requires an image/);
  assert.equal(contract.normalizePostStatus('pending'),'publishing');
});

test('analytics uses profile IDs and comments use native origin IDs', async () => {
  const stats=await api.fetchGhlStats('convini');
  assert.equal(stats[0].reach,12);assert.equal(stats[0].engagement,6);
  assert.deepEqual(JSON.parse(calls.findLast(c=>c.url.pathname.endsWith('/statistics')).init.body).profileIds,['profile-record']);
  const comments=await api.listComments('convini');assert.equal(comments[0].id,'comment-id');
  assert.deepEqual(JSON.parse(calls.findLast(c=>c.url.pathname.endsWith('/comments/facebook/list')).init.body).originIds,['native-page']);
  await api.replyGhlComment('comment-id','User-approved reply','facebook');
  const reply=JSON.parse(calls.at(-1).init.body);
  assert.equal(reply.parentId,'comment-id');assert.equal(reply.isParentThread,false);
});

test('subaccount comments include unassigned profiles while brand scopes exclude them', async () => {
  updateStore(s => { delete s.accountBrands[account.id]; });
  try {
    assert.equal((await api.listComments())[0].id, 'comment-id');
    assert.equal((await api.listComments('convini')).length, 0);
    assert.equal((await api.listComments('ustow')).length, 0);
  } finally { updateStore(s => { s.accountBrands[account.id] = 'convini'; }); }
});

test('brand content guidance persists separately for Convini and US Tow', async () => {
  updateStore(s => {
    s.brandProfiles.convini = { audience: 'Local teams', tone: 'Helpful', businessDetails: 'Verified example', defaultCta: 'Learn more', avoid: 'Unverified claims' };
    s.brandProfiles.ustow = { audience: 'Tow operators', tone: 'Direct', businessDetails: '', defaultCta: 'Request a demo', avoid: '' };
  });
  assert.equal(store().brandProfiles.convini?.audience, 'Local teams');
  assert.equal(store().brandProfiles.ustow?.audience, 'Tow operators');
});

test('Anthropic writing help uses saved brand facts and stores GHL agent metadata once', async () => {
  const previousFetch = globalThis.fetch;
  process.env.ANTHROPIC_API_KEY = 'test-anthropic-key';
  let metadataReads = 0;
  let anthropicCalls = 0;
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(input);
    if (url.pathname.includes('/managed-agents/')) {
      metadataReads++;
      return Response.json({ name: 'Convini Marketing Agent', description: 'Helpful vehicle care content', tools: ['image_generation'], knowledgeBaseIds: ['kb-1'] });
    }
    if (url.origin === 'https://api.anthropic.com') {
      anthropicCalls++;
      assert.equal(init.headers['x-api-key'], 'test-anthropic-key');
      const payload = JSON.parse(init.body);
      assert.match(payload.system, /Verified example/);
      assert.match(payload.system, /Helpful vehicle care content/);
      return Response.json({ content: [{ type: 'text', text: 'Show a practical vehicle care tip.' }] });
    }
    throw new Error('Unexpected request');
  };
  try {
    const request = { brandId: 'convini', mode: 'idea', context: 'single', input: '', previousIdeas: [] };
    assert.equal((await generateWritingAssist(request)).text, 'Show a practical vehicle care tip.');
    assert.equal((await getSavedAgentDetails('convini')).knowledgeBaseIds[0], 'kb-1');
    assert.equal((await generateWritingAssist(request)).text, 'Show a practical vehicle care tip.');
    assert.equal(metadataReads, 1);
    assert.equal(anthropicCalls, 2);
    globalThis.fetch = async () => Response.json({ error: { type: 'invalid_request_error', message: 'You have reached your specified API usage limits.' } }, { status: 400 });
    await assert.rejects(generateWritingAssist(request), /specified API usage limits/);
  } finally {
    globalThis.fetch = previousFetch;
    delete process.env.ANTHROPIC_API_KEY;
  }
});

test('batch media choice controls text, photo, and video generation without posting', async () => {
  process.env.GHL_TIMEZONE = 'America/New_York';
  const base = { brandId: 'convini', brief: 'Helpful driver tip', count: 1, startDate: '2027-03-15', days: 1, windowStart: '09:00', windowEnd: '18:00', objective: 'awareness', accountIds: [account.id] };
  const text = await buildBatchPosts({ ...base, mediaKind: 'text' });
  assert.equal(text.posts.length, 1);
  assert.equal(text.posts[0].format, 'text');
  assert.equal(text.posts[0].media.length, 0);
  const photo = await buildBatchPosts({ ...base, mediaKind: 'image' });
  assert.equal(photo.posts.length, 0);
  assert.match(photo.error, /did not return an image/);
  const video = await buildBatchPosts({ ...base, mediaKind: 'video' });
  assert.equal(video.posts.length, 0);
  assert.match(video.error, /did not return a generated video/);
});
