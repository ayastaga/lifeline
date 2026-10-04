import { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import Animated, {
  cancelAnimation,
  Easing,
  type SharedValue,
  useAnimatedProps,
  useAnimatedStyle,
  useFrameCallback,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import Svg, { Circle, Defs, Ellipse, Path, RadialGradient, Stop } from "react-native-svg";

export type OrbMode = "idle" | "listening" | "thinking" | "speaking";

const AnimatedPath = Animated.createAnimatedComponent(Path);

// Same blue in every state; only motion changes. `react` is how much the live audio level moves the blob.
const MODES: Record<OrbMode, { speed: number; wobble: number; react: number }> = {
  idle: { speed: 0.35, wobble: 0.045, react: 0 },
  listening: { speed: 0.9, wobble: 0.06, react: 0.1 },
  thinking: { speed: 2.4, wobble: 0.08, react: 0 },
  speaking: { speed: 1.4, wobble: 0.06, react: 0.08 },
};

/** Closed blob through 8 wobbling points, smoothed with Catmull-Rom curves. */
function blobPath(c: number, r: number, t: number, wobble: number, seed: number, rot: number) {
  "worklet";
  const n = 8;
  const xs: number[] = [];
  const ys: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rot;
    const noise = (Math.sin(2 * a + t * 1.3 + seed) + 0.6 * Math.sin(3 * a - t * 0.9 + seed * 2) + 0.4 * Math.sin(5 * a + t * 1.7 + seed * 3)) / 2;
    const k = r * (1 + wobble * noise);
    xs.push(c + Math.cos(a) * k);
    ys.push(c + Math.sin(a) * k);
  }
  let d = `M${xs[0].toFixed(1)} ${ys[0].toFixed(1)}`;
  for (let i = 0; i < n; i++) {
    const i0 = (i - 1 + n) % n, i2 = (i + 1) % n, i3 = (i + 2) % n;
    const c1x = xs[i] + (xs[i2] - xs[i0]) / 6, c1y = ys[i] + (ys[i2] - ys[i0]) / 6;
    const c2x = xs[i2] - (xs[i3] - xs[i]) / 6, c2y = ys[i2] - (ys[i3] - ys[i]) / 6;
    d += ` C${c1x.toFixed(1)} ${c1y.toFixed(1)} ${c2x.toFixed(1)} ${c2y.toFixed(1)} ${xs[i2].toFixed(1)} ${ys[i2].toFixed(1)}`;
  }
  return d + "Z";
}

/** Fluid blue blob. `level` is the live audio level (0–1) from the mic or the reply. */
export function Orb({ mode, level, size, dimmed }: { mode: OrbMode; level: SharedValue<number>; size: number; dimmed?: boolean }) {
  const canvas = size * 1.4;
  const c = canvas / 2;
  const r = size / 2;

  const t = useSharedValue(0);
  const rot = useSharedValue(0);
  const smooth = useSharedValue(0);
  const speed = useSharedValue(MODES.idle.speed);
  const wobble = useSharedValue(MODES.idle.wobble);
  const react = useSharedValue(0);
  const ring = useSharedValue(0);
  const ringOn = useSharedValue(0);
  const fade = useSharedValue(1);

  useEffect(() => {
    const m = MODES[mode];
    speed.set(withTiming(m.speed, { duration: 500 }));
    wobble.set(withTiming(m.wobble, { duration: 500 }));
    react.set(withTiming(m.react, { duration: 300 }));
    if (mode === "listening") {
      ringOn.set(withTiming(1, { duration: 200 }));
      ring.set(0);
      ring.set(withRepeat(withTiming(1, { duration: 1600, easing: Easing.out(Easing.quad) }), -1, false));
    } else {
      ringOn.set(withTiming(0, { duration: 200 }));
      cancelAnimation(ring);
    }
  }, [mode, speed, wobble, react, ring, ringOn]);

  useEffect(() => { fade.set(withTiming(dimmed ? 0.45 : 1, { duration: 150 })); }, [dimmed, fade]);

  useFrameCallback((f) => {
    const dt = Math.min((f.timeSincePreviousFrame ?? 16) / 1000, 0.05);
    smooth.value += (level.value - smooth.value) * Math.min(1, dt * 14);
    t.value += dt * speed.value * (1 + smooth.value * (react.value > 0 ? 1.5 : 0));
    rot.value += dt * speed.value * 0.25;
  });

  const body = useAnimatedStyle(() => {
    const breathe = 0.015 * Math.sin(t.value * 2.2);
    return { opacity: fade.value, transform: [{ scale: 1 + breathe + smooth.value * react.value * 1.2 }] };
  });
  const p1 = useAnimatedProps(() => ({ d: blobPath(c, r, t.value, wobble.value + smooth.value * react.value * 0.6, 0, rot.value) }));
  const p2 = useAnimatedProps(() => ({ d: blobPath(c, r * 0.86, -t.value * 1.2, wobble.value * 1.3, 2, -rot.value * 1.4) }));
  const p3 = useAnimatedProps(() => ({ d: blobPath(c, r * 0.72, t.value * 0.8, wobble.value * 1.6, 4, rot.value * 0.7) }));
  const ring1 = useAnimatedStyle(() => ({ opacity: ringOn.value * 0.7 * (1 - ring.value), transform: [{ scale: 1 + 0.35 * ring.value }] }));
  const ring2 = useAnimatedStyle(() => {
    const p = (ring.value + 0.5) % 1;
    return { opacity: ringOn.value * 0.7 * (1 - p), transform: [{ scale: 1 + 0.35 * p }] };
  });

  const ringBox = { width: size, height: size, borderRadius: r, left: (canvas - size) / 2, top: (canvas - size) / 2 };
  return (
    <View style={{ width: canvas, height: canvas }} pointerEvents="none">
      <Animated.View style={[s.ring, ringBox, ring1]} />
      <Animated.View style={[s.ring, ringBox, ring2]} />
      <Animated.View style={[StyleSheet.absoluteFill, body]}>
        <Svg width={canvas} height={canvas}>
          <Defs>
            <RadialGradient id="glow" cx="50%" cy="50%" r="50%">
              <Stop offset="0" stopColor="#2563eb" stopOpacity={0.22} />
              <Stop offset="1" stopColor="#2563eb" stopOpacity={0} />
            </RadialGradient>
            <RadialGradient id="g1" cx="32%" cy="28%" r="80%">
              <Stop offset="0" stopColor="#bfdbfe" />
              <Stop offset="0.3" stopColor="#60a5fa" />
              <Stop offset="0.62" stopColor="#2563eb" />
              <Stop offset="1" stopColor="#1e3a8a" />
            </RadialGradient>
            <RadialGradient id="g2" cx="70%" cy="70%" r="60%">
              <Stop offset="0" stopColor="#93c5fd" stopOpacity={0.9} />
              <Stop offset="1" stopColor="#3b82f6" stopOpacity={0} />
            </RadialGradient>
            <RadialGradient id="g3" cx="25%" cy="75%" r="60%">
              <Stop offset="0" stopColor="#38bdf8" stopOpacity={0.55} />
              <Stop offset="1" stopColor="#38bdf8" stopOpacity={0} />
            </RadialGradient>
            <RadialGradient id="hl" cx="50%" cy="50%" r="50%">
              <Stop offset="0" stopColor="#ffffff" stopOpacity={0.75} />
              <Stop offset="1" stopColor="#ffffff" stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Circle cx={c} cy={c} r={c} fill="url(#glow)" />
          <AnimatedPath animatedProps={p1} fill="url(#g1)" />
          <AnimatedPath animatedProps={p2} fill="url(#g2)" />
          <AnimatedPath animatedProps={p3} fill="url(#g3)" />
          <Ellipse cx={c - r * 0.3} cy={c - r * 0.48} rx={r * 0.34} ry={r * 0.2} fill="url(#hl)" />
        </Svg>
      </Animated.View>
    </View>
  );
}

const s = StyleSheet.create({
  ring: { position: "absolute", borderWidth: 2, borderColor: "rgba(37,99,235,0.35)" },
});
