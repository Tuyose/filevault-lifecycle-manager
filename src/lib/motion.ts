/**
 * Centralised motion system for FileVault.
 *
 * All animations read these constants so the feel stays consistent
 * across every component. No bounce, no elastic — just subtle,
 * premium transitions.
 */

// ── Durations ────────────────────────────────────────────────────

export const duration = {
  /** Micro-interactions: hover, tap, colour change */
  micro: 120,
  /** Normal: tooltip, small expand, fade */
  normal: 180,
  /** Panel: dropdown, accordion, card reveal */
  panel: 240,
  /** Page: route transition */
  page: 320,
} as const;

// ── Easings ──────────────────────────────────────────────────────

/** Default easing: custom cubic-bezier (ease-out with a touch of overshoot). */
export const easing = "cubic-bezier(0.22,1,0.36,1)";

/** Easing for micro interactions (fast out). */
export const easingMicro = "cubic-bezier(0.4,0,0.2,1)";

// ── CSS-in-JS helpers ────────────────────────────────────────────

/** Build a transition string for one or more properties. */
export function transition(
  properties: string | string[],
  dur: number = duration.normal,
  delay = 0,
): string {
  const props = Array.isArray(properties) ? properties : [properties];
  return props
    .map((p) => `${p} ${dur}ms ${easing}${delay ? ` ${delay}ms` : ""}`)
    .join(", ");
}

/** Shorthand for common property groups. */
export const transitions = {
  all: transition(["opacity", "transform", "background-color", "border-color"]),
  color: transition(["background-color", "border-color", "color"]),
  transform: transition("transform"),
  height: transition("height", duration.panel),
  opacity: transition("opacity", duration.normal),
  page: transition(["opacity", "transform"], duration.page),
} as const;

// ── Tailwind-compatible config values ────────────────────────────

export const tailwind = {
  extend: {
    transitionDuration: {
      micro: `${duration.micro}ms`,
      panel: `${duration.panel}ms`,
    },
    transitionTimingFunction: {
      vault: easing,
      "vault-micro": easingMicro,
    },
    keyframes: {
      "fade-in": {
        "0%": { opacity: "0", transform: "translateY(4px)" },
        "100%": { opacity: "1", transform: "translateY(0)" },
      },
      "slide-in": {
        "0%": { opacity: "0", transform: "translateX(8px)" },
        "100%": { opacity: "1", transform: "translateX(0)" },
      },
      "slide-out": {
        "0%": { opacity: "1", transform: "translateX(0)" },
        "100%": { opacity: "0", transform: "translateX(-8px)" },
      },
      "accordion-open": {
        "0%": { opacity: "0", maxHeight: "0px" },
        "100%": { opacity: "1", maxHeight: "500px" },
      },
      shimmer: {
        "0%, 100%": { opacity: "0.4" },
        "50%": { opacity: "1" },
      },
    },
    animation: {
      "fade-in": `fade-in 240ms ${easing}`,
      "slide-in": `slide-in 320ms ${easing}`,
      "accordion-open": `accordion-open 240ms ${easing}`,
      shimmer: "shimmer 1.5s ease-in-out infinite",
    },
  },
};
