import type { CSSProperties } from "react";
export const iconNames = [
  "home",
  "list",
  "calendar",
  "bell",
  "settings",
  "plus",
  "check",
  "arrow",
  "notebook",
] as const;
export default function AppIcon({
  name = "check",
  rotate = 0,
}: {
  name?: string;
  rotate?: number;
}) {
  if (!iconNames.includes(name as (typeof iconNames)[number]))
    throw new Error(`Unknown Todo icon: ${name}`);
  return (
    <span
      aria-hidden="true"
      className="app-icon"
      style={
        {
          "--icon": `url(/icons/ui/${name}.png)`,
          transform: rotate ? `rotate(${rotate}deg)` : undefined,
        } as CSSProperties
      }
    />
  );
}
