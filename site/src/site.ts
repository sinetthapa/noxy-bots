// Site-wide constants (M5 spec §4.3, §8.1). LAUNCHED shows the install and GitHub links (launch step 8).
export const LAUNCHED = false;
export const REGION: 'us' | 'eu' = 'us'; // the PostHog project's region, chosen when it's created (launch step 11.0)
export const LINKS = {
  github: 'https://github.com/sinetthapa/noxy-bots',
  instagram: 'https://www.instagram.com/sinet.ism/',
  x: 'https://x.com/sinetism',
  linkedin: 'https://www.linkedin.com/in/sinetthapa/',
  email: 'mailto:sinetpkr@gmail.com',
  coffee: 'https://buymeacoffee.com/sinet',
} as const;
/** A page's clean path: build.format 'file' gives /studio.html and /index.html at build time. */
export const pathOf = (url: URL): string => url.pathname.replace(/(\/index)?\.html$|\/$/, '') || '/';

/** The landing's meta description, also the footer's blurb under the project name. */
export const DESCRIPTION = 'Meet Nox, a little open-source bot for your project. Give it a look and a mood in the free studio, then grab the code or an export.';

export const NAV: readonly (readonly [href: string, label: string])[] = [
  ['/about', 'About'],
  ['/docs', 'Docs'],
  ['/studio', 'Studio'],
];
/** aria-current for a header link: 'page' on that page, 'true' on a page below it (a docs page under Docs). */
export const current = (here: string, href: string): 'page' | 'true' | undefined => (here === href ? 'page' : here.startsWith(`${href}/`) ? 'true' : undefined);
