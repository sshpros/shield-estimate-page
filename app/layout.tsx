import './globals.css';
import type { Metadata, Viewport } from 'next';

export const metadata: Metadata = {
title: 'Shield Low Voltage — Estimate',
description: 'Review and accept your estimate from Shield Low Voltage.',
};

// Follows the device's light/dark setting (tokens in globals.css); the browser
// chrome and form controls follow too.
export const viewport: Viewport = {
  colorScheme: 'dark light',
  themeColor: [
    { media: '(prefers-color-scheme: dark)', color: '#121217' },
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
return (
  <html lang="en">
    <body>{children}</body>
  </html>
);
}
