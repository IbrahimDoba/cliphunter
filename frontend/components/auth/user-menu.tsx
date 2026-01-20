"use client";

import { useSession, signOut } from "next-auth/react";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { LogOut, User, ChevronDown, Youtube } from "lucide-react";
import Link from "next/link";
import { youtubeApi } from "@/lib/api";

export function UserMenu() {
  const { data: session, status } = useSession();
  const [isOpen, setIsOpen] = useState(false);
  const [youtubeConnected, setYoutubeConnected] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);

  useEffect(() => {
    // YouTube connection check disabled for now
    // TODO: Add a backend endpoint to check YouTube connection status
    setYoutubeConnected(false);
  }, []);

  const handleDisconnectYouTube = async () => {
    setIsDisconnecting(true);
    try {
      await youtubeApi.disconnect();
      setYoutubeConnected(false);
    } catch (error) {
      console.error("Failed to disconnect YouTube:", error);
    } finally {
      setIsDisconnecting(false);
    }
  };

  if (status === "loading") {
    return <div className="h-8 w-8 animate-pulse rounded-full bg-muted" />;
  }

  // Don't show anything when logged out (Generate Clips button handles CTA)
  if (!session?.user) {
    return null;
  }

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 rounded-lg px-3 py-2 hover:bg-muted transition-colors"
      >
        {session.user.image ? (
          <img
            src={session.user.image}
            alt={session.user.name || "User"}
            className="h-8 w-8 rounded-full"
          />
        ) : (
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted">
            <User className="h-4 w-4 text-muted-foreground" />
          </div>
        )}
        <span className="hidden md:block text-sm">
          {session.user.name?.split(" ")[0] || "User"}
        </span>
        <ChevronDown className="h-4 w-4 text-muted-foreground" />
      </button>

      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-10"
            onClick={() => setIsOpen(false)}
          />
          <div className="absolute right-0 top-full z-20 mt-2 w-56 rounded-lg border bg-card py-2 shadow-xl">
            <div className="px-4 py-2 border-b">
              <p className="text-sm font-medium">
                {session.user.name}
              </p>
              <p className="text-xs text-muted-foreground truncate">
                {session.user.email}
              </p>
            </div>

            <Link
              href="/profile"
              className="flex items-center gap-2 px-4 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              onClick={() => setIsOpen(false)}
            >
              <User className="h-4 w-4" />
              Profile & Settings
            </Link>

            {youtubeConnected && (
              <button
                onClick={handleDisconnectYouTube}
                disabled={isDisconnecting}
                className="flex w-full items-center gap-2 px-4 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground transition-colors disabled:opacity-50"
              >
                <Youtube className="h-4 w-4 text-red-500" />
                {isDisconnecting ? "Disconnecting..." : "Disconnect YouTube"}
              </button>
            )}

            <button
              onClick={() => signOut({ callbackUrl: "/auth/signin" })}
              className="flex w-full items-center gap-2 px-4 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            >
              <LogOut className="h-4 w-4" />
              Sign Out
            </button>
          </div>
        </>
      )}
    </div>
  );
}
