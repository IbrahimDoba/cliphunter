'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';

export function YouTubeStatus() {
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [channelTitle, setChannelTitle] = useState<string | null>(null);

  useEffect(() => {
    checkStatus();

    // Listen for OAuth popup messages
    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;

      if (event.data.type === 'youtube-auth-success') {
        setIsConnected(true);
        setChannelTitle(event.data.channel);
        checkStatus();
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const checkStatus = async () => {
    try {
      const response = await fetch('/api/youtube/auth');
      const data = await response.json();

      if (data.connected) {
        setIsConnected(true);
        setChannelTitle(data.channelTitle || null);
      } else {
        setIsConnected(false);
        setChannelTitle(null);
      }
    } catch (err) {
      console.error('Failed to check YouTube status:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleConnect = async () => {
    setIsLoading(true);

    try {
      const response = await fetch('/api/youtube/auth');
      const data = await response.json();

      if (data.authUrl) {
        const width = 600;
        const height = 700;
        const left = window.screenX + (window.outerWidth - width) / 2;
        const top = window.screenY + (window.outerHeight - height) / 2;

        window.open(
          data.authUrl,
          'youtube-auth',
          `width=${width},height=${height},left=${left},top=${top}`
        );
      }
    } catch (err) {
      console.error('Failed to connect:', err);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
        </svg>
      </div>
    );
  }

  // Show Connect button only when not connected
  if (!isConnected) {
    return (
      <Button variant="outline" size="sm" onClick={handleConnect} className="gap-2">
        <svg className="w-4 h-4 text-red-500" viewBox="0 0 24 24" fill="currentColor">
          <path d="M19.615 3.184c-3.604-.246-11.631-.245-15.23 0-3.897.266-4.356 2.62-4.385 8.816.029 6.185.484 8.549 4.385 8.816 3.6.245 11.626.246 15.23 0 3.897-.266 4.356-2.62 4.385-8.816-.029-6.185-.484-8.549-4.385-8.816zm-10.615 12.816v-8l8 3.993-8 4.007z" />
        </svg>
        Connect YouTube
      </Button>
    );
  }

  // When connected, just show status (disconnect is in user menu)
  return (
    <div className="flex items-center gap-2 text-sm">
      <svg className="w-4 h-4 text-red-500" viewBox="0 0 24 24" fill="currentColor">
        <path d="M19.615 3.184c-3.604-.246-11.631-.245-15.23 0-3.897.266-4.356 2.62-4.385 8.816.029 6.185.484 8.549 4.385 8.816 3.6.245 11.626.246 15.23 0 3.897-.266 4.356-2.62 4.385-8.816-.029-6.185-.484-8.549-4.385-8.816zm-10.615 12.816v-8l8 3.993-8 4.007z" />
      </svg>
      <span className="text-muted-foreground">
        {channelTitle || 'Connected'}
      </span>
    </div>
  );
}
