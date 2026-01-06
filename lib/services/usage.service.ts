import { prisma } from "@/lib/db/prisma"
import { getPlanLimits } from "@/lib/config/plans"
import { PlanType } from "@prisma/client"

export interface UsageCheckResult {
  allowed: boolean
  remaining: number
  limit: number
  used: number
  resetAt: Date
}

export interface UsageStats {
  today: number
  thisWeek: number
  thisMonth: number
  allTime: number
}

export class UsageService {
  /**
   * Check if user can create more clips
   */
  async canCreateClips(
    userId: string,
    clipCount: number = 1
  ): Promise<UsageCheckResult> {
    // Get user's subscription/plan
    const subscription = await prisma.subscription.findUnique({
      where: { userId }
    })

    const plan = subscription?.plan || PlanType.FREE
    const { clipsPerDay } = getPlanLimits(plan)

    // Get today's date (start of day UTC)
    const today = new Date()
    today.setUTCHours(0, 0, 0, 0)

    // Get today's usage
    const usageRecord = await prisma.usageRecord.findUnique({
      where: {
        userId_date: {
          userId,
          date: today
        }
      }
    })

    const used = usageRecord?.clipsUsed || 0
    const remaining = Math.max(0, clipsPerDay - used)

    // Calculate reset time (next midnight UTC)
    const resetAt = new Date(today)
    resetAt.setUTCDate(resetAt.getUTCDate() + 1)

    return {
      allowed: remaining >= clipCount,
      remaining,
      limit: clipsPerDay,
      used,
      resetAt
    }
  }

  /**
   * Record clip usage for a user
   */
  async recordUsage(userId: string, clipCount: number): Promise<void> {
    const today = new Date()
    today.setUTCHours(0, 0, 0, 0)

    await prisma.usageRecord.upsert({
      where: {
        userId_date: {
          userId,
          date: today
        }
      },
      update: {
        clipsUsed: { increment: clipCount }
      },
      create: {
        userId,
        date: today,
        clipsUsed: clipCount
      }
    })
  }

  /**
   * Get usage statistics for a user
   */
  async getUsageStats(userId: string): Promise<UsageStats> {
    const now = new Date()

    // Start of today
    const startOfDay = new Date(now)
    startOfDay.setUTCHours(0, 0, 0, 0)

    // Start of week (Sunday)
    const startOfWeek = new Date(now)
    startOfWeek.setUTCDate(now.getUTCDate() - now.getUTCDay())
    startOfWeek.setUTCHours(0, 0, 0, 0)

    // Start of month
    const startOfMonth = new Date(now.getUTCFullYear(), now.getUTCMonth(), 1)

    const [todayRecord, weekAgg, monthAgg, allTimeAgg] = await Promise.all([
      prisma.usageRecord.findUnique({
        where: {
          userId_date: {
            userId,
            date: startOfDay
          }
        }
      }),
      prisma.usageRecord.aggregate({
        where: {
          userId,
          date: { gte: startOfWeek }
        },
        _sum: { clipsUsed: true }
      }),
      prisma.usageRecord.aggregate({
        where: {
          userId,
          date: { gte: startOfMonth }
        },
        _sum: { clipsUsed: true }
      }),
      prisma.usageRecord.aggregate({
        where: { userId },
        _sum: { clipsUsed: true }
      })
    ])

    return {
      today: todayRecord?.clipsUsed || 0,
      thisWeek: weekAgg._sum.clipsUsed || 0,
      thisMonth: monthAgg._sum.clipsUsed || 0,
      allTime: allTimeAgg._sum.clipsUsed || 0
    }
  }

  /**
   * Get current usage for API response
   */
  async getCurrentUsage(userId: string) {
    const subscription = await prisma.subscription.findUnique({
      where: { userId }
    })

    const plan = subscription?.plan || PlanType.FREE
    const { clipsPerDay } = getPlanLimits(plan)

    const today = new Date()
    today.setUTCHours(0, 0, 0, 0)

    const usageRecord = await prisma.usageRecord.findUnique({
      where: {
        userId_date: {
          userId,
          date: today
        }
      }
    })

    const used = usageRecord?.clipsUsed || 0

    return {
      today: used,
      limit: clipsPerDay,
      remaining: Math.max(0, clipsPerDay - used),
      plan
    }
  }
}

// Export singleton instance
export const usageService = new UsageService()
