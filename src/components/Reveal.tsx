"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

// 스크롤 진입 시 페이드업.
// 기본은 "보임"(SSR/no-JS/observer 미지원에서도 항상 노출) — 마운트 후 화면 밖 요소만
// 잠깐 숨겼다 교차 시 나타남. 콘텐츠가 사라질 위험 없음.
export function Reveal({
  children,
  delay = 0,
  className,
  id,
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
  id?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<"idle" | "hidden" | "shown">("idle");

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      setState("shown");
      return;
    }
    // 이미 뷰포트 근처면 그대로 노출(플래시 방지)
    const rect = el.getBoundingClientRect();
    if (rect.top < (window.innerHeight || 0) * 0.9) {
      setState("shown");
      return;
    }
    setState("hidden");
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            setState("shown");
            io.disconnect();
          }
        }
      },
      { threshold: 0.12, rootMargin: "0px 0px -8% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      id={id}
      data-reveal={state}
      style={{ "--delay": `${delay}ms` } as CSSProperties}
      className={className}
    >
      {children}
    </div>
  );
}
