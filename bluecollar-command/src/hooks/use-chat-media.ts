// Focused hook that wires the Conversational AI chat (Create Content) to
// caption + visual generation. Keeps src/routes/create.tsx lean.
// Client-safe — calls server functions via useServerFn.

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { sendAgentMessage, requestMedia } from "@/lib/marketing.functions";
import type { BrandId, MediaItem, SocialPost } from "@/lib/types";

type SetPost = React.Dispatch<React.SetStateAction<SocialPost>>;

interface ChatState {
  executionId: string | undefined;
  turns: { role: "user" | "assistant"; content: string }[];
  input: string;
}

/**
 * Drive the Conversational AI chat. After the agent returns a caption we
 * generate + attach a visual so the post preview is never empty. The agent's
 * image tool fires when its scope is enabled; the branded SVG fallback in
 * agent.server.ts covers it otherwise.
 */
export function useChatMedia(brandId: BrandId, post: SocialPost, setPost: SetPost) {
  const sendMessage = useServerFn(sendAgentMessage);
  const requestMediaFn = useServerFn(requestMedia);

  const [chat, setChat] = useState<ChatState>({
    executionId: undefined,
    turns: [],
    input: "",
  });

  // Send the RAW user message — the server function (sendAgentMessage) applies
  // the framing via frameCaptionPrompt. Do NOT frame here; double-wrapping the
  // prompt causes the agent to echo the instructions back as the caption.
  const chatMut = useMutation({
    mutationFn: async (message: string) => {
      return sendMessage({
        data: { brandId, message, executionId: chat.executionId },
      });
    },
    onSuccess: async (data) => {
      setChat((c) => ({
        ...c,
        executionId: data.executionId ?? c.executionId,
        turns: data.turns ?? c.turns,
      }));
      if (data.error) toast.error(`Agent: ${data.error}`);
      const reply = (data.reply ?? "").trim();
      if (!reply) return;

      // The server function already parsed the structured JSON and validated
      // the caption — use the returned title + body directly.
      const title = (data.title ?? "").trim();
      setPost((p) => ({
        ...p,
        body: reply,
        title: p.title || title || reply.split("\n").filter(Boolean)[0]?.slice(0, 80) || "",
      }));

      if (!post.media.length && !["video", "reel", "story"].includes(post.format)) {
        try {
          const media = await requestMediaFn({
            data: {
              brandId,
              prompt: title || reply.slice(0, 160),
              type: "image",
              executionId: data.executionId,
            },
          });
          if (media?.mediaUrl) {
            const item: MediaItem = {
              id: `m_${Math.random().toString(36).slice(2, 8)}`,
              url: media.mediaUrl,
              type: "image",
            };
            setPost((p) => ({
              ...p,
              format: p.format === "text" ? "single_image" : p.format,
              media: [...p.media, item],
            }));
          }
          if (media?.error) toast.warning(`Visual: ${media.error}`);
        } catch {
          toast.warning("Visual generation unavailable — caption saved.");
        }
      }
    },
  });

  function handleSend() {
    const msg = chat.input.trim();
    if (!msg || chatMut.isPending) return;
    setChat((c) => ({ ...c, input: "" }));
    chatMut.mutate(msg);
  }

  function resetChat() {
    setChat({ executionId: undefined, turns: [], input: "" });
  }

  return { chat, setChat, chatMut, handleSend, resetChat };
}
