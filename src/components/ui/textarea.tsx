import * as React from "react"

import { cn } from "@/lib/utils"

/** A multi-line field that grows with its text, styled like `Input`. */
function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn("field flex field-sizing-content min-h-14 w-full resize-none rounded-xl px-4 py-4 text-body in-data-[slot=card]:rounded-md", className)}
      {...props}
    />
  )
}

export { Textarea }
