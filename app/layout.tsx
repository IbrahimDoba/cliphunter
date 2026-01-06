import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { APP_CONFIG } from '@/config/constants';
import { YouTubeStatus } from '@/components/youtube-status';
import { SessionProvider } from '@/components/auth/session-provider';
import { UserMenu } from '@/components/auth/user-menu';
import Link from 'next/link';

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
        <SessionProvider>
          <div className="min-h-screen bg-gradient-to-b from-background to-muted/20">
            <header className="border-b">
              <div className="container mx-auto px-4 py-4 flex items-center justify-between">
                <Link href="/" className="hover:opacity-80 transition-opacity">
                  <h1 className="text-2xl font-bold">{APP_CONFIG.name}</h1>
                  <p className="text-sm text-muted-foreground">{APP_CONFIG.description}</p>
                </Link>
                <div className="flex items-center gap-4">
                  <YouTubeStatus />
                  <UserMenu />
                </div>
              </div>
            </header>
            <main className="container mx-auto px-4 py-8">{children}</main>
            <footer className="border-t mt-auto">
              <div className="container mx-auto px-4 py-6 text-center text-sm text-muted-foreground">
                <p>{APP_CONFIG.name} v{APP_CONFIG.version} - MVP</p>
              </div>
            </footer>
          </div>
        </SessionProvider>
      </body>
    </html>
  );
}
