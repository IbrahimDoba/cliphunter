import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { APP_CONFIG } from '@/config/constants';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: APP_CONFIG.name,
  description: APP_CONFIG.description,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <div className="min-h-screen bg-gradient-to-b from-background to-muted/20">
          <header className="border-b">
            <div className="container mx-auto px-4 py-4">
              <h1 className="text-2xl font-bold">{APP_CONFIG.name}</h1>
              <p className="text-sm text-muted-foreground">{APP_CONFIG.description}</p>
            </div>
          </header>
          <main className="container mx-auto px-4 py-8">{children}</main>
          <footer className="border-t mt-auto">
            <div className="container mx-auto px-4 py-6 text-center text-sm text-muted-foreground">
              <p>{APP_CONFIG.name} v{APP_CONFIG.version} - MVP</p>
            </div>
          </footer>
        </div>
      </body>
    </html>
  );
}
