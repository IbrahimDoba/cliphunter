import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { APP_CONFIG } from "@/config/constants";
import { YouTubeStatus } from "@/components/youtube-status";
import { SessionProvider } from "@/components/auth/session-provider";
import { UserMenu } from "@/components/auth/user-menu";
import { Button } from "@/components/ui/button";
import Link from "next/link";

const inter = Inter({ subsets: ["latin"] });

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
          <div className="flex flex-col min-h-screen bg-gradient-to-b from-background to-muted/20">
            <header className="border-b bg-background/80 backdrop-blur-sm sticky top-0 z-50">
              <div className="container mx-auto px-4 py-4 flex items-center justify-between">
                <Link href="/" className="hover:opacity-80 transition-opacity">
                  <h1 className="text-2xl font-bold gradient-ai-text">{APP_CONFIG.name}</h1>
                  <p className="text-sm text-muted-foreground">
                    {APP_CONFIG.description}
                  </p>
                </Link>
                <div className="flex items-center gap-4">
                  <Link href="/generate">
                    <Button variant="default" className="gradient-ai-primary text-white">
                      Generate Clips
                    </Button>
                  </Link>
                  <YouTubeStatus />
                  <UserMenu />
                </div>
              </div>
            </header>
            <main className="flex-1">
              {children}
            </main>
          </div>
        </SessionProvider>
      </body>
    </html>
  );
}
