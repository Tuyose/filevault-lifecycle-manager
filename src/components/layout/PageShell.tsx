import { type ReactNode } from "react";
import { motion } from "motion/react";

type PageShellProps = {
  title: string;
  subtitle?: string;
  rightAction?: ReactNode;
  children: ReactNode;
};

/** Shared page wrapper — consistent max-width, spacing, entrance animation. */
export function PageShell({ title, subtitle, rightAction, children }: PageShellProps) {
  return (
    <div className="h-full overflow-y-auto" style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}>
      <style>{`div::-webkit-scrollbar { display: none; }`}</style>
      <div className="mx-auto max-w-5xl px-8 py-8">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
          className="mb-8 flex items-center justify-between"
        >
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 600, color: "#EDEDFD", margin: 0 }}>
              {title}
            </h1>
            {subtitle && (
              <p style={{ fontSize: 13, color: "#6060A0", margin: "2px 0 0" }}>
                {subtitle}
              </p>
            )}
          </div>
          {rightAction}
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, delay: 0.04 }}
        >
          {children}
        </motion.div>
      </div>
    </div>
  );
}
