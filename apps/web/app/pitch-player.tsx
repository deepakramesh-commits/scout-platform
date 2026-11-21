"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowPathIcon } from "@heroicons/react/24/outline";
import { Button } from "@astryxdesign/core/Button";
import { HStack } from "@astryxdesign/core/HStack";
import { Icon } from "@astryxdesign/core/Icon";
import { VStack } from "@astryxdesign/core/VStack";

// Starts the pitch animation when the map scrolls into view; Replay restarts it for presenting.
export function PitchPlayer({ title, children, label }: { title: React.ReactNode; children: React.ReactNode; label: string }) {
  const ref = useRef<HTMLElement>(null);
  const [state, setState] = useState<"idle" | "play">("idle");

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { setState("play"); io.disconnect(); }
    }, { threshold: 0.35 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const replay = () => {
    setState("idle");
    // Two frames so the browser drops the old animations before they are re-applied.
    requestAnimationFrame(() => requestAnimationFrame(() => setState("play")));
  };

  return (
    <VStack as="figure" gap={2} className="pitch" data-state={state} ref={ref}>
      <HStack hAlign="between" vAlign="center">
        {title}
        <Button className="replay" size="sm" variant="ghost" label="Replay" tooltip={`Replay ${label}`} icon={<Icon icon={ArrowPathIcon} />} onClick={replay} />
      </HStack>
      {children}
    </VStack>
  );
}
