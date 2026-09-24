// Join a site-root-relative path with the configured base (GitHub Pages subpath).
const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

export function url(path = '/'): string {
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${BASE}${p}`;
}

export const NAV = [
  { href: '/', label: 'Overview' },
  { href: '/demonstrator', label: 'Demonstrator' },
  { href: '/versions', label: 'Versions' },
  { href: '/explorer', label: 'Item explorer' },
  { href: '/feedback', label: 'Feedback' },
  { href: '/choice-task', label: 'Choice task' },
  { href: '/evidence', label: 'Evidence' },
  { href: '/downloads', label: 'Downloads' },
];
