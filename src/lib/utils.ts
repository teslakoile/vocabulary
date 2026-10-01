import { clsx, type ClassValue } from "clsx"
import { extendTailwindMerge } from "tailwind-merge"

// The type scale has its own names, and tailwind-merge has to be told they are
// sizes. Otherwise it reads `text-small` as a colour and drops it whenever a
// real colour class follows.
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      text: ["caption", "small", "body", "lead", "title", "display-sm", "display"],
    },
  },
})

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
