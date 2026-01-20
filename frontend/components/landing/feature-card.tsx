import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { BrainCircuit, Captions, Sparkles, Mic, Youtube, Zap } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

// Icon mapping
const FEATURE_ICONS = {
  BrainCircuit,
  Captions,
  Sparkles,
  Mic,
  Youtube,
  Zap,
};

type AccentColor = 'blue' | 'cyan' | 'purple';

interface FeatureCardProps {
  title: string;
  description: string;
  accentColor: AccentColor;
  iconName?: keyof typeof FEATURE_ICONS;
}

/**
 * Feature Card Component
 * Individual feature card with icon, hover glow effect
 */
export function FeatureCard({
  title,
  description,
  accentColor,
  iconName = 'Sparkles',
}: FeatureCardProps) {
  const Icon = FEATURE_ICONS[iconName];

  const glowClass = {
    blue: 'group-hover:glow-cyan',
    cyan: 'group-hover:glow-cyan',
    purple: 'group-hover:glow-purple',
  }[accentColor];

  const iconColorClass = {
    blue: 'text-blue-400',
    cyan: 'text-cyan-400',
    purple: 'text-purple-400',
  }[accentColor];

  const bgClass = {
    blue: 'bg-blue-500/10',
    cyan: 'bg-cyan-500/10',
    purple: 'bg-purple-500/10',
  }[accentColor];

  return (
    <Card
      className={cn(
        'relative overflow-hidden group',
        'hover:border-cyan-500/50 transition-all duration-300',
        'hover:scale-105',
        glowClass
      )}
    >
      {/* Subtle gradient overlay on hover */}
      <div className="absolute inset-0 bg-gradient-to-br from-transparent to-cyan-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

      <CardHeader className="relative z-10">
        <div className={cn('mb-4 p-3 rounded-lg w-fit', bgClass)}>
          <Icon className={cn('w-6 h-6', iconColorClass)} />
        </div>
        <CardTitle className="text-xl md:text-2xl">{title}</CardTitle>
      </CardHeader>
      <CardContent className="relative z-10">
        <CardDescription className="text-base leading-relaxed">
          {description}
        </CardDescription>
      </CardContent>
    </Card>
  );
}
