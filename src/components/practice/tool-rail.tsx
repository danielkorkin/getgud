"use client";

import { cn } from "cn";
import { Button } from "@/components/ui/button";
import {
  FlagIcon,
  ProhibitIcon,
  NotePencilIcon,
  CalculatorIcon,
  BookOpenTextIcon,
  LightbulbIcon,
} from "@phosphor-icons/react";

export type DrawerView = "calculator" | "reference" | "hint" | "notes" | null;

export function ToolRail({
  markedForReview,
  onToggleMarkForReview,
  eliminatorMode,
  onToggleEliminatorMode,
  showMathTools,
  activeDrawer,
  onSetActiveDrawer,
  disabled,
}: {
  markedForReview: boolean;
  onToggleMarkForReview: () => void;
  eliminatorMode: boolean;
  onToggleEliminatorMode: () => void;
  showMathTools: boolean;
  activeDrawer: DrawerView;
  onSetActiveDrawer: (view: DrawerView) => void;
  disabled: boolean;
}) {
  function toggleDrawer(view: Exclude<DrawerView, null>) {
    onSetActiveDrawer(activeDrawer === view ? null : view);
  }

  return (
    <div className="flex items-center gap-1.5 border-b border-border px-3 py-2">
      <RailButton
        pressed={markedForReview}
        onClick={onToggleMarkForReview}
        icon={<FlagIcon weight={markedForReview ? "fill" : "regular"} />}
        label="Mark for review"
      />
      <RailButton
        pressed={eliminatorMode}
        onClick={onToggleEliminatorMode}
        icon={<ProhibitIcon />}
        label="Answer eliminator"
        disabled={disabled}
      />
      <RailButton
        pressed={activeDrawer === "notes"}
        onClick={() => toggleDrawer("notes")}
        icon={<NotePencilIcon />}
        label="Highlights & notes"
      />
      {showMathTools && (
        <>
          <RailButton
            pressed={activeDrawer === "calculator"}
            onClick={() => toggleDrawer("calculator")}
            icon={<CalculatorIcon />}
            label="Calculator"
          />
          <RailButton
            pressed={activeDrawer === "reference"}
            onClick={() => toggleDrawer("reference")}
            icon={<BookOpenTextIcon />}
            label="Reference sheet"
          />
        </>
      )}
      <RailButton
        pressed={activeDrawer === "hint"}
        onClick={() => toggleDrawer("hint")}
        icon={<LightbulbIcon />}
        label="Hint"
      />
    </div>
  );
}

function RailButton({
  pressed,
  onClick,
  icon,
  label,
  disabled,
}: {
  pressed: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  disabled?: boolean;
}) {
  return (
    <Button
      variant="ghost"
      size="sm"
      aria-pressed={pressed}
      disabled={disabled}
      onClick={onClick}
      className={cn(pressed && "bg-primary/10 text-primary ring-1 ring-primary/30 hover:bg-primary/15")}
    >
      {icon}
      <span className="hidden sm:inline">{label}</span>
    </Button>
  );
}
