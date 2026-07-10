import type { CSSProperties } from "react";

// 시그니처: 지형도 등고선(topographic contour) 모티프.
// 결정적(deterministic)으로 경로를 생성해 서버/클라 하이드레이션 불일치 방지.

function ringPath(
  cx: number,
  cy: number,
  r: number,
  amp: number,
  phase: number,
  squash = 0.82,
): string {
  const N = 72;
  const pts: string[] = [];
  for (let i = 0; i <= N; i++) {
    const t = (i / N) * Math.PI * 2;
    const rr = r + amp * Math.sin(3 * t + phase) + amp * 0.45 * Math.sin(5 * t + phase * 1.6);
    const x = cx + rr * Math.cos(t);
    const y = cy + rr * Math.sin(t) * squash;
    pts.push(`${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`);
  }
  return pts.join(" ") + " Z";
}

// 새 둥지처럼 겹치는 등고선 링 — 히어로 배경/섹션 악센트용
export function TopoRings({
  className,
  rings = 8,
  animate = false,
}: {
  className?: string;
  rings?: number;
  animate?: boolean;
}) {
  const cx = 400;
  const cy = 320;
  const paths = Array.from({ length: rings }, (_, i) =>
    ringPath(cx, cy, 44 + i * 38, 6 + i * 2.2, i * 0.9),
  );
  return (
    <svg
      viewBox="0 0 800 640"
      preserveAspectRatio="xMidYMid meet"
      aria-hidden="true"
      className={className}
    >
      <g className={animate ? "topo-draw" : undefined}>
        {paths.map((d, i) => (
          <path
            key={i}
            d={d}
            className="topo-line"
            opacity={Math.max(0.12, 0.6 - i * 0.045)}
            style={
              { "--delay": `${i * 130 + 200}ms`, "--len": "3600" } as CSSProperties
            }
          />
        ))}
      </g>
    </svg>
  );
}

function wavePath(width: number, y: number, amp: number, freq: number, phase: number): string {
  const N = 96;
  const pts: string[] = [];
  for (let i = 0; i <= N; i++) {
    const x = (i / N) * width;
    const yy = y + amp * Math.sin(freq * (i / N) * Math.PI * 2 + phase);
    pts.push(`${i === 0 ? "M" : "L"}${x.toFixed(1)},${yy.toFixed(1)}`);
  }
  return pts.join(" ");
}

// 섹션 구분선 — 지형 단면처럼 흐르는 평행 등고선 + 중앙 골드 노드
export function TopoRule({ className }: { className?: string }) {
  const W = 1200;
  const lines = [0, 1, 2, 3];
  return (
    <svg
      viewBox="0 0 1200 56"
      preserveAspectRatio="none"
      aria-hidden="true"
      className={className}
    >
      {lines.map((j) => (
        <path
          key={j}
          d={wavePath(W, 14 + j * 10, 5 + j * 1.4, 2.4, j * 0.8)}
          className="topo-line"
          opacity={0.5 - j * 0.08}
        />
      ))}
    </svg>
  );
}
