import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Project Portal — Shield Low Voltage',
  description: 'Low-voltage rough-in progress, schedule and trade coordination for your project.',
  robots: { index: false, follow: false },
};

export default function ProjectLayout({ children }: { children: React.ReactNode }) {
  return children;
}
