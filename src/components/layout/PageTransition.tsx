import { useEffect, useState, type ReactNode } from "react";
import { useLocation } from "react-router-dom";

import { duration, easing } from "../../lib/motion";

type PageTransitionProps = {
  children: ReactNode;
};

/**
 * Wraps page content in a fade + slide transition whenever the route
 * changes. The old content fades out and slides left, then the new
 * content fades in sliding right.
 */
export function PageTransition({ children }: PageTransitionProps) {
  const location = useLocation();
  const [displayChildren, setDisplayChildren] = useState(children);
  const [stage, setStage] = useState<"enter" | "exit">("enter");

  useEffect(() => {
    if (children !== displayChildren) {
      // Exit phase: fade old content out
      setStage("exit");
      const timer = setTimeout(() => {
        // Swap content and start enter phase
        setDisplayChildren(children);
        setStage("enter");
      }, duration.page);
      return () => clearTimeout(timer);
    }
  }, [children, displayChildren, location.pathname]);

  const style =
    stage === "enter"
      ? {
          opacity: 1,
          transform: "translateX(0)",
          transition: `opacity ${duration.page}ms ${easing}, transform ${duration.page}ms ${easing}`,
        }
      : {
          opacity: 0,
          transform: "translateX(-8px)",
          transition: `opacity ${duration.page}ms ${easing}, transform ${duration.page}ms ${easing}`,
        };

  return (
    <div className="h-full w-full overflow-y-auto" style={style} key={location.pathname}>
      {displayChildren}
    </div>
  );
}
