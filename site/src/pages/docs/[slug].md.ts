// /docs/<id>.md (M5 spec §6.3): each docs page as Markdown, Getting started at /docs/index.md.
import type { APIRoute, GetStaticPaths } from 'astro';
import { getCollection, type CollectionEntry } from 'astro:content';
import { toMarkdown } from '../../docs.ts';

export const getStaticPaths = (async () => (await getCollection('docs')).map((entry) => ({ params: { slug: entry.id }, props: { entry } }))) satisfies GetStaticPaths;

export const GET: APIRoute<{ entry: CollectionEntry<'docs'> }> = ({ props }) =>
  new Response(toMarkdown(props.entry.data, props.entry.body ?? ''), { headers: { 'Content-Type': 'text/markdown; charset=utf-8' } });
