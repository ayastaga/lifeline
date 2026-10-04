import Svg, { Circle, Path, Rect } from "react-native-svg";

export type IconName = "mic" | "map" | "user" | "settings" | "history" | "keyboard" | "send" | "close" | "play" | "book" | "pulse";

/** Stroke icons on a 24px grid. */
export function Icon({ name, size = 20, color, strokeWidth = 2 }: { name: IconName; size?: number; color: string; strokeWidth?: number }) {
  const p = { stroke: color, strokeWidth, strokeLinecap: "round", strokeLinejoin: "round", fill: "none" } as const;
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {name === "mic" && <><Rect x={9} y={2} width={6} height={12} rx={3} {...p} /><Path d="M5 10a7 7 0 0 0 14 0M12 17v4" {...p} /></>}
      {name === "map" && <Path d="M9 4L3 6v14l6-2 6 2 6-2V4l-6 2-6-2zM9 4v14M15 6v14" {...p} />}
      {name === "user" && <><Circle cx={12} cy={8} r={4} {...p} /><Path d="M4 21a8 8 0 0 1 16 0" {...p} /></>}
      {name === "settings" && <><Circle cx={12} cy={12} r={3} {...p} /><Path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9L7 7M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1" {...p} /></>}
      {name === "history" && <Path d="M3 12a9 9 0 1 0 3-6.7M3 4v5h5M12 7v5l3 2" {...p} />}
      {name === "keyboard" && <><Rect x={2} y={6} width={20} height={12} rx={2} {...p} /><Path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10" {...p} /></>}
      {name === "send" && <Path d="M12 19V5M5 12l7-7 7 7" {...p} />}
      {name === "close" && <Path d="M6 6l12 12M18 6L6 18" {...p} />}
      {name === "play" && <Path d="M7 4l13 8-13 8z" fill={color} />}
      {name === "book" && <Path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5v14z" {...p} />}
      {name === "pulse" && <Path d="M2 12h4l3-7 4 14 3-7h6" {...p} />}
    </Svg>
  );
}
