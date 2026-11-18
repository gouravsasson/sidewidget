import { KeyboardEvent, ReactNode, RefObject, useEffect, useId, useRef } from "react";
import { Sparkles, X } from "lucide-react";
import { btn, surface } from "./styles";

/** Shared pieces of the copilot pages: the header, status, empty states, the settings drawer. */


/** The Snowie mark: a small purple tile with a spark. */
export function BrandMark({ size = "md" }: { size?: "sm" | "md" }) {
  const box = size === "sm" ? "h-7 w-7 rounded-lg" : "h-8 w-8 rounded-xl";
  const icon = size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4";
  return (
    <span
      aria-hidden
      className={`grid shrink-0 place-items-center bg-gradient-to-br from-brand-600 to-brand-violet text-white shadow-sm ${box}`}
    >
      <Sparkles className={icon} />
    </span>
  );
}

export type Status = "live" | "connecting" | "idle";

const STATUS_TEXT: Record<Status, string> = { live: "Connected", connecting: "Connecting", idle: "Ready" };

/** A dot and a word: connected (green), connecting (amber, pulsing), idle (grey). */
export function StatusDot({ status, label, compact = false }: { status: Status; label?: string; compact?: boolean }) {
  const dot =
    status === "live" ? "bg-emerald-500" : status === "connecting" ? "bg-amber-500 motion-safe:animate-pulse" : "bg-slate-400";
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full text-xs font-medium text-slate-700 ${
        compact ? "sm:border sm:border-slate-200 sm:bg-white sm:px-2 sm:py-0.5" : "border border-slate-200 bg-white px-2 py-0.5"
      }`}
    >
      <span aria-hidden className={`h-2 w-2 rounded-full ${dot}`} />
      <span className={compact ? "sr-only sm:not-sr-only" : ""}>{label ?? STATUS_TEXT[status]}</span>
    </span>
  );
}

/** The compact app header: mark, product name, store, and whatever goes on the right. */
export function AppHeader({
  title,
  subtitle,
  badges,
  actions,
}: {
  title: string;
  subtitle?: ReactNode;
  badges?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className={`flex shrink-0 items-center justify-between gap-3 px-3 py-2 ${surface} rounded-xl`}>
      <div className="flex min-w-0 items-center gap-2.5">
        <BrandMark />
        <div className="min-w-0">
          <h1 className="truncate text-sm font-semibold leading-5 text-slate-900">{title}</h1>
          {subtitle && <p className="truncate text-xs leading-4 text-slate-600">{subtitle}</p>}
        </div>
        {badges && <div className="ml-1 flex shrink-0 items-center gap-2">{badges}</div>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">{actions}</div>}
    </header>
  );
}

/** An icon, a title and a line of help: for panels with nothing in them yet. */
export function EmptyState({
  icon,
  title,
  children,
  className = "",
}: {
  icon: ReactNode;
  title: string;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex flex-col items-center justify-center px-4 py-8 text-center ${className}`}>
      <span aria-hidden className="mb-3 grid h-11 w-11 place-items-center rounded-full bg-brand-50 text-brand-700 ring-1 ring-brand-100">
        {icon}
      </span>
      <p className="text-sm font-medium text-slate-900">{title}</p>
      {children && <div className="mt-1 max-w-xs text-sm text-slate-600">{children}</div>}
    </div>
  );
}

/**
 * A slide-over panel from the right. Stays mounted while closed (forms inside keep what was
 * typed), hidden from the keyboard and screen readers; Escape or the backdrop closes it, focus
 * goes into it when it opens and back to `returnFocus` when it closes, and Tab stays inside.
 */
export function Drawer({
  open,
  onClose,
  title,
  description,
  returnFocus,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  returnFocus?: RefObject<HTMLElement>;
  children: ReactNode;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const wasOpen = useRef(false);

  useEffect(() => {
    if (open) {
      wasOpen.current = true;
      panel.current?.focus();
    } else if (wasOpen.current) {
      wasOpen.current = false;
      returnFocus?.current?.focus();
    }
  }, [open, returnFocus]);

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      onClose();
      return;
    }
    if (e.key !== "Tab" || !panel.current) return;
    const focusable = panel.current.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    );
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && (document.activeElement === first || document.activeElement === panel.current)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  return (
    <div className={`fixed inset-0 z-40 ${open ? "" : "pointer-events-none"}`} aria-hidden={!open}>
      <div
        onClick={onClose}
        className={`absolute inset-0 bg-slate-900/30 transition-opacity duration-200 ${open ? "opacity-100" : "opacity-0"}`}
      />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onKeyDown={onKeyDown}
        className={`absolute inset-y-0 right-0 flex w-full max-w-md flex-col border-l border-slate-200 bg-slate-50 shadow-2xl outline-none transition-[transform,visibility] duration-200 ease-out ${
          open ? "visible translate-x-0" : "invisible translate-x-full"
        }`}
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-200 bg-white px-5 py-4">
          <div className="min-w-0">
            <h2 id={titleId} className="text-base font-semibold text-slate-900">
              {title}
            </h2>
            {description && <p className="mt-0.5 text-sm text-slate-600">{description}</p>}
          </div>
          <button type="button" onClick={onClose} aria-label="Close settings" className={`${btn.ghost} -mr-1 h-8 w-8 p-0`}>
            <X aria-hidden className="h-4 w-4" />
          </button>
        </div>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain p-5">{children}</div>
      </div>
    </div>
  );
}
