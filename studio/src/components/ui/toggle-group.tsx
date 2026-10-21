// shadcn's Toggle Group: single choice renders Radix radios (role="radio", aria-checked), as DESIGN.md asks.
import { cva, type VariantProps } from 'class-variance-authority';
import { ToggleGroup as ToggleGroupPrimitive } from 'radix-ui';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils.ts';

const item = cva('inline-flex cursor-pointer items-center justify-center gap-1.5 font-display text-[13px] disabled:pointer-events-none disabled:opacity-50', {
  variants: {
    variant: {
      chip: 'pressable h-8 rounded-lg bg-card px-3 font-medium text-foreground pointer-coarse:h-11 data-[state=off]:hover:bg-muted data-[state=on]:border-primary data-[state=on]:bg-primary data-[state=on]:text-primary-foreground data-[state=on]:shadow-[0_2px_0_var(--accent-drop)]',
      segment: 'h-7 rounded-[12px] px-3 text-muted-foreground pointer-coarse:h-10 hover:text-foreground data-[state=on]:bg-card data-[state=on]:text-foreground data-[state=on]:shadow-[0_1px_2px_color-mix(in_oklch,var(--shadow)_18%,transparent)]',
      swatch: 'relative size-[34px] rounded-full border-2 border-border pointer-coarse:size-11 hover:border-muted-foreground data-[state=on]:outline-2 data-[state=on]:outline-offset-2 data-[state=on]:outline-primary',
    },
  },
  defaultVariants: { variant: 'chip' },
});

export function ToggleGroup({ className, ...props }: ComponentProps<typeof ToggleGroupPrimitive.Root>) {
  return <ToggleGroupPrimitive.Root className={cn('flex flex-wrap gap-1.5', className)} {...props} />;
}

export function ToggleGroupItem({ className, variant, ...props }: ComponentProps<typeof ToggleGroupPrimitive.Item> & VariantProps<typeof item>) {
  return <ToggleGroupPrimitive.Item className={cn(item({ variant }), className)} {...props} />;
}
