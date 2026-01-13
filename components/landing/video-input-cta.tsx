'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ArrowRight, Sparkles } from 'lucide-react';

interface VideoInputCTAProps {
  placeholder?: string;
  buttonText?: string;
  size?: 'default' | 'large';
}

/**
 * Video Input CTA Component
 * Enhanced YouTube URL input with gradient button
 * Validates and redirects to /generate with pre-filled URL
 */
export function VideoInputCTA({
  placeholder = 'https://youtube.com/watch?v=...',
  buttonText = 'Generate Clips',
  size = 'default',
}: VideoInputCTAProps) {
  const router = useRouter();
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Basic URL validation
    if (!url.trim()) {
      setError('Please enter a YouTube URL');
      return;
    }

    // Check if it's a valid YouTube URL
    const youtubeRegex = /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.+/;
    if (!youtubeRegex.test(url)) {
      setError('Please enter a valid YouTube URL');
      return;
    }

    // Redirect to generate page with URL as query param
    router.push(`/generate?url=${encodeURIComponent(url)}`);
  };

  const isLarge = size === 'large';

  return (
    <form onSubmit={handleSubmit} className="w-full">
      <div className="flex flex-col md:flex-row gap-3">
        <div className="flex-1">
          <Input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder={placeholder}
            className={`
              w-full bg-background/50 backdrop-blur
              border-cyan-500/20 focus:border-cyan-500/50
              ${isLarge ? 'h-14 text-lg' : 'h-12'}
            `}
          />
          {error && <p className="text-sm text-destructive mt-2">{error}</p>}
        </div>
        <Button
          type="submit"
          size={isLarge ? 'lg' : 'default'}
          className={`
            gradient-ai-primary hover:opacity-90 transition-all
            text-white font-semibold
            gap-2 group
            ${isLarge ? 'h-14 px-8 text-lg' : 'h-12 px-6'}
          `}
        >
          <Sparkles className="w-4 h-4" />
          {buttonText}
          <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
        </Button>
      </div>
      <p className="text-xs text-muted-foreground mt-2">
        Works with YouTube videos, Shorts, and live streams
      </p>
    </form>
  );
}
