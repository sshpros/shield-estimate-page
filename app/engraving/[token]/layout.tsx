import type { Metadata } from 'next';
import './engraving.css';

export const metadata: Metadata = {
  title: 'Keypad Engravings — Shield Low Voltage',
  description: 'Choose the engraving for each button on your Lutron Palladiom keypads.',
  robots: { index: false, follow: false },
};

export default function EngravingLayout({ children }: { children: React.ReactNode }) {
  return children;
}
