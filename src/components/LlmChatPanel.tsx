import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ButtonComponent } from "@syncfusion/ej2-react-buttons";
import { invoke } from "@tauri-apps/api/tauri";
import type { LlmStatus } from "../types";
import { useNotifications } from "../stores/notifications";

const errorMessage = (err: unknown) => (err instanceof Error ? err.message : String(err));

const createId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);

type ChatRole = "user" | "assistant";

interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  timestamp: number;
}

interface LlmChatPanelProps {
  status: LlmStatus | null;
  busy?: boolean;
  onRefreshStatus?: () => Promise<unknown> | void;
  onClose?: () => void;
}

const MAX_TOKEN_PRESETS = [64, 128, 256];

export const LlmChatPanel: React.FC<LlmChatPanelProps> = ({
  status,
  busy = false,
  onRefreshStatus,
  onClose
}) => {
  const { notifyError, notifyInfo } = useNotifications();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [maxTokens, setMaxTokens] = useState<number>(128);
  const [isSending, setIsSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const configured = Boolean(status?.configured_path);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const assistantReadyText = useMemo(() => {
    if (!status) {
      return "Assistant status is unavailable.";
    }
    if (!status.configured_path) {
      return "Configure a model before starting a chat.";
    }
    if (!status.loaded) {
      return "Model is configured. First response may take a moment while it loads.";
    }
    return "Model is loaded and ready.";
  }, [status]);

  const handleSend = useCallback(async () => {
    const prompt = input.trim();
    if (!prompt || isSending || busy) {
      return;
    }
    if (!configured) {
      notifyInfo("Please configure a local model before chatting.");
      onRefreshStatus?.();
      return;
    }

    setIsSending(true);
    setInput("");

    const userMessage: ChatMessage = {
      id: createId(),
      role: "user",
      content: prompt,
      timestamp: Date.now()
    };

    setMessages((prev) => [...prev, userMessage]);

    try {
      const response = await invoke<string>("analyze_with_llm", {
        prompt,
        max_tokens: maxTokens
      });

      const trimmed = response?.trim() ?? "";
      const assistantMessage: ChatMessage = {
        id: createId(),
        role: "assistant",
        content: trimmed.length > 0 ? trimmed : "(No response returned)",
        timestamp: Date.now()
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (err) {
      console.error(err);
      notifyError(`Assistant error: ${errorMessage(err)}`);
      const fallback: ChatMessage = {
        id: createId(),
        role: "assistant",
        content: "Sorry, the assistant could not process that request.",
        timestamp: Date.now()
      };
      setMessages((prev) => [...prev, fallback]);
    } finally {
      setIsSending(false);
    }
  }, [input, isSending, busy, configured, notifyInfo, onRefreshStatus, maxTokens, notifyError]);

  const handleClearConversation = useCallback(() => {
    setMessages([]);
  }, []);

  const handleSubmit: React.FormEventHandler<HTMLFormElement> = useCallback(
    (event) => {
      event.preventDefault();
      void handleSend();
    },
    [handleSend]
  );

  const disableSend = !input.trim() || isSending || busy || !configured;

  return (
    <div
      style={{
        border: "1px solid #e5e7eb",
        borderRadius: "8px",
        backgroundColor: "#f9fafb",
        padding: "16px",
        display: "flex",
        flexDirection: "column",
        gap: "16px"
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h4 style={{ margin: "0 0 4px 0" }}>Try the local assistant</h4>
          <p style={{ margin: 0, color: "#6b7280", fontSize: "0.85rem" }}>{assistantReadyText}</p>
        </div>
        <div style={{ display: "flex", gap: "8px" }}>
          <ButtonComponent
            content="Clear conversation"
            cssClass="outlined"
            disabled={messages.length === 0}
            onClick={handleClearConversation}
          />
          {onRefreshStatus && (
            <ButtonComponent
              content="Refresh status"
              cssClass="outlined"
              disabled={busy}
              onClick={() => {
                void onRefreshStatus();
              }}
            />
          )}
          {onClose && (
            <ButtonComponent
              content="Close"
              cssClass="outlined"
              onClick={() => {
                onClose();
              }}
            />
          )}
        </div>
      </div>

      <div
        ref={scrollRef}
        style={{
          maxHeight: "320px",
          overflowY: "auto",
          border: "1px solid #e5e7eb",
          borderRadius: "8px",
          padding: "12px",
          backgroundColor: "#ffffff",
          display: "flex",
          flexDirection: "column",
          gap: "12px"
        }}
      >
        {messages.length === 0 && (
          <div style={{ color: "#6b7280", fontSize: "0.9rem" }}>
            Start a conversation to see the assistant responses here.
          </div>
        )}
        {messages.map((message) => (
          <div
            key={message.id}
            style={{
              alignSelf: message.role === "user" ? "flex-end" : "flex-start",
              backgroundColor: message.role === "user" ? "#2563eb" : "#f3f4f6",
              color: message.role === "user" ? "#ffffff" : "#111827",
              padding: "10px 12px",
              borderRadius:
                message.role === "user" ? "12px 12px 0 12px" : "12px 12px 12px 0",
              maxWidth: "80%",
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              fontSize: "0.95rem"
            }}
          >
            {message.content}
          </div>
        ))}
      </div>

      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        <textarea
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="Ask the assistant about an email, summarize a snippet, or request a classification."
          rows={3}
          style={{
            resize: "vertical",
            minHeight: "96px",
            padding: "12px",
            borderRadius: "8px",
            border: "1px solid #d1d5db",
            fontFamily: "inherit",
            fontSize: "0.95rem"
          }}
        />
        <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
          <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "0.85rem" }}>
            <span>Max tokens</span>
            <select
              value={maxTokens}
              onChange={(event) => setMaxTokens(Number(event.target.value) || 128)}
              disabled={isSending || busy}
              style={{
                borderRadius: "6px",
                border: "1px solid #d1d5db",
                padding: "6px 10px"
              }}
            >
              {MAX_TOKEN_PRESETS.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
          <ButtonComponent
            type="submit"
            cssClass="primary"
            content={isSending ? "Sending ..." : "Send"}
            disabled={disableSend}
          />
        </div>
      </form>
    </div>
  );
};

export default LlmChatPanel;
