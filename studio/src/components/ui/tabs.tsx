// shadcn's Tabs, quiet: the active tab sits on the chip colour.
import { Tabs as TabsPrimitive } from 'radix-ui';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils.ts';

export const Tabs = TabsPrimitive.Root;
export const TabsContent = TabsPrimitive.Content;

export function TabsList({ className, ...props }: ComponentProps<typeof TabsPrimitive.List>) {
  return <TabsPrimitive.List className={cn('flex flex-wrap items-center gap-1', className)} {...props} />;
}

export function TabsTrigger({ className, ...props }: ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      className={cn('cursor-pointer rounded-md px-2 py-1 font-display text-[13px] text-muted-foreground pointer-coarse:min-h-10 hover:text-foreground data-[state=active]:bg-muted data-[state=active]:text-foreground', className)}
      {...props}
    />
  );
}
