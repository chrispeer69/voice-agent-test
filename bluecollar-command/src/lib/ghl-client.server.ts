/** Server-only GHL transport. Credentials may only be sent to the official API. */
export async function ghlFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const target = new URL(url);
  if (target.origin !== 'https://services.leadconnectorhq.com' || target.username || target.password) {
    throw new Error('GHL requests must use the official API origin');
  }
  const timeout = AbortSignal.timeout(target.pathname.startsWith('/agent-studio/') ? 120_000 : 30_000);
  return fetch(target, {
    ...init,
    redirect: 'error',
    signal: init.signal ? AbortSignal.any([init.signal, timeout]) : timeout,
  });
}
