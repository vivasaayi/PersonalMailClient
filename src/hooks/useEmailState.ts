import { useCallback, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/tauri";
import type { DeletedEmail, EmailSummary, SenderGroup, SenderStatus } from "../types";

const MIN_CACHE_FETCH = 1_000;
const MAX_CACHE_FETCH = 50_000;

export function useEmailState() {
  const [emailsByAccount, setEmailsByAccount] = useState<Record<string, EmailSummary[]>>({});
  const [cachedCountsByAccount, setCachedCountsByAccount] = useState<Record<string, number>>({});
  const [senderGroupsByAccount, setSenderGroupsByAccount] = useState<Record<string, SenderGroup[]>>({});
  const [deletedEmailsByAccount, setDeletedEmailsByAccount] = useState<Record<string, DeletedEmail[]>>({});
  const [expandedSenders, setExpandedSenders] = useState<Record<string, string | null>>({});
  
  const maxCachedItemsByAccount = useRef<Record<string, number>>({});
  const cachedCountRef = useRef<Record<string, number>>({});

  const recordCachedCount = useCallback((accountEmail: string, count: number) => {
    cachedCountRef.current = {
      ...cachedCountRef.current,
      [accountEmail]: count
    };
    setCachedCountsByAccount(cachedCountRef.current);
    const capped = Math.min(count, MAX_CACHE_FETCH);
    maxCachedItemsByAccount.current[accountEmail] = Math.max(
      maxCachedItemsByAccount.current[accountEmail] ?? 0,
      capped,
      MIN_CACHE_FETCH
    );
  }, []);

  const loadCachedCount = useCallback(async (accountEmail: string) => {
    const count = await invoke<number>("cached_message_count", { email: accountEmail });
    recordCachedCount(accountEmail, count);
    return count;
  }, [recordCachedCount]);

  const loadCachedEmails = useCallback(async (
    accountEmail: string,
    limit?: number,
    scrollTop?: number
  ) => {
    const previousMax = maxCachedItemsByAccount.current[accountEmail] ?? 0;
    const knownTotal = cachedCountRef.current[accountEmail] ?? 0;
    const requested = limit ?? previousMax;
    const baseline = requested > 0 ? requested : MIN_CACHE_FETCH;
    const desired = Math.max(baseline, previousMax, knownTotal, MIN_CACHE_FETCH);
    const effectiveLimit = Math.min(desired, MAX_CACHE_FETCH);
    
    maxCachedItemsByAccount.current[accountEmail] = Math.max(
      maxCachedItemsByAccount.current[accountEmail] ?? 0,
      effectiveLimit,
      Math.min(knownTotal, MAX_CACHE_FETCH)
    );

    const cached = await invoke<EmailSummary[]>("list_recent_messages", {
      email: accountEmail,
      limit: effectiveLimit
    });

    maxCachedItemsByAccount.current[accountEmail] = Math.max(
      maxCachedItemsByAccount.current[accountEmail] ?? 0,
      cached.length,
      Math.min(knownTotal, MAX_CACHE_FETCH)
    );

    setEmailsByAccount((prev) => ({
      ...prev,
      [accountEmail]: cached
    }));

    return { cached, scrollTop };
  }, []);

  const loadSenderGroups = useCallback(async (accountEmail: string) => {
    const groups = await invoke<SenderGroup[]>("list_sender_groups", {
      email: accountEmail
    });

    setSenderGroupsByAccount((prev) => {
      const existing = prev[accountEmail] ?? [];
      const unchanged =
        existing.length === groups.length &&
        existing.every((group, index) => {
          const next = groups[index];
          if (!next) return false;
          
          const sameMeta =
            group.sender_email === next.sender_email &&
            group.status === next.status &&
            group.message_count === next.message_count &&
            group.messages.length === next.messages.length;
          
          if (!sameMeta) return false;

          return group.messages.every((msg, msgIdx) => {
            const nextMsg = next.messages[msgIdx];
            if (!nextMsg) return false;
            return (
              msg.uid === nextMsg.uid &&
              msg.subject === nextMsg.subject &&
              msg.date === nextMsg.date &&
              msg.snippet === nextMsg.snippet &&
              msg.analysis_summary === nextMsg.analysis_summary &&
              msg.analysis_sentiment === nextMsg.analysis_sentiment
            );
          });
        });

      if (unchanged) return prev;

      return {
        ...prev,
        [accountEmail]: groups
      };
    });

    if (groups.length > 0 && !expandedSenders[accountEmail]) {
      setExpandedSenders((prev) => ({
        ...prev,
        [accountEmail]: groups[0].sender_email
      }));
    }

    return groups;
  }, [expandedSenders]);

  const loadDeletedEmails = useCallback(async (accountEmail: string, limit?: number) => {
    const deleted = await invoke<DeletedEmail[]>("list_deleted_messages", {
      email: accountEmail,
      limit
    });

    setDeletedEmailsByAccount((prev) => ({
      ...prev,
      [accountEmail]: deleted
    }));

    return deleted;
  }, []);

  const toggleSenderExpansion = useCallback((accountEmail: string, senderEmail: string) => {
    setExpandedSenders((prev) => {
      const current = prev[accountEmail] ?? null;
      return {
        ...prev,
        [accountEmail]: current === senderEmail ? null : senderEmail
      };
    });
  }, []);

  const clearAccountData = useCallback((email: string) => {
    setEmailsByAccount((prev) => {
      const { [email]: _removed, ...rest } = prev;
      return rest;
    });
    setSenderGroupsByAccount((prev) => {
      const { [email]: _removed, ...rest } = prev;
      return rest;
    });
    setCachedCountsByAccount((prev) => {
      const { [email]: _removed, ...rest } = prev;
      return rest;
    });
    setDeletedEmailsByAccount((prev) => {
      const { [email]: _removed, ...rest } = prev;
      return rest;
    });
    setExpandedSenders((prev) => {
      const { [email]: _removed, ...rest } = prev;
      return rest;
    });
    delete maxCachedItemsByAccount.current[email];
    delete cachedCountRef.current[email];
  }, []);

  const updateSenderStatus = useCallback((accountEmail: string, senderEmail: string, status: SenderStatus) => {
    setSenderGroupsByAccount((prev) => {
      const current = prev[accountEmail] ?? [];
      const updated = current.map((group) => {
        if (group.sender_email !== senderEmail) return group;
        return {
          ...group,
          status,
          messages: group.messages.map((message) => ({
            ...message,
            status
          }))
        };
      });
      return {
        ...prev,
        [accountEmail]: updated
      };
    });
  }, []);

  const deleteMessageFromGroups = useCallback((accountEmail: string, senderEmail: string, uid: string) => {
    setSenderGroupsByAccount((prev) => {
      const current = prev[accountEmail] ?? [];
      const updated = current
        .map((group) => {
          if (group.sender_email !== senderEmail) return group;
          const filtered = group.messages.filter((message) => message.uid !== uid);
          return {
            ...group,
            messages: filtered,
            message_count: filtered.length
          };
        })
        .filter((group) => group.message_count > 0);
      return {
        ...prev,
        [accountEmail]: updated
      };
    });

    setEmailsByAccount((prev) => {
      const current = prev[accountEmail] ?? [];
      return {
        ...prev,
        [accountEmail]: current.filter((message) => message.uid !== uid)
      };
    });
  }, []);

  const addDeletedEmail = useCallback((accountEmail: string, email: DeletedEmail) => {
    setDeletedEmailsByAccount((prev) => {
      const existing = prev[accountEmail] ?? [];
      const filtered = existing.filter((item) => item.uid !== email.uid);
      return {
        ...prev,
        [accountEmail]: [email, ...filtered]
      };
    });
  }, []);

  return {
    emailsByAccount,
    cachedCountsByAccount,
    senderGroupsByAccount,
    deletedEmailsByAccount,
    expandedSenders,
    maxCachedItemsByAccount,
    loadCachedCount,
    loadCachedEmails,
    loadSenderGroups,
    loadDeletedEmails,
    toggleSenderExpansion,
    clearAccountData,
    updateSenderStatus,
    deleteMessageFromGroups,
    addDeletedEmail,
    setEmailsByAccount,
    setDeletedEmailsByAccount
  };
}
