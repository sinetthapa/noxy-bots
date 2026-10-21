// shadcn's Tooltip, reduced to one label: ink on the page colour, shown on hover and keyboard focus (DESIGN.md Components).
import { Tooltip as TooltipPrimitive } from 'radix-ui';
import type { ReactElement } from 'react';

export function Tooltip({ label, children }: { label: string; children: ReactElement }) {
  return (
    <TooltipPrimitive.Provider delayDuration={300}>
      <TooltipPrimitive.Root>
        <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
        <TooltipPrimitive.Portal>
          <TooltipPrimitive.Content sideOffset={6} className="z-50 max-w-64 rounded-md bg-foreground px-2 py-1 font-sans text-xs text-background">
            {label}
          </TooltipPrimitive.Content>
        </TooltipPrimitive.Portal>
      </TooltipPrimitive.Root>
    </TooltipPrimitive.Provider>
  );
}
