// /llms.txt (M5 spec §6.3): the site in a line, then every docs page's Markdown copy, in the llmstxt.org format.
import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { llmsTxt } from '../docs.ts';

export const GET: APIRoute = async ({ site }) =>
  new Response(llmsTxt((await getCollection('docs')).map((e) => ({ id: e.id, ...e.data })), site!), { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
