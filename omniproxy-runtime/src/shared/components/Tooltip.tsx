"use client";

/**
 * Tooltip — Lightweight hover/focus tooltip component
 *
 * Renders a positioned tooltip on hover/focus with delayed reveal.
 * Associates trigger and tooltip through aria-describedby for a11y.
 *
 * @module shared/components/Tooltip
 */

import type { ReactElement, ReactNode } from "react";
import {
  cloneElement,
  isValidElement,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";

interface TooltipProps {
  children: ReactNode;
  content?: string;
  position?: "top" | "bottom" | "left" | "right";
  className?: string;
  delayMs?: number;
}

interface AriaDescribedElement {
  "aria-describedby"?: string;
}

export default function Tooltip({
  children,
  content,
  position = "top",
  className = "",
  delayMs = 200,
}: TooltipProps) {
  const [visible, setVisible] = useState(false);
  const tooltipId = useId();
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback(() => {
    clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => setVisible(true), delayMs);
  }, [delayMs]);

  const hide = useCallback(() => {
    clearTimeout(timeoutRef.current);
    setVisible(false);
  }, []);

  useEffect(() => {
    return () => {
      clearTimeout(timeoutRef.current);
    };
  }, []);

  const positionClasses = {
    top: "bottom-full left-1/2 -translate-x-1/2 mb-2",
    bottom: "top-full left-1/2 -translate-x-1/2 mt-2",
    left: "right-full top-1/2 -translate-y-1/2 mr-2",
    right: "left-full top-1/2 -translate-y-1/2 ml-2",
  };

  const describedById = content ? tooltipId : undefined;
  const trigger = isValidElement(children) ? (
    (() => {
      const child = children as ReactElement<AriaDescribedElement>;
      const existingDescribedBy = child.props["aria-describedby"];
      const mergedDescribedBy = [existingDescribedBy, describedById].filter(Boolean).join(" ");
      return cloneElement(child, {
        "aria-describedby": mergedDescribedBy || undefined,
      });
    })()
  ) : (
    <span tabIndex={0} aria-describedby={describedById}>
      {children}
    </span>
  );

  return (
    <span
      className={`relative inline-flex ${className}`}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
      onKeyDown={(event) => {
        if (event.key === "Escape") hide();
      }}
    >
      {trigger}
      {visible && content && (
        <span
          id={tooltipId}
          role="tooltip"
          className={`absolute z-50 px-2.5 py-1.5 text-xs font-medium text-white bg-gray-900/95 rounded-md shadow-lg whitespace-nowrap pointer-events-none animate-in fade-in duration-150 motion-reduce:transition-none motion-reduce:animate-none border border-white/10 ${positionClasses[position] || positionClasses.top}`}
        >
          {content}
        </span>
      )}
    </span>
  );
}
