import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Candidate AI Assistant',
  description: 'AI-powered interview preparation assistant powered by LiveKit',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="antialiased selection:bg-indigo-500/20 selection:text-indigo-100">{children}</body>
    </html>
  );
}

