import { Link, Sparkles, Download } from 'lucide-react';
import { LANDING_CONTENT } from '@/lib/constants/landing-content';
import { ScrollReveal } from './scroll-reveal';
import { GradientText } from './gradient-text';

const STEP_ICONS = {
  '01': Link,
  '02': Sparkles,
  '03': Download,
};

/**
 * How It Works Component
 * 3-step visual process with connecting gradient line
 */
export function HowItWorks() {
  return (
    <section className="py-16 md:py-24">
      <div className="container mx-auto px-4">
        <ScrollReveal className="text-center mb-16">
          <h2 className="text-3xl md:text-5xl font-bold tracking-tight mb-4">
            <GradientText>{LANDING_CONTENT.howItWorks.title}</GradientText>
          </h2>
          <p className="text-lg md:text-xl text-muted-foreground">
            {LANDING_CONTENT.howItWorks.subtitle}
          </p>
        </ScrollReveal>

        <div className="max-w-5xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 md:gap-4 relative">
            {/* Connecting Line - Hidden on mobile */}
            <div className="hidden md:block absolute top-16 left-0 right-0 h-0.5 bg-gradient-to-r from-blue-500 via-cyan-500 to-purple-500 opacity-30" />

            {LANDING_CONTENT.howItWorks.steps.map((step, index) => {
              const Icon = STEP_ICONS[step.number as keyof typeof STEP_ICONS];

              return (
                <ScrollReveal key={step.number} delay={index * 100}>
                  <div className="flex flex-col items-center text-center relative">
                    {/* Step Number Circle */}
                    <div className="relative z-10 mb-6">
                      <div className="w-16 h-16 rounded-full bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center mb-2 shadow-lg glow-cyan">
                        <Icon className="w-8 h-8 text-white" />
                      </div>
                      <div className="text-sm font-bold text-cyan-400">
                        {step.number}
                      </div>
                    </div>

                    {/* Step Content */}
                    <h3 className="text-xl md:text-2xl font-semibold mb-3">
                      {step.title}
                    </h3>
                    <p className="text-base text-muted-foreground leading-relaxed">
                      {step.description}
                    </p>
                  </div>
                </ScrollReveal>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
