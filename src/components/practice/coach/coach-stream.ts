// Shared plain-text streaming fetch, lifted from the old hint-panel.tsx.
// Both /api/hint and /api/coach return a raw text/plain token stream
// (streamText(...).toTextStreamResponse()) rather than the AI SDK's
// data-stream protocol, so a manual reader is simpler and more honest than
// pulling in @ai-sdk/react (not installed) just to set streamProtocol: "text".
export interface StreamOutcome {
  ok: boolean;
  text: string;
  error?: string;
}

export async function streamPlainText(
  url: string,
  body: unknown,
  onChunk: (accumulated: string) => void,
): Promise<StreamOutcome> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    return { ok: false, text: "", error: "Couldn't reach the coach right now." };
  }

  if (!res.ok || !res.body) {
    const parsed = await res.json().catch(() => ({}) as { error?: string });
    return { ok: false, text: "", error: parsed.error ?? "Couldn't get a response right now." };
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let text = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    text += decoder.decode(value, { stream: true });
    onChunk(text);
  }
  return { ok: true, text };
}
