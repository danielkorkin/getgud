"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  StrobiAvatar,
  strobiDefinition,
  type AvatarController,
} from "@/components/procedural-avatar/strobi-avatar";

type AnimationKey = keyof typeof strobiDefinition.animations;

const ANIMATIONS = strobiDefinition.animationOrder as AnimationKey[];

function StrobiDemo() {
  const avatar = useRef<AvatarController>(null);
  const [activeAnimation, setActiveAnimation] = useState<string | undefined>(
    "idle"
  );
  const [activeExpression, setActiveExpression] = useState<string>();

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
      <StrobiAvatar
        ref={avatar}
        defaultAnimation="idle"
        size={160}
        onAnimationEnd={() => setActiveAnimation(undefined)}
        onExpressionChange={setActiveExpression}
      />
      <div className="flex flex-1 flex-col gap-3">
        <div className="flex flex-wrap gap-2">
          {ANIMATIONS.map((name) => (
            <Button
              key={name}
              variant={activeAnimation === name ? "default" : "outline"}
              size="sm"
              onClick={() => {
                const result = avatar.current?.play(name);
                if (result?.ok) setActiveAnimation(name);
              }}
            >
              {name}
            </Button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => avatar.current?.pause()}
          >
            Pause
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              avatar.current?.stop();
              setActiveAnimation(undefined);
            }}
          >
            Stop
          </Button>
        </div>
        <p className="font-mono text-xs text-muted-foreground">
          expression: {activeExpression ?? "—"}
        </p>
      </div>
    </div>
  );
}

export { StrobiDemo };
