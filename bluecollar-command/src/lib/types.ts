// Shared domain types for the Blue Collar AI Marketing Command Center.
// These are client-safe (no secrets) and used across routes and server functions.

export type BrandId = "convini" | "ustow" | (string & {});

export interface Brand {
  id: BrandId;
  name: string;
  shortName: string;
  tagline: string;
  accentClass: string; // tailwind class for accent color
  dotClass: string; // status dot color
}

export const BRANDS: Brand[] = [
  {
    id: "convini",
    name: "Convini",
    shortName: "CVN",
    tagline: "",
    accentClass: "text-brand-convini",
    dotClass: "bg-brand-convini",
  },
  {
    id: "ustow",
    name: "US Tow AI Connect",
    shortName: "UST",
    tagline: "",
    accentClass: "text-brand-ustow",
    dotClass: "bg-brand-ustow",
  },
];

export function getBrand(id: BrandId): Brand {
  return BRANDS.find((b) => b.id === id) ?? {
    id, name: "AI Agent", shortName: "AI", tagline: "",
    accentClass: "text-primary", dotClass: "bg-primary",
  };
}

export type Platform = "facebook" | "instagram" | "linkedin" | "google" | "twitter";

export const PLATFORMS: { id: Platform; label: string; icon: string }[] = [
  { id: "facebook", label: "Facebook", icon: "facebook" },
  { id: "instagram", label: "Instagram", icon: "instagram" },
  { id: "linkedin", label: "LinkedIn", icon: "linkedin" },
  { id: "google", label: "Google Business", icon: "google" },
  { id: "twitter", label: "X / Twitter", icon: "twitter" },
];

export type PostType =
  "offer" | "explainer" | "educational" | "testimonial" | "announcement" | "feature" | "custom";

export const POST_TYPES: { id: PostType; label: string; description: string }[] = [
  { id: "offer", label: "Offer", description: "Promotion, discount, or limited-time deal" },
  { id: "explainer", label: "Explainer", description: "Break down how a service works" },
  { id: "educational", label: "Educational", description: "Teach the audience something useful" },
  { id: "testimonial", label: "Testimonial", description: "Customer story or review" },
  { id: "announcement", label: "Announcement", description: "News, update, or event" },
  { id: "feature", label: "Feature Highlight", description: "Spotlight a product capability" },
  { id: "custom", label: "Custom", description: "Free-form content brief" },
];

/**
 * Expanded approval lifecycle:
 * draft -> in_review -> approved -> scheduled -> published
 * Any of draft/in_review/approved/scheduled can move to denied.
 */
export type PostStatus =
  "draft" | "in_review" | "approved" | "scheduled" | "publishing" | "published" | "failed" | "denied";

export const STATUS_META: Record<PostStatus, { label: string; dot: string; badge: string }> = {
  draft: { label: "Draft", dot: "bg-muted-foreground", badge: "bg-muted text-muted-foreground" },
  in_review: {
    label: "In Review",
    dot: "bg-warning",
    badge: "bg-warning/15 text-warning",
  },
  approved: {
    label: "Approved",
    dot: "bg-success",
    badge: "bg-success/15 text-success",
  },
  scheduled: { label: "Scheduled", dot: "bg-primary", badge: "bg-primary/15 text-primary" },
  publishing: { label: "Processing in GHL", dot: "bg-warning", badge: "bg-warning/15 text-warning" },
  published: { label: "Published", dot: "bg-success", badge: "bg-success/15 text-success" },
  failed: { label: "Failed", dot: "bg-destructive", badge: "bg-destructive/15 text-destructive" },
  denied: {
    label: "Denied",
    dot: "bg-destructive",
    badge: "bg-destructive/15 text-destructive",
  },
};

export type CampaignObjective =
  "awareness" | "engagement" | "leads" | "conversions" | "retention" | "support";

export const OBJECTIVES: { id: CampaignObjective; label: string }[] = [
  { id: "awareness", label: "Brand Awareness" },
  { id: "engagement", label: "Engagement" },
  { id: "leads", label: "Lead Generation" },
  { id: "conversions", label: "Conversions / Sales" },
  { id: "retention", label: "Customer Retention" },
  { id: "support", label: "Customer Support" },
];

export type CampaignCadence = "one_time" | "weekly" | "monthly";

/**
 * Content format. Carousels (multiple images) are only valid for text/image
 * formats — never for video, reel, or story.
 */
export type ContentFormat = "text" | "single_image" | "image_carousel" | "video" | "reel" | "story";

export const CONTENT_FORMATS: {
  id: ContentFormat;
  label: string;
  description: string;
  supportsCarousel: boolean;
}[] = [
  { id: "text", label: "Text", description: "Text-only post, no media", supportsCarousel: false },
  {
    id: "single_image",
    label: "Single Image",
    description: "One image attached",
    supportsCarousel: false,
  },
  {
    id: "image_carousel",
    label: "Image Carousel",
    description: "Multiple images (Facebook & Instagram)",
    supportsCarousel: true,
  },
  { id: "video", label: "Video", description: "A video post", supportsCarousel: false },
  { id: "reel", label: "Reel", description: "Short-form vertical video", supportsCarousel: false },
  { id: "story", label: "Story", description: "Ephemeral story", supportsCarousel: false },
];

/** Per-platform media limits used to validate carousel selections. */
export const PLATFORM_MEDIA_LIMITS: Record<
  Platform,
  { maxImages: number; supportsCarousel: boolean }
> = {
  facebook: { maxImages: 10, supportsCarousel: true },
  instagram: { maxImages: 10, supportsCarousel: true },
  linkedin: { maxImages: 9, supportsCarousel: false },
  google: { maxImages: 1, supportsCarousel: false },
  twitter: { maxImages: 4, supportsCarousel: false },
};

export interface MediaItem {
  id: string;
  url: string;
  type: "image" | "video";
  /** Optional per-platform caption override. */
  caption?: string;
}

export interface SocialPost {
  brandUnassigned?: boolean;
  ghlParentPostId?: string;
  id: string;
  brandId: BrandId;
  campaignId: string | null;
  type: PostType;
  /** Connected account IDs selected to publish to (source of truth). */
  accountIds: string[];
  /** Derived platforms for display/filtering, inferred from accountIds. */
  platforms: Platform[];
  objective: CampaignObjective;
  format: ContentFormat;
  title: string;
  body: string;
  /** Per-platform copy overrides keyed by platform. */
  copyByPlatform?: Partial<Record<Platform, string>>;
  offer?: string;
  cta?: string;
  media: MediaItem[];
  commentToDm: boolean;
  commentToDmKeyword?: string;
  status: PostStatus;
  /** Denial reason — required when status === "denied". */
  denialReason?: string;
  /** User who approved/denied, loaded from HighLevel users. */
  reviewedBy?: string;
  scheduledAt?: string; // ISO
  publishedAt?: string;
  createdAt: string;
  updatedAt: string;
  ghlPostId?: string;
  agentExecutionId?: string;
  /** Per-account GHL scheduling results for batch publishing. */
  publishResults?: PublishResult[];
}

export interface PublishResult {
  status?: PostStatus;
  accountId?: string;
  platform: Platform;
  ok: boolean;
  ghlPostId?: string;
  error?: string;
}

export interface Campaign {
  id: string;
  brandId: BrandId;
  name: string;
  objective: CampaignObjective;
  cadence: CampaignCadence;
  startDate: string;
  endDate?: string;
  postCount: number;
  description?: string;
}

export interface Comment {
  id: string;
  postId: string;
  brandId: BrandId;
  platform: Platform;
  author: string;
  text: string;
  createdAt: string;
  isDmTriggered: boolean; // comment-to-DM campaign activity
  reply?: string;
  replyAuthor?: string;
  repliedAt?: string;
}

export interface ConversationTurn {
  role: "user" | "assistant";
  content: string;
  createdAt: string;
}

export interface AgentSession {
  executionId: string;
  brandId: BrandId;
  turns: ConversationTurn[];
  draftPostId?: string;
  createdAt: string;
}

export interface AnalyticsSummary {
  brandId: BrandId;
  platform: Platform;
  reach: number;
  engagement: number;
  comments: number;
  clicks: number;
  publishedCount: number;
  scheduledCount: number;
  draftCount: number;
}

export interface AnalyticsRecommendation {
  id: string;
  brandId: BrandId;
  title: string;
  detail: string;
  priority: "high" | "medium" | "low";
}

/** A connected social account returned by the social planner. */
export interface SocialAccount {
  originId?: string;
  profileId?: string;
  id: string;
  platform: Platform;
  account: string;
  /** Profile image URL when available. */
  profileImageUrl?: string;
}

/** A valid approver loaded from HighLevel users. */
export interface Approver {
  id: string;
  name: string;
  email: string;
}

/** Map a raw social-planner platform string to our Platform enum. */
export function mapPlatform(type: string): Platform | null {
  const t = String(type ?? "").toLowerCase();
  if (t.includes("facebook")) return "facebook";
  if (t.includes("instagram")) return "instagram";
  if (t.includes("linkedin")) return "linkedin";
  if (t.includes("google") || t.includes("gmb")) return "google";
  if (t.includes("twitter") || t === "x") return "twitter";
  return null;
}
