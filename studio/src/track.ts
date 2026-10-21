// Analytics hook (M5 spec §8.2): the site sets globalThis.noxyTrack; under `npm run studio` and in tests nothing is listening.
type Props = Record<string, string | number>;
export const track = (event: string, props?: Props): void => (globalThis as { noxyTrack?: (e: string, p?: Props) => void }).noxyTrack?.(event, props);
