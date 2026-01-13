import { Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

interface AIBadgeProps {
  children: React.ReactNode;
  className?: string;
  animated?: boolean;
}

/**
 * AI Badge Component
 * Shows "AI-Powered" or similar badge with sparkle icon
 */
export function AIBadge({ children, className, animated = false }: AIBadgeProps) {
  return (
    <div
      className={cn(
        'inline-flex items-center gap-2 px-3 py-1.5 rounded-full',
        'bg-gradient-to-r from-blue-500/10 to-cyan-500/10',
        'border border-cyan-500/20',
        'text-xs font-medium text-cyan-400',
        animated && 'pulse-glow',
        className
      )}
    >
      <Sparkles className="w-3.5 h-3.5" />
      <span>{children}</span>
    </div>
  );
}
