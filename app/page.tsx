import { HeroSection } from '@/components/landing/hero-section';
import { StatsStrip } from '@/components/landing/stats-strip';
import { HowItWorks } from '@/components/landing/how-it-works';
import { FeatureGrid } from '@/components/landing/feature-grid';
import { GradientText } from '@/components/landing/gradient-text';
import { VideoInputCTA } from '@/components/landing/video-input-cta';
import { ScrollReveal } from '@/components/landing/scroll-reveal';
import { AIBadge } from '@/components/landing/ai-badge';
import { LANDING_CONTENT } from '@/lib/constants/landing-content';

/**
 * Landing Page
 * Main marketing page for ClipHunter
 */
export default function LandingPage() {
  return (
    <div className="min-h-screen">
      {/* Hero Section */}
      <HeroSection />

      {/* Stats Strip */}
      <StatsStrip />

      {/* How It Works */}
      <HowItWorks />

      {/* Features Grid */}
      <FeatureGrid />

      {/* Pricing/Trust Section */}
      <section className="py-16 md:py-24">
        <div className="container mx-auto px-4">
          <ScrollReveal>
            <div className="max-w-3xl mx-auto text-center">
              <AIBadge className="mb-6 mx-auto">
                {LANDING_CONTENT.pricing.badge}
              </AIBadge>
              <h2 className="text-3xl md:text-5xl font-bold mb-4">
                <GradientText>{LANDING_CONTENT.pricing.title}</GradientText>
              </h2>
              <p className="text-lg md:text-xl text-muted-foreground leading-relaxed">
                {LANDING_CONTENT.pricing.description}
              </p>
            </div>
          </ScrollReveal>
        </div>
      </section>

      {/* Final CTA Section */}
      <section className="py-16 md:py-24 bg-muted/20 border-t border-border/50">
        <div className="container mx-auto px-4">
          <ScrollReveal>
            <div className="max-w-3xl mx-auto text-center">
              <h2 className="text-3xl md:text-5xl font-bold mb-4">
                <GradientText>{LANDING_CONTENT.finalCta.title}</GradientText>
              </h2>
              <p className="text-lg md:text-xl text-muted-foreground mb-8">
                {LANDING_CONTENT.finalCta.description}
              </p>
              <div className="max-w-2xl mx-auto">
                <VideoInputCTA
                  buttonText={LANDING_CONTENT.finalCta.ctaPrimary}
                  size="large"
                />
              </div>
            </div>
          </ScrollReveal>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 border-t border-border/50">
        <div className="container mx-auto px-4">
          <div className="text-center text-sm text-muted-foreground">
            <p>© 2025 ClipHunter. Built with AI for creators.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
