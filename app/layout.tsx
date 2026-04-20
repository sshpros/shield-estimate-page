import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
title: 'Shield Low Voltage — Estimate',
description: 'Review and accept your estimate from Shield Low Voltage.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
return (
  <html lang="en">
    <body>{children}</body>
  </html>
);
}
