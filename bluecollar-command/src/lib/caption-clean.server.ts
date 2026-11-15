// Server-only caption cleaner. Extracted from marketing.server.ts so the
// cleaning logic is testable and focused — not buried in a 700-line module.
// Client code never imports this directly; it goes through marketing.server.ts.

/**
 * Reduce a conversational agent reply down to just the publishable caption.
 *
 * The brand agents are conversational: they return the FINISHED caption first,
 * then append meta-commentary — a markdown horizontal rule (---), an
 * "Offer terms used are exactly as provided:" recap with bullet points, and a
 * trailing "Would you like me to post this to a connected account?" follow-up
 * question. Instead of filtering lines one-by-one with regex (which mangles
 * real copy and misses new chatter patterns), we CUT at the first strong
 * structural boundary and keep only the caption part before it.
 *
 * This PRESERVES the real caption copy, including:
 *   - Hashtag lines (#FreeTow #ColumbusTow)
 *   - Marketing hooks that use "?" ("Stuck in Columbus? Your tow is on us.")
 *   - Emoji (🚗 💪 👇)
 *   - Multi-sentence copy with dollar amounts and offer details
 *
 * Returns "" when nothing usable remains so the caller surfaces the error
 * instead of inventing copy.
 */
export function cleanCaption(raw: string): string {
  if (!raw) return "";

  let text = raw;

  // 0. CUT at the first strong structural boundary. Everything from the first
  //    such marker onward is meta-commentary (offer-terms recap, follow-up
  //    question, horizontal rule) — drop it and keep only the caption.
  const boundaries: RegExp[] = [
    /\n\s*-{3,}\s*(?:\n|$)/, // markdown horizontal rule (--- or more)
    /\n\s*Offer terms used are exactly as provided/i, // offer-terms recap header
    /\n\s*Here are the (?:offer )?terms/i,
    /\n\s*Here'?s (?:the |an )?(?:offer )?terms/i,
    /\n\s*Terms (?:used|for this post)[:：]/i,
    /\n\s*Recap of (?:the )?offer/i,
    /\n\s*Would you like me to/i, // trailing conversational follow-up
    /\n\s*Would you like to/i,
    /\n\s*Let me know if you'?d like/i,
    /\n\s*Let me know (?:if|whether)/i,
    /\n\s*Let me know how you'?d like/i,
    /\n\s*Do you want me to/i,
    /\n\s*Should I (?:post|schedule|adjust|create|draft|send)/i,
    /\n\s*Shall I /i,
    /\n\s*Want me to /i,
    /\n\s*Just let me know/i,
    /\n\s*I can also /i,
    /\n\s*Happy to (?:adjust|post|schedule|create)/i,
  ];
  let cutAt = text.length;
  for (const re of boundaries) {
    const m = text.match(re);
    if (m && m.index !== undefined && m.index < cutAt) {
      cutAt = m.index;
    }
  }
  if (cutAt < text.length) {
    text = text.slice(0, cutAt);
  }

  // 1. Strip instruction-echo fragments the agent may PREPEND
  //    ("Write one ready-to-publish caption…", "Output only the caption…").
  //    If the reply starts with our framing preamble, cut everything up to the
  //    first blank line (the agent puts the real caption after a blank line).
  const preambleEnd = text.search(/\n\s*\n/);
  if (
    preambleEnd > 0 &&
    /write (?:one |a )?ready[- ]to[- ]publish|output (?:only|just)|details provided|no (?:questions|options|preamble|brand card)/i.test(
      text.slice(0, preambleEnd),
    )
  ) {
    text = text.slice(preambleEnd).trimStart();
  }
  // Also strip any standalone framing fragments that survived (e.g. when the
  // agent didn't use a blank-line separator).
  text = text
    .replace(/write (?:one |a )?ready[- ]to[- ]publish[^.]*\./gi, "")
    .replace(/output (?:only|just)[^.]*\./gi, "")
    .replace(/(?:do not|don'?t)[^.]*(?:ask|invent|preamble|brand card|clarifying)[^.]*\./gi, "")
    .replace(/use (?:only )?(?:the )?details provided (?:below|in this)[^.]*\./gi, "")
    .replace(/no questions[^.]*\./gi, "")
    .replace(/no options[^.]*\./gi, "")
    .replace(/no preamble[^.]*\./gi, "")
    .replace(/no brand card[^.]*\./gi, "")
    .replace(/\bdetails?\s*:\s*/gi, " ");

  // 2. If a labeled caption section exists ("CAPTION:", "Final caption:"),
  //    extract just that section up to the next labeled block.
  const captionHeaderMatch = text.match(
    new RegExp(
      "(?:finalized|approved|ready[- ]to[- ]publish|final)\\s*(?:caption|copy|post)|(?:^|\\n)(?:caption|copy|body)\\s*[:：]\\s*",
      "i",
    ),
  );
  if (captionHeaderMatch && captionHeaderMatch.index !== undefined) {
    const start = captionHeaderMatch.index + captionHeaderMatch[0].length;
    const remainder = text.slice(start);
    const stopMatch = remainder.match(
      new RegExp(
        "\\n\\s*(?:which account|image prompt|visual prompt|cta|call to action|hashtags?[:：]|offer terms|would you like)",
        "i",
      ),
    );
    const snippet =
      stopMatch && stopMatch.index !== undefined ? remainder.slice(0, stopMatch.index) : remainder;
    if (snippet.trim().length > 30) {
      return cleanCaptionLines(snippet);
    }
  }

  return cleanCaptionLines(text);
}

function cleanCaptionLines(text: string): string {
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    // Strip markdown headings (# Heading / ## Heading) but keep hashtags (#tag)
    .filter((l) => !/^#{1,6}\s/.test(l))
    // Strip markdown table rows, divider lines, AND tab-delimited table rows.
    // The agent's "brand card" uses `Field\tValue`, `Business\tConvini`, etc.
    .filter((l) => !/^\|.*\|$/.test(l))
    .filter((l) => !/^\|[-: |]+\|?\s*$/.test(l))
    .filter((l) => !/\t/.test(l))
    // Strip "Here is/Here's/Here are your..." preambles
    .filter((l) => !/^here(?:'s| is| are) /i.test(l))
    .filter((l) => !/^sure[,!]/i.test(l))
    // Strip conversational scaffolding the agent prepends
    .filter((l) => !/^before i (?:draft|write|start)/i.test(l))
    .filter((l) => !/^i(?:'ve| have) (?:built|drafted|created|found|got)/i.test(l))
    .filter((l) => !/^i(?:'?m| am) ready to/i.test(l))
    .filter((l) => !/^let me (?:know|save|schedule|create)/i.test(l))
    .filter((l) => !/^what would you like/i.test(l))
    .filter((l) => !/^how can i help/i.test(l))
    // Strip brand-card dump patterns — including emoji-prefixed headers
    // (🎨 Brand Card — Convini) and bold **Field:** labels
    .filter((l) => !/brand card/i.test(l))
    .filter(
      (l) =>
        !/^\*{0,2}(?:business|voice|audience|primary|font|logo|sources|field)\s*[:：]\s*\*{0,2}/i.test(
          l,
        ),
    )
    .filter((l) => !/^\*{0,2}no recent posts\*{0,2}/i.test(l))
    .filter((l) => !/^\*{0,2}clean slate\*{0,2}/i.test(l))
    // Strip account-selection questions the agent asks — including numbered
    // list items ("1. Which accounts should I post to?")
    .filter((l) => !/^\*{0,2}which account/i.test(l))
    .filter((l) => !/^\d+\.\s*(?:which|what|how|should|can|do|could)\b/i.test(l))
    .filter((l) => !/^you have \d+ connected account/i.test(l))
    .filter((l) => !/pick by number|name the ones you want/i.test(l))
    .filter((l) => !/once confirmed/i.test(l))
    .filter((l) => !/before anything is saved or posted/i.test(l))
    .filter((l) => !/a few (?:details|quick) (?:questions|about)/i.test(l))
    .filter((l) => !/two quick questions/i.test(l))
    // Remove markdown image/link lines the agent emits alongside generatedMedia
    .filter((l) => !/^!\[/.test(l))
    .filter((l) => !/^\[(open|view|see) /i.test(l))
    .filter((l) => !/system time update/i.test(l))
    .filter((l) => !/no action needed on my end/i.test(l))
    // Strip SHORT conversational questions directed at the user (agent
    // chatter like "Should I post to all of them?"), but PRESERVE longer
    // caption lines that legitimately use "?" as a marketing hook.
    .filter((l) => {
      if (!l.endsWith("?") && !l.endsWith("?**")) return true;
      if (l.length > 90) return true; // long enough to be real caption content
      const lower = l.toLowerCase();
      const questionStarters = [
        "would",
        "should",
        "could",
        "do",
        "does",
        "can",
        "may",
        "shall",
        "what",
        "how",
        "which",
        "are",
        "is",
        "will",
      ];
      const startsWithQuestion = questionStarters.some(
        (q) => lower.startsWith(q) || lower.startsWith("**" + q),
      );
      return !startsWithQuestion;
    });

  let out = lines
    .join("\n")
    .replace(/^\s*(?:caption|body|copy|post)\s*[:：]\s*/i, "")
    .trim();
  out = out.replace(/\n{3,}/g, "\n\n");
  return out;
}

/**
 * Detect whether a raw agent reply is purely conversational chatter (brand
 * card, clarifying questions, greeting, instruction echo, offer-terms recap,
 * or a trailing follow-up) with no usable caption. Used by the batch generator
 * to decide whether to fall back to the brief instead of dumping the agent's
 * chatter into the post body.
 */
export function isChatter(raw: string): boolean {
  if (!raw) return false;
  const cleaned = cleanCaption(raw);
  if (cleaned.length > 40) return false;
  return /ready to help|what would you like to (?:create|post|do)|how can i (?:assist|help)|which account|brand card|two quick questions|a few details|ready-to-publish|output only|details provided|offer terms used are exactly as provided|would you like me to|let me know if you'?d like|just let me know/i.test(
    raw,
  );
}

/**
 * Extract the first balanced JSON object from a string. Handles JSON embedded
 * in surrounding text (agent chatter, markdown fences) without needing a
 * full parser.
 */
function extractFirstJson(text: string): string | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const search = fenced ? fenced[1] : text;
  const start = search.indexOf("{");
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < search.length; i++) {
    const ch = search[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (ch === "\\") {
      escape = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return search.slice(start, i + 1);
    }
  }
  return null;
}

/**
 * Parse a structured {"title": "...", "body": "..."} caption from an agent
 * reply. The agent is asked to respond with this JSON format so the caption
 * never gets mixed with the prompt instructions or conversational chatter.
 * Returns { title, body } when the JSON parses, or {} when it doesn't.
 */
export function parseStructuredCaption(raw: string): { title?: string; body?: string } {
  if (!raw) return {};
  const jsonStr = extractFirstJson(raw);
  if (!jsonStr) return {};
  try {
    const parsed = JSON.parse(jsonStr);
    if (typeof parsed !== "object" || parsed === null) return {};
    const title = typeof parsed.title === "string" ? parsed.title.trim() : undefined;
    const body = typeof parsed.body === "string" ? parsed.body.trim() : undefined;
    return {
      title: title && title.length > 0 ? title : undefined,
      body: body && body.length > 0 ? body : undefined,
    };
  } catch {
    return {};
  }
}

/**
 * Validate that a caption is real publishable content — not empty, not the
 * prompt echoed back, not conversational chatter. This is the post-generation
 * check that prevents garbage from landing in a post. Returns true when the
 * caption is clean and ready to publish.
 */
export function validateCaption(text: string): boolean {
  if (!text || text.trim().length < 10) return false;
  const trimmed = text.trim();
  const lower = trimmed.toLowerCase();
  if (
    lower.includes("system role:") ||
    lower.includes("output only") ||
    lower.includes("json object") ||
    lower.includes('"title"') ||
    lower.includes('"body"') ||
    lower.includes("respond with") ||
    lower.includes("do not echo")
  )
    return false;
  if (
    /^(i'?ve built|i have built|here'?s the|here is the|would you like|should i post|let me know|before i draft|what would you like|how can i help|sure[,!]|totally understood|i hear you|important:)/i.test(
      trimmed,
    )
  )
    return false;
  if (/\bbrand card\b/i.test(trimmed)) return false;
  return true;
}
