"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import { AnimatePresence, motion } from "motion/react";
import * as React from "react";
import { cn } from "@/lib/cn";
import { EASE_OUT } from "@/components/motion";

/**
 * The accessible dialog primitive.
 *
 * Every overlay in the app was hand-rolled, and a survey of them found that
 * two of roughly fifteen closed on Escape and none trapped focus — so a
 * keyboard user tabbing inside an open modal walked straight out into the page
 * behind it, and a screen reader was never told the rest of the page had gone
 * inert. Radix handles focus trapping, restoring focus to whatever opened the
 * dialog, `aria-modal`, Escape, scroll locking and outside-click for us.
 *
 * The animation is still Motion, not a CSS keyframe: Radix's own data-state
 * attributes can drive CSS transitions, but exit animations then race the
 * unmount. `forceMount` plus AnimatePresence lets Motion own the timing while
 * Radix owns the semantics, which is the combination that actually works.
 */

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

/**
 * Title and description are not optional decoration: Radix wires them to
 * aria-labelledby and aria-describedby, and warns in development if a dialog
 * has no accessible name. Use VisuallyHiddenTitle when the design has no
 * visible heading.
 */
export const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn("text-[15px] font-semibold tracking-tight text-slate-100", className)}
    {...props}
  />
));
DialogTitle.displayName = "DialogTitle";

export const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn("text-[13px] leading-relaxed text-slate-400", className)}
    {...props}
  />
));
DialogDescription.displayName = "DialogDescription";

/** For dialogs whose design carries no visible heading. */
export function VisuallyHiddenTitle({ children }: { children: React.ReactNode }) {
  return (
    <DialogPrimitive.Title className="sr-only">{children}</DialogPrimitive.Title>
  );
}

export type DialogContentProps = React.ComponentPropsWithoutRef<
  typeof DialogPrimitive.Content
> & {
  open: boolean;
  /** Full-bleed on mobile, centred card on desktop — the existing panel shape. */
  size?: "panel" | "sheet";
};

export const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  DialogContentProps
>(({ open, size = "panel", className, children, ...props }, ref) => (
  <AnimatePresence>
    {open && (
      <DialogPrimitive.Portal forceMount>
        <DialogPrimitive.Overlay asChild forceMount>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm"
          />
        </DialogPrimitive.Overlay>

        <DialogPrimitive.Content asChild forceMount ref={ref} {...props}>
          <motion.div
            initial={{ opacity: 0, scale: 0.94, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 12 }}
            transition={{ duration: 0.32, ease: EASE_OUT }}
            className={cn(
              "card fixed left-1/2 top-1/2 z-50 flex w-full -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden",
              size === "panel"
                ? "h-full max-w-[880px] sm:h-[min(88vh,880px)] sm:rounded-2xl"
                : "h-auto max-h-[85vh] max-w-[560px] rounded-2xl",
              className
            )}
          >
            {children}
          </motion.div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    )}
  </AnimatePresence>
));
DialogContent.displayName = "DialogContent";
