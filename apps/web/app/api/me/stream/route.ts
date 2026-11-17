import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  let cleanup: (() => void) | null = null;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const enc = new TextEncoder();
      const send = (event: string, data: unknown) => {
        controller.enqueue(enc.encode(`event: ${event}\n`));
        controller.enqueue(enc.encode(`data: ${JSON.stringify(data)}\n\n`));
      };
      send("ready", { ok: true });
      // Mock mode: occasional simulated incoming message event
      const t = setInterval(() => {
        if (Math.random() < 0.15) {
          send("dm", {
            conversationId: "dm1",
            message: { id: `m_s_${Date.now()}`, conversationId: "dm1", senderId: "u2", text: "New message", createdAt: new Date().toISOString(), status: "sent" },
          });
        }
      }, 12000);
      // keepalive
      const k = setInterval(() => controller.enqueue(enc.encode(`: keepalive\n\n`)), 20000);
      cleanup = () => { clearInterval(t); clearInterval(k); };
    },
    cancel() {
      cleanup?.();
    },
  });

  return new NextResponse(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
