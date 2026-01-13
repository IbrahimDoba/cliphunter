import { LANDING_CONTENT } from '@/lib/constants/landing-content';
import { FeatureCard } from './feature-card';
import { ScrollReveal } from './scroll-reveal';
import { GradientText } from './gradient-text';

// Map feature titles to icon names
const FEATURE_ICON_MAP: Record<string, any> = {
  'ClipHunter AI Analysis': 'BrainCircuit',
  'Word-Level Subtitles': 'Captions',
  'AI-Generated Metadata': 'Sparkles',
  'Voice-Over Generation': 'Mic',
  'Direct YouTube Upload': 'Youtube',
  'Batch Processing': 'Zap',
};

/**
 * Feature Grid Component
 * Displays all 6 features in a responsive grid
 */
export function FeatureGrid() {
  return (
    <section className="py-16 md:py-24 bg-muted/20">
      <div className="container mx-auto px-4">
        <ScrollReveal className="text-center mb-16">
          <h2 className="text-3xl md:text-5xl font-bold tracking-tight mb-4">
            <GradientText>Powerful features, zero effort</GradientText>
          </h2>
          <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto">
            Everything you need to turn long videos into viral shorts
          </p>
        </ScrollReveal>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8 max-w-6xl mx-auto">
          {LANDING_CONTENT.features.map((feature, index) => (
            <ScrollReveal key={feature.title} delay={index * 100}>
              <FeatureCard
                title={feature.title}
                description={feature.description}
                accentColor={feature.accentColor}
                iconName={FEATURE_ICON_MAP[feature.title]}
              />
            </ScrollReveal>
          ))}
        </div>
      </div>
    </section>
  );
}
