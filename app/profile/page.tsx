"use client"

import { useSession } from "next-auth/react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { User, Crown, BarChart3, Youtube } from "lucide-react"
import { useEffect, useState } from "react"

interface UsageStats {
  today: number
  limit: number
  remaining: number
  plan: string
}

interface YouTubeAccount {
  email: string
  channelTitle: string
}

export default function ProfilePage() {
  const { data: session, status } = useSession()
  const [usage, setUsage] = useState<UsageStats | null>(null)
  const [youtubeAccount, setYoutubeAccount] = useState<YouTubeAccount | null>(null)

  useEffect(() => {
    // Fetch usage stats (includes plan info)
    fetch('/api/usage')
      .then(res => res.ok ? res.json() : null)
      .then(data => setUsage(data))
      .catch(() => null)

    // Fetch YouTube account
    fetch('/api/youtube/auth')
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (data?.connected) {
          setYoutubeAccount({
            email: data.email,
            channelTitle: data.channelTitle
          })
        }
      })
      .catch(() => null)
  }, [])

  if (status === "loading") {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
      </div>
    )
  }

  if (!session?.user) {
    return null
  }

  const isPaid = usage?.plan === "PAID"

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <h1 className="text-3xl font-bold">Profile & Settings</h1>

      {/* User Info */}
      <Card className="border-zinc-800 bg-zinc-900/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            Account Information
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            {session.user.image ? (
              <img
                src={session.user.image}
                alt={session.user.name || "User"}
                className="h-16 w-16 rounded-full"
              />
            ) : (
              <div className="h-16 w-16 rounded-full bg-zinc-700 flex items-center justify-center">
                <User className="h-8 w-8 text-zinc-400" />
              </div>
            )}
            <div>
              <p className="text-lg font-medium text-white">{session.user.name}</p>
              <p className="text-sm text-zinc-400">{session.user.email}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Plan Info */}
      <Card className="border-zinc-800 bg-zinc-900/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Crown className="h-5 w-5" />
            Your Plan
          </CardTitle>
          <CardDescription>
            {isPaid ? "You're on the Pro plan" : "You're on the Free plan"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                  isPaid
                    ? "bg-gradient-to-r from-amber-500 to-orange-500 text-white"
                    : "bg-zinc-700 text-zinc-300"
                }`}>
                  {isPaid ? "Pro" : "Free"}
                </span>
              </div>
              <p className="text-sm text-zinc-400">
                {isPaid
                  ? "50 clips per day, YouTube upload, no watermark"
                  : "2 clips per day, basic features"}
              </p>
            </div>
            {!isPaid && (
              <Button className="bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600">
                Upgrade to Pro
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Usage Stats */}
      <Card className="border-zinc-800 bg-zinc-900/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Usage
          </CardTitle>
          <CardDescription>Your clip usage for today</CardDescription>
        </CardHeader>
        <CardContent>
          {usage ? (
            <div className="space-y-4">
              <div className="flex justify-between text-sm">
                <span className="text-zinc-400">Clips used today</span>
                <span className="text-white font-medium">
                  {usage.today} / {usage.limit}
                </span>
              </div>
              <div className="h-2 bg-zinc-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-blue-500 to-purple-500 transition-all"
                  style={{ width: `${Math.min((usage.today / usage.limit) * 100, 100)}%` }}
                />
              </div>
              <p className="text-sm text-zinc-400">
                {usage.remaining > 0
                  ? `${usage.remaining} clips remaining today`
                  : "Daily limit reached. Resets at midnight UTC."}
              </p>
            </div>
          ) : (
            <p className="text-sm text-zinc-400">Loading usage data...</p>
          )}
        </CardContent>
      </Card>

      {/* YouTube Integration */}
      <Card className="border-zinc-800 bg-zinc-900/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Youtube className="h-5 w-5 text-red-500" />
            YouTube Integration
          </CardTitle>
          <CardDescription>
            Connect your YouTube account to upload clips directly
          </CardDescription>
        </CardHeader>
        <CardContent>
          {youtubeAccount ? (
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <p className="text-sm font-medium text-white">
                  {youtubeAccount.channelTitle}
                </p>
                <p className="text-xs text-zinc-400">{youtubeAccount.email}</p>
              </div>
              <Button variant="outline" size="sm" className="border-zinc-700">
                Disconnect
              </Button>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <p className="text-sm text-zinc-400">No YouTube account connected</p>
              <Button variant="outline" size="sm" className="border-zinc-700">
                Connect YouTube
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
