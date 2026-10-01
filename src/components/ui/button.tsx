import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-md text-small font-medium whitespace-nowrap transition-[color,background-color,border-color,box-shadow,scale,opacity] duration-150 ease-[cubic-bezier(0.2,0,0,1)] active:not-disabled:scale-[0.96] data-[static=true]:active:scale-100 motion-reduce:active:scale-100 outline-none focus-visible:ring-4 focus-visible:ring-ring/40 disabled:pointer-events-none aria-invalid:border-destructive [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        // A disabled primary keeps its shape and loses its fill, rather than
        // fading to a muddy half-white.
        default: "bg-primary text-primary-foreground hover:bg-primary/90 disabled:bg-primary-muted disabled:text-primary-muted-foreground",
        destructive:
          "bg-destructive text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50",
        outline:
          "border-2 border-input bg-secondary text-secondary-foreground backdrop-blur-xl hover:bg-accent hover:text-accent-foreground disabled:opacity-50",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-accent disabled:opacity-50",
        ghost:
          "hover:bg-accent hover:text-accent-foreground disabled:opacity-50",
        link: "text-primary underline-offset-4 hover:underline",
        brand:
          "bg-brand text-brand-foreground hover:bg-brand/90 disabled:opacity-50",
        quiet:
          "text-muted-foreground underline underline-offset-4 hover:text-foreground disabled:opacity-50",
      },
      size: {
        // An icon reads as part of the padding, so its side gets less. CSS cannot
        // tell a leading icon from a trailing one when the label is a bare text
        // node, so sizes assume a leading icon and a trailing one passes pr-*.
        default: "h-10 px-5 has-[>svg]:pl-4",
        // 36 to look at, 40 to hit: the extra lives in a pseudo-element above and
        // below, so a row of these does not grow and their hit areas do not touch.
        sm: "relative h-9 px-3 after:absolute after:inset-x-0 after:-inset-y-0.5 has-[>svg]:pl-2",
        lg: "h-10 px-6 has-[>svg]:px-4",
        icon: "size-9",
        "icon-sm": "size-8",
        "icon-lg": "size-10",
        xl: "h-14 rounded-xl px-6 text-body in-data-[slot=card]:rounded-md [&_svg:not([class*='size-'])]:size-5",
        "icon-xl": "size-11 rounded-xl [&_svg:not([class*='size-'])]:size-5",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  static: isStatic = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
    /** Turns off the press scale, for a control where the motion would distract. */
    static?: boolean
  }) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      data-static={isStatic || undefined}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
