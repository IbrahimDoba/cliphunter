import { GradientText } from './gradient-text';
import { Video, Zap, TrendingUp } from 'lucide-react';
import { VideoInputCTA } from './video-input-cta';
import { LANDING_CONTENT } from '@/lib/constants/landing-content';

/**
 * Hero Section Component
 * Above the fold section with headline, subheadline, and primary CTA
 */
export function HeroSection() {
  return (
    <section className="relative pt-20 pb-16 md:pt-32 md:pb-24 overflow-hidden">
      {/* Animated Gradient Background */}
      <div className="absolute inset-0 gradient-ai-primary gradient-shift opacity-10 blur-3xl" />

      {/* Grid Pattern Overlay */}
      <div
        className="absolute inset-0 opacity-[0.02]"
        style={{
          backgroundImage: `linear-gradient(hsl(var(--cyber-cyan)) 1px, transparent 1px),
                           linear-gradient(90deg, hsl(var(--cyber-cyan)) 1px, transparent 1px)`,
          backgroundSize: '50px 50px',
        }}
      />

      <div className="container mx-auto px-4 relative z-10">
        <div className="max-w-4xl mx-auto text-center">
          {/* Headline */}
          <h1 className="text-5xl md:text-7xl font-bold tracking-tight mb-6">
            <GradientText as="span">{LANDING_CONTENT.hero.headline}</GradientText>
          </h1>

          {/* Subheadline */}
          <p className="text-xl md:text-2xl text-muted-foreground mb-12 leading-relaxed max-w-3xl mx-auto">
            {LANDING_CONTENT.hero.subheadline}
          </p>

          {/* CTA */}
          <div className="max-w-2xl mx-auto mb-12">
            <VideoInputCTA size="large" />
          </div>

          {/* Feature Pills */}
          <div className="flex flex-wrap items-center justify-center gap-4 text-sm">
            <div className="flex items-center gap-2 text-muted-foreground">
              <div className="p-1.5 rounded-full bg-cyan-500/10">
                <Video className="w-4 h-4 text-cyan-400" />
              </div>
              <span>ClipHunter AI Analysis</span>
            </div>
            <div className="flex items-center gap-2 text-muted-foreground">
              <div className="p-1.5 rounded-full bg-purple-500/10">
                <Zap className="w-4 h-4 text-purple-400" />
              </div>
              <span>3 min processing</span>
            </div>
            <div className="flex items-center gap-2 text-muted-foreground">
              <div className="p-1.5 rounded-full bg-blue-500/10">
                <TrendingUp className="w-4 h-4 text-blue-400" />
              </div>
              <span>Viral-ready clips</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
