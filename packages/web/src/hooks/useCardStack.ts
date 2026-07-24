import { useCallback, useEffect, useState } from "react";
import type { StackData, StackMemberWithCard } from "@wattle/shared";
import * as api from "../api/client.js";
import { notifySaved } from "../lib/cardStore.js";

/**
 * A "stack" Card's real data source — CardStackRail.tsx's T1 (see its own doc
 * comment), replacing T0's MOCK_MEMBERS. Refetches after every mutation rather than
 * merging optimistic patches into local state, except for `updateActiveDraft`: that
 * one runs on every keystroke, so it patches `data` locally first (same reasoning as
 * usePages.ts's updateDraftLocally — a controlled CardRichText would otherwise have
 * its DOM value reset out from under an in-flight PATCH on every incidental
 * re-render) and fires the request in the background rather than awaiting a refetch.
 */
export function useCardStack(stackCardId: string) {
  const [data, setData] = useState<StackData | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const next = await api.getStack(stackCardId);
    setData(next);
    setLoading(false);
  }, [stackCardId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function goToIndex(index: number) {
    const { activeIndex } = await api.setStackActiveIndex(stackCardId, index);
    setData((prev) => (prev ? { ...prev, activeIndex } : prev));
  }

  async function goPrevious() {
    if (!data) return;
    await goToIndex(Math.max(0, data.activeIndex - 1));
  }

  async function goNext() {
    if (!data) return;
    await goToIndex(Math.min(data.members.length - 1, data.activeIndex + 1));
  }

  /** The rail's "+" — appends a new blank member and switches straight to it (also
   *  what the forward arrow turns into once it's at the last member, and what the
   *  Dock's "Generate" action for a selected Stack does before streaming into it —
   *  see activeStackRegistry.ts's generateNewAlternate). Returns the created member
   *  so that last caller can target it without waiting on a re-render to read it
   *  back out of `data`. */
  async function addMember(): Promise<StackMemberWithCard> {
    const created = await api.addStackMember(stackCardId);
    await refresh();
    return created;
  }

  /** Fires on every keystroke in the active member's title/body — see this hook's own
   *  doc comment for why it patches local state immediately instead of awaiting a
   *  refetch. */
  function updateActiveDraft(draft: { title?: string; content?: string }) {
    const active = data?.members[data.activeIndex];
    if (!active) return;
    setData((prev) => {
      if (!prev) return prev;
      const members = prev.members.map((m, i) =>
        i === prev.activeIndex
          ? {
              ...m,
              draftTitle: draft.title !== undefined ? draft.title : m.draftTitle,
              draftContent: draft.content !== undefined ? draft.content : m.draftContent,
            }
          : m,
      );
      return { ...prev, members };
    });
    api.updateStackMemberDraft(active.id, draft).catch(() => refresh());
  }

  /** Commits the active member's draft to its own vault Card — "children can be saved
   *  individually". */
  async function saveActive() {
    const active = data?.members[data.activeIndex];
    if (!active) return;
    await api.saveStackMemberToVault(active.id);
    await refresh();
  }

  /** Removes just the active member. Returns whether that emptied (and so
   *  auto-deleted) the whole Stack, so StackView knows there's nothing left to render
   *  at all rather than refetching a Stack Card that no longer exists. When the Stack
   *  itself is gone, its own PageCard row cascades away with it (schema.prisma's
   *  `card Card @relation(..., onDelete: Cascade)`) — but nothing about that reaches
   *  usePages.ts's page-level fetch on its own, since it happened through this
   *  Stack-scoped hook rather than the normal PageCard draft/save flow. Without
   *  notifySaved here, the page keeps showing this now-nonexistent Stack until some
   *  unrelated refresh happens to fire, and any further action on it (e.g. the
   *  rail's "+") 500s against a stackCardId nothing references any more — same
   *  "tell usePages to refetch" signal an embed edit uses (cardStore.ts). */
  async function removeActive(): Promise<{ stackDeleted: boolean }> {
    const active = data?.members[data.activeIndex];
    if (!active) return { stackDeleted: false };
    const result = await api.removeStackMember(active.id);
    if (result.stackDeleted) {
      notifySaved(stackCardId);
    } else {
      await refresh();
    }
    return result;
  }

  return { data, loading, refresh, goPrevious, goNext, addMember, updateActiveDraft, saveActive, removeActive };
}
