import type { Tab } from "@wattle/shared";
import { Button, Icon } from "../primitives/index.js";
import { t } from "../../i18n/index.js";
import "./TabsPanel.css";

interface TabsPanelProps {
  /** Left-to-right order — same indexing as App.tsx's sortedTabs/the swipe gesture. */
  tabs: Tab[];
  currentIndex: number;
  onSelectTab: (index: number) => void;
  onCreateTab: () => void;
  /** "Save as App" (Apps feature spec §5) with scope "tab" — this panel is where a
   *  Tab is "in focus" the same way the Pages panel below is for a Page. Saves
   *  whichever Tab is currently in view, not a specific row here. */
  onSaveAsApp: () => void;
}

/**
 * The Tabs panel (Step 6 spec §3.4) — a scrollable list of every Tab, for jumping
 * straight to one; swiping the main page content left/right remains the primary way
 * to move between adjacent Tabs (App.tsx's pointer-based swipe handlers). A "+" row
 * creates a new Tab at the right-hand end.
 */
export function TabsPanel({ tabs, currentIndex, onSelectTab, onCreateTab, onSaveAsApp }: TabsPanelProps) {
  return (
    <div className="tabs-panel">
      <button type="button" className="tabs-panel__save-as-app" onClick={onSaveAsApp}>
        {t("apps.saveAsApp")}
      </button>
      {tabs.map((tab, i) => (
        <button
          key={tab.id}
          type="button"
          className={`tabs-panel__item${i === currentIndex ? " tabs-panel__item--current" : ""}`}
          onClick={() => onSelectTab(i)}
        >
          {tab.title}
        </button>
      ))}
      <Button iconOnly onClick={onCreateTab} aria-label={t("tabs.new")} title={t("tabs.new")}>
        <Icon name="plus" />
      </Button>
    </div>
  );
}
