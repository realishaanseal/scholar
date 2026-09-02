import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Merge class names, letting later Tailwind utilities win over earlier ones.
 *
 * Plain string concatenation puts both `p-2` and `p-6` in the class list and
 * leaves the winner to stylesheet order, which is why a component prop meant
 * to override a default silently does nothing. twMerge resolves the conflict
 * by category so the caller's class actually takes effect.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
