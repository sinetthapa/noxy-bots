// shadcn's Toaster: sonner, following the studio's colour scheme.
import { Toaster as Sonner } from 'sonner';

export function Toaster({ theme }: { theme: 'light' | 'dark' }) {
  return <Sonner theme={theme} position="bottom-center" toastOptions={{ className: 'font-sans' }} />;
}
