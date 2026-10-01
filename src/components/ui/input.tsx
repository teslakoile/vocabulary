import * as React from "react"

import { cn } from "@/lib/utils"

/** A text field. Its colours come from `.field`, which adapts to whether it
 *  sits on the sky or inside a card. */
function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn("field h-14 w-full min-w-0 rounded-xl px-4 text-body in-data-[slot=card]:rounded-md", className)}
      {...props}
    />
  )
}

export { Input }
