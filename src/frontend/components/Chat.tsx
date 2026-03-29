import { AssistantRuntimeProvider, useExternalStoreRuntime } from "@assistant-ui/react";
import React, { useState } from "react";

export function Chat() {
  const [messages, setMessages] = useState<Message[]>([]);

  const runtime = useExternalStoreRuntime({
    messages,
    isRunning: false,
    onNew: async (msg) => {
      setMessages((prev) => [
        ...prev,
        {
          ...msg,
          id: Date.now().toString(),
          role: "user",
          content: [{ type: "text", text: msg.content[0]?.text || "" }],
        },
      ]);

      try {
        const response = await fetch("/chat", {
          method: "POST",
          body: JSON.stringify({
            messages: [...messages, { role: "user", content: msg.content[0]?.text }],
          }),
          headers: { "Content-Type": "application/json" },
        });

        // Handling response stream simply for mock
        const reader = response.body?.getReader();
        if (reader) {
          const decoder = new TextDecoder();
          let done = false;
          let assistantMessage = "";

          while (!done) {
            const { value, done: readerDone } = await reader.read();
            done = readerDone;
            if (value) {
              assistantMessage += decoder.decode(value);
            }
          }
          setMessages((prev) => [
            ...prev,
            {
              id: Date.now().toString(),
              role: "assistant",
              content: [{ type: "text", text: assistantMessage }],
            },
          ]);
        }
      } catch (e) {
        console.error("Chat error:", JSON.stringify(e));
      }
    },
  });

  return (
    <div className="h-full">
      <AssistantRuntimeProvider runtime={runtime}>
        <div>
          <div />
        </div>
      </AssistantRuntimeProvider>
    </div>
  );
}
