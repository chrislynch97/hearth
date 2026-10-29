import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Joins class names, letting a later Tailwind class override an earlier one
 *  (`cn("px-2", "px-4")` → `"px-4"`). shadcn components lean on this. */
export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs));
