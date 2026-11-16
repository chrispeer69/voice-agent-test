import { createFileRoute, Link } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { useBrand } from '@/lib/brand-context';
import { Loader2 } from 'lucide-react';
import { getSocialAccounts, getAccountBrands, sendAgentMessage, assistPostPrompt, requestMedia, saveDraftPost, approvePost, schedulePost, publishPost, getPlannerTimezone, uploadPlannerPhoto } from '@/lib/marketing.functions';
import type { SocialPost, MediaItem } from '@/lib/types';
import { AgentPicker } from '@/components/agent-picker';
import { SimpleAccountPicker } from '@/components/simple-account-picker';

export const Route = createFileRoute('/quick-create')({ component: QuickCreate });
type Choice = 'call' | 'website' | 'comment' | 'learn';
type MediaChoice = 'photo' | 'ai' | 'none';
type Timing = 'draft' | 'later' | 'now';
const purposes: {id:Choice; label:string; cta:string}[] = [
  {id:'call',label:'Call us',cta:'Call us'}, {id:'website',label:'Visit website',cta:'Visit our website'},
  {id:'comment',label:'Comment',cta:'Tell us in the comments'}, {id:'learn',label:'Learn something',cta:'Learn more'},
];
const button = 'min-h-14 rounded-xl border border-border bg-white px-4 py-3 text-left text-sm font-semibold shadow-sm transition-all hover:border-primary hover:shadow-md';
function QuickCreate() {
  const {brand, agentOptions, setBrandId, refreshAgents, agentsLoading, agentsError} = useBrand();
  const queryClient = useQueryClient();
  const accounts = useQuery({queryKey:['social-accounts'],queryFn:()=>getSocialAccounts()});
  const assignments = useQuery({queryKey:['account-brands'],queryFn:()=>getAccountBrands()});
  const timezone = useQuery({queryKey:['planner-timezone'],queryFn:()=>getPlannerTimezone()});
  const agent = useServerFn(sendAgentMessage), mediaFn = useServerFn(requestMedia);
  const assist = useServerFn(assistPostPrompt);
  const uploadPhoto = useServerFn(uploadPlannerPhoto);
  const save = useServerFn(saveDraftPost), approve = useServerFn(approvePost), schedule = useServerFn(schedulePost), publish = useServerFn(publishPost);
  const [step,setStep] = useState(1);
  const [knowledgeChosen,setKnowledgeChosen] = useState(false);
  const [topic,setTopic] = useState('');
  const suggestedIdeas = useRef<string[]>([]);
  const [goal,setGoal] = useState<Choice>('call');
  const [accountIds,setAccountIds] = useState<string[]>([]);
  const [mediaChoice,setMediaChoice] = useState<MediaChoice>('none');
  const [mediaUrl,setMediaUrl] = useState('');
  const [caption,setCaption] = useState('');
  const [captionFeedback,setCaptionFeedback] = useState('');
  const [imageFeedback,setImageFeedback] = useState('');
  const [regenerationStatus,setRegenerationStatus] = useState('');
  const [generationPhase,setGenerationPhase] = useState('');
  const [generationSeconds,setGenerationSeconds] = useState(0);
  const [assistSeconds,setAssistSeconds] = useState(0);
  const [title,setTitle] = useState('');
  const [timing,setTiming] = useState<Timing>('draft');
  const [localTime,setLocalTime] = useState('');
  const [busy,setBusy] = useState(false);
  const [uploading,setUploading] = useState(false);
  const [done,setDone] = useState('');
  const [error,setError] = useState('');
  const [postId] = useState(()=>`post_${crypto.randomUUID()}`);
  const choices = accounts.data?.accounts ?? [];
  const brandAccounts = choices.filter(a=>assignments.data?.[a.id]===brand.id);
  useEffect(()=>{if (!choices.length || accountIds.length) return;const saved=localStorage.getItem(`bcc:usual:${brand.id}`);const preferred=saved?.split(',').filter(id=>choices.some(a=>a.id===id)) ?? [];if(preferred.length)setAccountIds(preferred);else if(brandAccounts.length)setAccountIds(brandAccounts.map(a=>a.id));},[choices.length,brandAccounts.length,brand.id]);
  const selected=choices.filter(a=>accountIds.includes(a.id));
  async function requestImageWithRetry(prompt:string){
    let lastError='GHL did not return an image result.';
    for(let attempt=1;attempt<=2;attempt++){
      try{
        const image=await mediaFn({data:{brandId:brand.id,type:'image',prompt}});
        if(image?.mediaUrl)return image;
        lastError=image?.error || lastError;
        if(/capability|permission|authorization|401|403/i.test(lastError))break;
      }catch(error){lastError=error instanceof Error?error.message:lastError;}
      if(attempt===1)setGenerationPhase('GHL did not return an image. Trying once more…');
    }
    throw new Error(`${lastError} The planner tried twice; your caption is still here.`);
  }
  const ask=useMutation({mutationFn:async (kind:'first'|'caption'|'image')=>{
    if(kind==='first')setGenerationPhase('Writing your caption…');
    if(kind==='image') return requestImageWithRetry(`Photorealistic documentary-style social image for ${brand.name}. Subject: ${topic}. Natural lighting, believable people and equipment, no logos or text. Do not invent specific business claims. Create a different image from the current one. ${imageFeedback.trim()?`User feedback for this revision: ${imageFeedback.trim()}`:''}`);
    const captionResult=await agent({data:{brandId:brand.id,message:`Write one clear, natural social caption for ${brand.name}. Topic: ${topic}. Desired action: ${purposes.find(p=>p.id===goal)?.cta}. Use only verified brand knowledge. No invented prices, service area, response time, testimonials, or guarantees. Keep it concise and specific. ${kind==='caption'?`Revise this caption: ${caption}. Write a fresh version that keeps verified facts. ${captionFeedback.trim()?`Follow this user feedback: ${captionFeedback.trim()}`:'Use a different angle.'}`:''}`}});
    if(!captionResult?.reply?.trim())throw new Error(captionResult?.error || 'GHL did not return a caption. Try again.');
    if(kind==='first' && mediaChoice==='ai'){
      setGenerationPhase('Creating your image…');
      try{
        const image=await requestImageWithRetry(`Photorealistic documentary-style social image for ${brand.name}. Subject: ${topic}. Natural lighting, believable people and equipment, no logos or text. Do not invent specific business claims.`);
        return {...captionResult,mediaUrl:image.mediaUrl};
      }catch(error){
        setError(`${error instanceof Error?error.message:'Image generation failed.'} You can review the caption and retry the image.`);
        return captionResult;
      }
    }
    return captionResult;
  },onSuccess:(result,kind)=>{setGenerationPhase('');if(!result){setError('GHL returned no result. Try again; your current content is unchanged.');return;}if(kind==='image'){if('mediaUrl' in result && result.mediaUrl){setMediaUrl(result.mediaUrl);setImageFeedback('');setRegenerationStatus('Image updated.');}else setError(result.error || 'The agent did not return an image. Your current image is still here.');}else if('reply' in result){if(!result.reply?.trim()){setError('The agent did not return a caption. Your current caption is still here.');return;}if('mediaUrl' in result && result.mediaUrl)setMediaUrl(result.mediaUrl);setCaption(result.reply);setTitle(('title' in result && result.title) || topic.slice(0,70));if(kind==='caption'){setCaptionFeedback('');setRegenerationStatus('Caption updated.');}setStep(6);}},onError:e=>{setGenerationPhase('');setError(e.message)}});
  useEffect(()=>{if(!ask.isPending||ask.variables!=='first'){setGenerationSeconds(0);return;}const started=Date.now();const timer=window.setInterval(()=>setGenerationSeconds(Math.floor((Date.now()-started)/1000)),1000);return()=>window.clearInterval(timer);},[ask.isPending,ask.variables]);
  const suggest=useMutation({mutationFn:async()=>{
    const result=await assist({data:{brandId:brand.id,mode:'idea',context:'single',input:topic,previousIdeas:suggestedIdeas.current.slice(-8)}});
    if(suggestedIdeas.current.some(old=>old.toLowerCase()===result.text.toLowerCase()) || result.text.toLowerCase()===topic.trim().toLowerCase())throw new Error('The agent repeated an idea. Try again.');
    return result.text;
  },onSuccess:idea=>{suggestedIdeas.current.push(idea);setTopic(idea);setError('');},onError:e=>setError(e.message)});
  const improve=useMutation({mutationFn:async()=>{
    const result=await assist({data:{brandId:brand.id,mode:'improve',context:'single',input:topic,previousIdeas:[]}});
    return result.text;
  },onSuccess:text=>{setTopic(text);setError('');},onError:e=>setError(e.message)});
  const topicWordCount=topic.trim().split(/\s+/).filter(Boolean).length;
  useEffect(()=>{if(!suggest.isPending&&!improve.isPending){setAssistSeconds(0);return;}const started=Date.now();const timer=window.setInterval(()=>setAssistSeconds(Math.floor((Date.now()-started)/1000)),1000);return()=>window.clearInterval(timer);},[suggest.isPending,improve.isPending]);
  const post=():SocialPost=>{const now=new Date().toISOString();const image:MediaItem[] = mediaUrl && mediaChoice!=='none'?[{id:'media_1',url:mediaUrl,type:'image'}]:[];return {id:postId,brandId:brand.id,campaignId:null,type:'custom',accountIds,platforms:[...new Set(selected.map(a=>a.platform))],objective:goal==='comment'?'engagement':'awareness',format:image.length?'single_image':'text',title:title||topic.slice(0,70),body:caption,cta:purposes.find(p=>p.id===goal)?.cta || '',media:image,commentToDm:false,status:'draft',createdAt:now,updatedAt:now};};
  async function finish(){setBusy(true);setError('');try{if(!accountIds.length)throw new Error('Select at least one connected account.');let iso:string|undefined;if(timing==='later'){if(!timezone.data?.timezone)throw new Error('Set the GHL subaccount timezone before scheduling.');iso=zonedToIso(localTime,timezone.data.timezone);if(new Date(iso).getTime()<=Date.now())throw new Error('Choose a future time.');}const created=await save({data:{post:post()}});if(timing==='draft'){const failed=created.publishResults?.filter(result=>!result.ok)??[];setDone(failed.length?'Draft saved locally. GHL sync failed for some accounts; check Content before scheduling.':'Draft saved and synced to GHL Social Planner.');queryClient.invalidateQueries({queryKey:['posts']});return;}const reviewed=await approve({data:{id:created.id,approverName:'Chris'}});const result=timing==='later'?await schedule({data:{id:reviewed.id,scheduledAt:iso!}}):await publish({data:{id:reviewed.id}});const failed=result.publishResults?.filter(r=>!r.ok)??[];const succeeded=result.publishResults?.filter(r=>r.ok)??[];if(failed.length){setError(`${succeeded.length?'Some accounts succeeded. ':'The post remains as a GHL draft; scheduling did not complete. '}${failed.map(r=>`${selected.find(a=>a.id===r.accountId)?.account||r.platform}: ${r.error||'GHL rejected the request'}`).join(' · ')}`);}else setDone(timing==='later'?'Post scheduled in GHL. No further approval is needed.':'Post sent to GHL for publishing.');queryClient.invalidateQueries({queryKey:['posts']});}catch(e){setError(e instanceof Error?e.message:'Could not complete this action.');}finally{setBusy(false);}}
  async function handlePhoto(file: File | undefined){if(!file)return;setError('');if(file.size>25_000_000)return setError('Choose a photo smaller than 25 MB.');setUploading(true);try{const data=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]||'');reader.onerror=()=>reject(new Error('Could not read this photo.'));reader.readAsDataURL(file);});const result=await uploadPhoto({data:{name:file.name,mimeType:file.type,base64:data}});setMediaUrl(result.url);}catch(e){setError(e instanceof Error?e.message:'Could not upload photo.');}finally{setUploading(false);}}
  const next=()=>{setError('');if(step===1&&!knowledgeChosen)return setError('Choose a knowledge base and AI agent.');if(step===2&&!topic.trim())return setError('Tell us what the post is about.');if(step===4){if(!accountIds.length)return setError('Select at least one social account.');localStorage.setItem(`bcc:usual:${brand.id}`,accountIds.join(','));}if(step===5){if(mediaChoice==='photo'&&!/^https:\/\//.test(mediaUrl))return setError('Paste a public HTTPS image URL.');ask.mutate('first');return;}if(step===6&&!caption.trim())return setError('Add a caption first.');setStep(Math.min(7,step+1));};
  return <main className="mx-auto w-full max-w-4xl px-4 py-8 md:px-8 md:py-12">
    <Link to="/" className="text-sm font-semibold text-muted-foreground hover:text-foreground">← Back to Home</Link>
    <div className="mt-7 min-h-[min(650px,calc(100vh-210px))] rounded-[28px] border border-border bg-card p-6 shadow-[0_20px_60px_rgba(23,52,66,0.08)] sm:p-10">
    <p className="mt-7 text-xs font-semibold uppercase tracking-widest text-primary">Step {step} of 7{knowledgeChosen ? ` · ${brand.name}` : ''}</p>
    <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{width:`${step/7*100}%`}} /></div>
    {step===1&&<section><h1 className="mt-10 text-3xl font-semibold tracking-tight">Which knowledge base should guide this post?</h1><p className="mt-2 text-muted-foreground">Choose the GHL AI agent that knows this business. You can change it for each new post.</p><AgentPicker options={agentOptions} selectedId={knowledgeChosen ? brand.id : null} loading={agentsLoading} error={agentsError} onRefresh={() => void refreshAgents()} onSelect={id => { if (brand.id !== id) { suggestedIdeas.current = []; setTopic(''); } setBrandId(id); setKnowledgeChosen(true); setAccountIds([]); }} /></section>}
    {step===2&&<section><h1 className="mt-10 text-3xl font-semibold tracking-tight">What’s the post about?</h1><p className="mt-2 text-muted-foreground">A sentence or two is enough.</p><textarea aria-label="Post topic" className="mt-10 min-h-36 w-full rounded-xl border border-border bg-white p-4 text-base shadow-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/15" value={topic} onChange={e=>setTopic(e.target.value)} placeholder="Example: show how our team carefully loads a vehicle"/><button type="button" className="mt-3 text-sm text-primary hover:underline disabled:opacity-50" disabled={suggest.isPending||improve.isPending} onClick={()=>suggest.mutate()}>{suggest.isPending?'Connecting to GHL…':topic?'Suggest another idea':'Suggest an idea'}</button>{topicWordCount>=8&&<button type="button" className="ml-5 text-sm text-primary hover:underline disabled:opacity-50" disabled={suggest.isPending||improve.isPending} onClick={()=>improve.mutate()}>{improve.isPending?'Connecting to GHL…':'Improve prompt with AI'}</button>}{(suggest.isPending||improve.isPending)&&<div role="status" aria-live="polite" className="mt-5 rounded-xl border border-primary/25 bg-primary/5 p-4 text-sm text-foreground"><span className="flex items-center gap-2 font-semibold"><Loader2 className="h-4 w-4 animate-spin text-primary"/>Connecting to {brand.name} in GHL…</span><p className="mt-1 text-muted-foreground">{suggest.isPending?'Asking the agent for a fresh idea':'Asking the agent to expand your brief'} · {assistSeconds}s elapsed</p></div>}</section>}
    {step===3&&<section><h1 className="mt-10 text-3xl font-semibold tracking-tight">What should people do?</h1><div className="mt-10 grid gap-3 sm:grid-cols-2">{purposes.map(p=><button key={p.id} className={`${button} ${goal===p.id?'border-primary bg-primary/10':''}`} onClick={()=>setGoal(p.id)}>{p.label}</button>)}</div></section>}
    {step===4&&<section><h1 className="mt-10 text-3xl font-semibold tracking-tight">Where should it go?</h1><p className="mt-2 text-muted-foreground">Your usual choices are selected when available. Review them before continuing.</p><div className="mt-10"><SimpleAccountPicker accounts={choices} selectedIds={accountIds} onChange={setAccountIds} loading={accounts.isLoading} error={accounts.error?.message} /></div></section>}
    {step===5&&<section><h1 className="mt-10 text-3xl font-semibold tracking-tight">What image should we use?</h1><div className="mt-10 grid gap-3">{([['photo','Upload photo'],['ai','Create with AI'],['none','No image']] as const).map(([id,label])=><button key={id} className={`${button} ${mediaChoice===id?'border-primary bg-primary/10':''}`} onClick={()=>{setMediaChoice(id);setMediaUrl('');}}>{label}</button>)}</div>{mediaChoice==='photo'&&<><label className="mt-5 block text-sm">Upload a photo<input className="mt-2 block w-full text-sm" type="file" accept="image/jpeg,image/png,image/webp" onChange={e=>handlePhoto(e.target.files?.[0])}/></label>{uploading&&<p className="mt-2 text-sm text-muted-foreground">Uploading photo to GHL…</p>}<label className="mt-5 block text-sm">Or paste a public photo URL<input className="input mt-2 w-full" value={mediaUrl} onChange={e=>setMediaUrl(e.target.value)} placeholder="https://…"/></label><p className="mt-2 text-xs text-muted-foreground">Uploaded photos are saved to GHL Media Storage. Upload requires medias.write on the existing token.</p></>}{mediaChoice==='ai'&&<p className="mt-5 text-sm text-muted-foreground">Your image will be created when you continue to the preview.</p>}{mediaUrl&&<img src={mediaUrl} alt="Selected post visual" className="mt-5 max-h-64 rounded-xl object-contain"/>}{ask.isPending&&ask.variables==='first'&&<div role="status" aria-live="polite" className="mt-6 rounded-xl border border-primary/30 bg-primary/5 p-5"><div className="flex items-center gap-3 font-semibold"><Loader2 className="h-5 w-5 animate-spin text-primary"/>{generationPhase||'Creating your content…'}</div><p className="mt-2 text-sm text-muted-foreground">The preview will open when it is ready. {generationSeconds}s elapsed.</p><div className="mt-4 h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full w-1/3 animate-pulse rounded-full bg-primary"/></div></div>}</section>}
    {step===6&&<section><h1 className="mt-10 text-3xl font-semibold tracking-tight">How does this look?</h1><p className="mt-2 text-muted-foreground">Edit anything before it goes live.</p><div className="mt-6 rounded-2xl border border-border bg-card p-5">{mediaUrl&&mediaChoice!=='none'&&<img src={mediaUrl} alt="Post preview" className="mb-4 max-h-72 w-full rounded-lg object-contain"/>}<textarea aria-label="Edit caption" className="min-h-40 w-full rounded-xl border border-border bg-white p-4 text-base outline-none focus:border-primary focus:ring-2 focus:ring-primary/15" value={caption} onChange={e=>setCaption(e.target.value)}/><p className="mt-3 text-xs text-muted-foreground">{selected.map(a=>a.account).join(' · ')}</p></div><div className="mt-5 grid gap-4 sm:grid-cols-2"><div className="rounded-xl border border-border bg-card p-4"><label htmlFor="caption-feedback" className="text-sm font-semibold">What should change in the caption?</label><textarea id="caption-feedback" className="mt-2 min-h-24 w-full rounded-lg border border-border bg-white p-3 text-sm outline-none focus:border-primary" value={captionFeedback} onChange={e=>setCaptionFeedback(e.target.value)} placeholder="Example: make it shorter and more conversational"/><button type="button" className="mt-3 rounded-lg border border-border px-4 py-2 text-sm font-semibold disabled:opacity-50" disabled={ask.isPending} onClick={()=>{setError('');setRegenerationStatus('');ask.mutate('caption');}}>{ask.isPending&&ask.variables==='caption'?'Updating caption…':'Regenerate caption'}</button></div>{mediaChoice==='ai'&&<div className="rounded-xl border border-border bg-card p-4"><label htmlFor="image-feedback" className="text-sm font-semibold">What should change in the image?</label><textarea id="image-feedback" className="mt-2 min-h-24 w-full rounded-lg border border-border bg-white p-3 text-sm outline-none focus:border-primary" value={imageFeedback} onChange={e=>setImageFeedback(e.target.value)} placeholder="Example: use a real tow truck at dusk, no people"/><button type="button" className="mt-3 rounded-lg border border-border px-4 py-2 text-sm font-semibold disabled:opacity-50" disabled={ask.isPending} onClick={()=>{setError('');setRegenerationStatus('');ask.mutate('image');}}>{ask.isPending&&ask.variables==='image'?'Updating image…':'Regenerate image'}</button></div>}</div>{regenerationStatus&&<p role="status" className="mt-3 text-sm text-success">{regenerationStatus}</p>}</section>}
    {step===7&&<section><h1 className="mt-10 text-3xl font-semibold tracking-tight">When should it go live?</h1><div className="mt-10 grid gap-3">{([['draft','Save draft'],['later','Pick a time'],['now','Publish now']] as const).map(([id,label])=><button key={id} className={`${button} ${timing===id?'border-primary bg-primary/10':''}`} onClick={()=>setTiming(id)}>{label}</button>)}</div>{timing==='later'&&<div className="mt-5"><label className="text-sm">Date and time in {timezone.data?.timezone||'GHL subaccount timezone unavailable'}<input className="input mt-2 block w-full" type="datetime-local" value={localTime} onChange={e=>setLocalTime(e.target.value)}/></label>{!timezone.data?.timezone&&<p className="mt-2 text-sm text-warning">Set GHL_TIMEZONE to your subaccount’s timezone before scheduling.</p>}</div>}<div className="mt-6 rounded-xl border border-border bg-card p-4 text-sm"><strong>Final review</strong><p className="mt-2">{caption}</p><p className="mt-2 text-muted-foreground">To: {selected.map(a=>a.account).join(', ')}</p></div>{done?<p role="status" className="mt-5 text-success">{done} <Link to="/calendar" className="underline">View calendar</Link></p>:<button className="mt-6 w-full rounded-xl bg-primary px-5 py-3 font-semibold text-primary-foreground disabled:opacity-50" disabled={busy||timing==='later'&&(!localTime||!timezone.data?.timezone)} onClick={finish}>{busy?'Working…':timing==='draft'?'Save draft':timing==='later'?'Schedule post':'Publish now'}</button>}</section>}
    {error&&<p role="alert" className="mt-5 text-sm text-destructive">{error}</p>}
    {step<7&&<div className="mt-12 flex justify-between gap-3 border-t border-border pt-7"><button className={button} disabled={step===1||ask.isPending} onClick={()=>setStep(step-1)}>Back</button><button className="rounded-xl bg-primary px-7 py-3 font-semibold text-primary-foreground disabled:opacity-50" disabled={ask.isPending||uploading} onClick={next}>{ask.isPending?'Generating…':step===5?'Generate content':step===6?'Continue':'Continue'}</button></div>}
    {step===7&&<button className="mt-4 text-sm text-muted-foreground hover:text-foreground" onClick={()=>setStep(6)}>← Back to preview</button>}
    </div>
  </main>;
}
function zonedToIso(value:string,zone:string):string {if(!value)throw new Error('Choose a date and time.');const input=new Date(`${value}:00Z`);if(Number.isNaN(input.getTime()))throw new Error('Invalid date and time.');const formatter=new Intl.DateTimeFormat('en-US',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});const parts=Object.fromEntries(formatter.formatToParts(input).map(p=>[p.type,p.value]));const shown=Date.UTC(Number(parts['year']),Number(parts['month'])-1,Number(parts['day']),Number(parts['hour']),Number(parts['minute']));const output=new Date(input.getTime()+(input.getTime()-shown));const verify=formatter.formatToParts(output);const check=Object.fromEntries(verify.map(p=>[p.type,p.value]));const target=value.replace('T',' ').slice(0,16);const actual=`${check['year']}-${check['month']}-${check['day']} ${check['hour']}:${check['minute']}`;if(target!==actual)throw new Error('This local time does not exist in the selected timezone. Choose another time.');return output.toISOString();}
