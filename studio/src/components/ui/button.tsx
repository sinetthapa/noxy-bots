// shadcn's Button in DESIGN.md's pressable style: 2px border, a 2px drop that shrinks on press; primary is orange with ink text.
// Hover tints the fill (pointer devices only); touch screens get 44px targets.
import { cva, type VariantProps } from 'class-variance-authority';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils.ts';

export const button = cva(
  'inline-flex shrink-0 cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-lg font-display text-[13px] font-semibold disabled:pointer-events-none disabled:opacity-50 pointer-coarse:min-h-11 pointer-coarse:min-w-11 [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default: 'pressable bg-card text-foreground hover:bg-muted',
        primary: 'pressable border-primary bg-primary text-primary-foreground shadow-[0_2px_0_var(--accent-drop)] hover:bg-[color-mix(in_oklch,var(--primary)_88%,white)] active:shadow-[0_1px_0_var(--accent-drop)]',
        ghost: 'bg-transparent text-muted-foreground hover:text-foreground',
        event: 'border border-dashed border-[color-mix(in_oklch,var(--foreground)_25%,transparent)] bg-card font-medium text-foreground hover:bg-muted',
      },
      size: { default: 'h-9 px-3', sm: 'h-8 px-2.5', icon: 'size-9' },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
);

export function Button({ className, variant, size, type = 'button', ...props }: ComponentProps<'button'> & VariantProps<typeof button>) {
  return <button type={type} className={cn(button({ variant, size }), className)} {...props} />;
}
