import type { Platform, PostStatus, SocialPost } from './types';

export function normalizePostStatus(status: unknown): PostStatus {
  const value = String(status ?? '').toLowerCase();
  if (value === 'published') return 'published';
  if (['pending', 'in_progress', 'notification_sent'].includes(value)) return 'publishing';
  if (value === 'scheduled') return 'scheduled';
  if (value === 'in_review') return 'in_review';
  if (value.includes('fail') || value.includes('error')) return 'failed';
  if (value === 'denied') return 'denied';
  return 'draft';
}

export function buildPostPayload(post: SocialPost, accountId: string, platform: Platform, status: 'draft' | 'scheduled' | 'published', userId: string) {
  if (!accountId || !post.accountIds.includes(accountId)) throw new Error('Select an account before publishing.');
  const summary = post.copyByPlatform?.[platform] ?? post.body;
  if (status !== 'draft' && !summary.trim() && !post.media.length) throw new Error('Add content or media before publishing.');
  if (status !== 'draft' && platform === 'instagram' && !post.media.length) throw new Error('Instagram requires an image or video.');
  if (platform === 'google') {
    if (summary.length > 1500) throw new Error('Google Business Profile posts must be 1,500 characters or fewer.');
    if (post.media.length > 1 || post.media.some(item => item.type !== 'image' || !/\.(jpe?g|png)(?:\?|$)/i.test(item.url))) {
      throw new Error('Google Business Profile supports one JPEG or PNG image and no video.');
    }
  }
  const type = ['story', 'reel'].includes(post.format) ? post.format : 'post';
  if (type !== 'post' && !['facebook', 'instagram'].includes(platform)) throw new Error(`${type} is not supported for ${platform}.`);
  if (type === 'reel' && (post.media.length !== 1 || post.media[0]?.type !== 'video')) throw new Error('Reels require exactly one video.');
  const media = post.media.map(m => {
    const url = new URL(m.url);
    if (url.protocol !== 'https:') throw new Error('Media must use a publicly accessible HTTPS URL.');
    const extension = url.pathname.split('.').pop()?.toLowerCase();
    const mime = m.type === 'video' ? (extension === 'webm' ? 'video/webm' : extension === 'mov' ? 'video/mov' : 'video/mp4') : extension === 'png' ? 'image/png' : extension === 'gif' ? 'image/gif' : 'image/jpeg';
    return { url: m.url, type: mime, ...(m.caption ? { caption: m.caption } : {}) };
  });
  const payload: Record<string, unknown> = { accountIds: [accountId], summary, media, status, type, userId };
  if (platform === 'instagram') payload.instagramPostDetails = { type };
  if (platform === 'facebook') payload.facebookPostDetails = { type };
  if (platform === 'google') payload.gmbPostDetails = { gmbEventType: 'STANDARD' };
  if (status === 'scheduled') {
    const time = Date.parse(post.scheduledAt || '');
    if (!Number.isFinite(time) || time <= Date.now()) throw new Error('Choose a valid future date before scheduling.');
    payload.scheduleDate = new Date(time).toISOString();
  }
  return payload;
}

export function parsePostWriteResponse(data: any): { id: string; status: PostStatus } {
  if (data?.success === false) throw new Error(String(data.message || 'GHL rejected the post.'));
  const post = data?.results?.post ?? data?.post ?? data;
  const id = post?._id ?? post?.id ?? data?.postId;
  if (!id || typeof id !== 'string') throw new Error('GHL did not return a post ID. Check GHL before retrying.');
  const status = normalizePostStatus(post.status);
  if (status === 'failed') throw new Error(String(post.error || 'GHL reported a publishing failure.'));
  return { id, status: post.status ? status : 'publishing' };
}
