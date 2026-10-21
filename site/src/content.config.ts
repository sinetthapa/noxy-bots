// The docs pages (M5 spec §6.1): one MDX file each in src/content/docs; `order` sets the sidebar and prev/next.
import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

export const collections = {
  docs: defineCollection({
    loader: glob({ pattern: '*.mdx', base: './src/content/docs' }),
    schema: z.object({ title: z.string(), description: z.string(), order: z.number() }),
  }),
};
