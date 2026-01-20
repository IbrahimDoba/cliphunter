import { PlanType } from "@prisma/client"

export interface PlanConfig {
  name: string
  clipsPerDay: number
  maxVideoLength: number // in minutes
  features: string[]
}

export const PLANS: Record<PlanType, PlanConfig> = {
  FREE: {
    name: 'Free',
    clipsPerDay: 2,
    maxVideoLength: 30,
    features: [
      'AI clip detection',
      'Basic title generation',
      '2 clips per day',
      'Watermark on clips'
    ]
  },
  PAID: {
    name: 'Pro',
    clipsPerDay: 50,
    maxVideoLength: 240,
    features: [
      'AI clip detection',
      'Advanced title generation',
      '50 clips per day',
      'No watermark',
      'YouTube direct upload',
      'Priority processing'
    ]
  }
} as const

export function getPlanConfig(plan: PlanType): PlanConfig {
  return PLANS[plan] || PLANS.FREE
}

export function getPlanLimits(plan: PlanType) {
  const config = getPlanConfig(plan)
  return {
    clipsPerDay: config.clipsPerDay,
    maxVideoLength: config.maxVideoLength
  }
}
