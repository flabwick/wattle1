import { useState } from "react";
import { Button, Icon } from "../primitives/index.js";
import { t } from "../../i18n/index.js";
import "./CardStackRail.css";

interface StackMember {
  id: string;
  title: string;
}

/** Seed content for the T0 prototype — a real stack (T1) will hold PageCard alternates
 *  instead, but the rail's own ← → / + interaction doesn't care what a member is. */
const MOCK_MEMBERS: StackMember[] = [
  { id: "mock-1", title: "Question 1" },
  { id: "mock-2", title: "Question 2" },
  { id: "mock-3", title: "Question 3" },
];

/**
 * Horizontal exclusive slot: only `members[activeIndex]` is "in" the page — ← / →
 * swap which alternate is active, `+` adds another. This is the sideways counterpart
 * to PageNav's up/down between Pages, but exclusive rather than inclusive (see
 * Branch 3 plan §"Core concepts"): Pages stack vertically and all contribute to
 * generation context, stack members sit in one slot and only the active one does.
 *
 * T0: mock data only, entirely self-contained (no props). T1 wires this to
 * useCardStack/PageStack and swaps MOCK_MEMBERS for real PageCard alternates.
 */
export function CardStackRail() {
  const [members, setMembers] = useState<StackMember[]>(MOCK_MEMBERS);
  const [activeIndex, setActiveIndex] = useState(0);

  const atStart = activeIndex === 0;
  const atEnd = activeIndex === members.length - 1;
  const active = members[activeIndex];

  function goPrevious() {
    setActiveIndex((i) => Math.max(0, i - 1));
  }

  function goNext() {
    setActiveIndex((i) => Math.min(members.length - 1, i + 1));
  }

  function addAlternate() {
    const nextNumber = members.length + 1;
    const member: StackMember = { id: `mock-${nextNumber}`, title: `Question ${nextNumber}` };
    setMembers((prev) => [...prev, member]);
    setActiveIndex(members.length);
  }

  return (
    <div className="card-stack-rail">
      <Button
        iconOnly
        aria-label={t("cardStack.previous")}
        title={t("cardStack.previous")}
        disabled={atStart}
        onClick={goPrevious}
      >
        <Icon name="up" className="card-stack-rail__arrow card-stack-rail__arrow--left" />
      </Button>

      {/* T1 swaps this for the active member's real CardView; T0 just needs
          something card-shaped to prove the rail's own layout and interaction. */}
      <div className="card-stack-rail__active">
        <span className="card-stack-rail__title">{active.title}</span>
        <span className="card-stack-rail__position">
          {activeIndex + 1} / {members.length}
        </span>
      </div>

      <Button
        iconOnly
        aria-label={t("cardStack.next")}
        title={t("cardStack.next")}
        disabled={atEnd}
        onClick={goNext}
      >
        <Icon name="up" className="card-stack-rail__arrow card-stack-rail__arrow--right" />
      </Button>

      <Button
        iconOnly
        aria-label={t("cardStack.addAlternate")}
        title={t("cardStack.addAlternate")}
        onClick={addAlternate}
      >
        <Icon name="plus" />
      </Button>
    </div>
  );
}
