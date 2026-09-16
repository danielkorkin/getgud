"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ExamCountdown } from "./exam-countdown";
import { EyeIcon, EyeSlashIcon } from "@phosphor-icons/react";

const SECTION_LABEL = { RW: "Reading and Writing", MATH: "Math" } as const;

export function ExamHeader({
  examName,
  module,
  deadlineAt,
  serverNow,
  onExpire,
}: {
  examName: string;
  module: { sectionCode: "RW" | "MATH"; moduleIndex: 1 | 2 } | null;
  deadlineAt: string | null;
  serverNow: string;
  onExpire: () => void;
}) {
  const [hidden, setHidden] = useState(false);

  return (
    <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-2.5">
      <div className="flex items-center gap-2 overflow-hidden">
        <span className="truncate text-sm font-medium">{examName}</span>
        <Badge variant="secondary" className="shrink-0">
          {module ? `${SECTION_LABEL[module.sectionCode]} · Module ${module.moduleIndex}` : "Break"}
        </Badge>
      </div>
      <div className="flex items-center gap-2">
        {deadlineAt && (
          <>
            <Button variant="ghost" size="icon-sm" onClick={() => setHidden((h) => !h)} aria-label={hidden ? "Show timer" : "Hide timer"}>
              {hidden ? <EyeSlashIcon /> : <EyeIcon />}
            </Button>
            <ExamCountdown deadlineAt={deadlineAt} serverNow={serverNow} onExpire={onExpire} hidden={hidden} />
          </>
        )}
      </div>
    </header>
  );
}
