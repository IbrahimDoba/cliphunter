import { cn } from '@/lib/utils/cn';

interface GradientTextProps {
  children: React.ReactNode;
  className?: string;
  as?: 'h1' | 'h2' | 'h3' | 'p' | 'span';
}

/**
 * Gradient Text Component
 * Applies AI-themed gradient to text (blue → cyan)
 */
export function GradientText({ children, className, as: Component = 'span' }: GradientTextProps) {
  return (
    <Component className={cn('gradient-ai-text', className)}>
      {children}
    </Component>
  );
}
