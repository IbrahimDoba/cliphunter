"use client"

import { useSession, signOut } from "next-auth/react"
import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { LogOut, User, ChevronDown, Youtube } from "lucide-react"
import Link from "next/link"

export function UserMenu() {
  const { data: session, status } = useSession()
  const [isOpen, setIsOpen] = useState(false)
  const [youtubeConnected, setYoutubeConnected] = useState(false)
  const [isDisconnecting, setIsDisconnecting] = useState(false)

  useEffect(() => {
    // Check if YouTube is connected
    fetch('/api/youtube/auth')
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (data?.connected) {
          setYoutubeConnected(true)
        }
      })
      .catch(() => null)
  }, [])

  const handleDisconnectYouTube = async () => {
    setIsDisconnecting(true)
    try {
      const res = await fetch('/api/youtube/auth', { method: 'DELETE' })
      if (res.ok) {
        setYoutubeConnected(false)
      }
    } catch (error) {
      console.error('Failed to disconnect YouTube:', error)
    } finally {
      setIsDisconnecting(false)
    }
  }

  if (status === "loading") {
    return (
      <div className="h-8 w-8 animate-pulse rounded-full bg-zinc-700" />
    )
  }

  if (!session?.user) {
    return (
      <Link href="/auth/signin">
        <Button variant="outline" size="sm" className="border-zinc-700 bg-zinc-800 hover:bg-zinc-700">
          Sign In
        </Button>
      </Link>
    )
  }

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 rounded-lg px-3 py-2 hover:bg-zinc-800 transition-colors"
      >
        {session.user.image ? (
          <img
            src={session.user.image}
            alt={session.user.name || "User"}
            className="h-8 w-8 rounded-full"
          />
        ) : (
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-700">
            <User className="h-4 w-4 text-zinc-400" />
          </div>
        )}
        <span className="hidden md:block text-sm text-zinc-200">
          {session.user.name?.split(" ")[0] || "User"}
        </span>
        <ChevronDown className="h-4 w-4 text-zinc-400" />
      </button>

      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-10"
            onClick={() => setIsOpen(false)}
          />
          <div className="absolute right-0 top-full z-20 mt-2 w-56 rounded-lg border border-zinc-800 bg-zinc-900 py-2 shadow-xl">
            <div className="px-4 py-2 border-b border-zinc-800">
              <p className="text-sm font-medium text-white">
                {session.user.name}
              </p>
              <p className="text-xs text-zinc-400 truncate">
                {session.user.email}
              </p>
            </div>

            <Link
              href="/profile"
              className="flex items-center gap-2 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800 hover:text-white transition-colors"
              onClick={() => setIsOpen(false)}
            >
              <User className="h-4 w-4" />
              Profile & Settings
            </Link>

            {youtubeConnected && (
              <button
                onClick={handleDisconnectYouTube}
                disabled={isDisconnecting}
                className="flex w-full items-center gap-2 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800 hover:text-white transition-colors disabled:opacity-50"
              >
                <Youtube className="h-4 w-4 text-red-500" />
                {isDisconnecting ? "Disconnecting..." : "Disconnect YouTube"}
              </button>
            )}

            <button
              onClick={() => signOut({ callbackUrl: "/auth/signin" })}
              className="flex w-full items-center gap-2 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800 hover:text-white transition-colors"
            >
              <LogOut className="h-4 w-4" />
              Sign Out
            </button>
          </div>
        </>
      )}
    </div>
  )
}
