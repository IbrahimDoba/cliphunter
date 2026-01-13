import { LANDING_CONTENT } from '@/lib/constants/landing-content';
import { ScrollReveal } from './scroll-reveal';

/**
 * Stats Strip Component
 * Quick metrics and social proof
 */
export function StatsStrip() {
  return (
    <section className="py-12 border-y border-border/50 bg-muted/20">
      <div className="container mx-auto px-4">
        <ScrollReveal>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-4xl mx-auto">
            {LANDING_CONTENT.stats.map((stat, index) => (
              <div key={index} className="text-center">
                <div className="text-3xl md:text-4xl font-bold mb-2 gradient-ai-text">
                  {stat.value}
                </div>
                <div className="text-sm text-muted-foreground">{stat.label}</div>
              </div>
            ))}
          </div>
        </ScrollReveal>
      </div>
    </section>
  );
}
