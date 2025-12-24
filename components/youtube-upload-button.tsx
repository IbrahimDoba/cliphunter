'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { YouTubeUploadModal } from './youtube-upload-modal';
import { YouTubeAccountResponse } from '@/types/youtube';

interface YouTubeUploadButtonProps {
  clipPath: string;
  clipTitle?: string;
  videoTitle: string;
  clipNumber: number;
  totalClips: number;
}

export function YouTubeUploadButton({
  clipPath,
  clipTitle,
  videoTitle,
  clipNumber,
  totalClips,
}: YouTubeUploadButtonProps) {
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [accountInfo, setAccountInfo] = useState<{ email?: string; channelTitle?: string } | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Check connection status on mount
  useEffect(() => {
    checkConnectionStatus();

    // Listen for OAuth popup messages
    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;

      if (event.data.type === 'youtube-auth-success') {
        setIsConnected(true);
        setAccountInfo({
          email: event.data.email,
          channelTitle: event.data.channel,
        });
        setIsConnecting(false);
        checkConnectionStatus();
      } else if (event.data.type === 'youtube-auth-error') {
        setError(event.data.error);
        setIsConnecting(false);
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const checkConnectionStatus = async () => {
    try {
      const response = await fetch('/api/youtube/auth');
      const data: YouTubeAccountResponse | { authUrl: string } = await response.json();

      if ('connected' in data && data.connected) {
        setIsConnected(true);
        setAccountInfo({
          email: data.email,
          channelTitle: data.channelTitle,
        });
      } else {
        setIsConnected(false);
        setAccountInfo(null);
      }
    } catch (err) {
      console.error('Failed to check YouTube connection:', err);
    }
  };

  const handleConnect = async () => {
    setIsConnecting(true);
    setError(null);

    try {
      const response = await fetch('/api/youtube/auth');
      const data = await response.json();

      // Handle error responses
      if (data.error) {
        setError(data.error.message);
        setIsConnecting(false);
        return;
      }

      if (data.authUrl) {
        // Open OAuth popup
        const width = 600;
        const height = 700;
        const left = window.screenX + (window.outerWidth - width) / 2;
        const top = window.screenY + (window.outerHeight - height) / 2;

        window.open(
          data.authUrl,
          'youtube-auth',
          `width=${width},height=${height},left=${left},top=${top}`
        );
      } else if (data.connected) {
        setIsConnected(true);
        setAccountInfo({
          email: data.email,
          channelTitle: data.channelTitle,
        });
        setIsConnecting(false);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to start authentication');
      setIsConnecting(false);
    }
  };

  const handleUploadClick = () => {
    setShowModal(true);
  };

  if (error) {
    return (
      <div className="space-y-2">
        <p className="text-sm text-destructive">{error}</p>
        <Button variant="outline" size="sm" onClick={handleConnect} disabled={isConnecting}>
          {isConnecting ? 'Connecting...' : 'Try Again'}
        </Button>
      </div>
    );
  }

  if (!isConnected) {
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={handleConnect}
        disabled={isConnecting}
        className="gap-2"
      >
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
          <path d="M19.615 3.184c-3.604-.246-11.631-.245-15.23 0-3.897.266-4.356 2.62-4.385 8.816.029 6.185.484 8.549 4.385 8.816 3.6.245 11.626.246 15.23 0 3.897-.266 4.356-2.62 4.385-8.816-.029-6.185-.484-8.549-4.385-8.816zm-10.615 12.816v-8l8 3.993-8 4.007z" />
        </svg>
        {isConnecting ? 'Connecting...' : 'Connect YouTube'}
      </Button>
    );
  }

  return (
    <>
      <div className="space-y-2">
        <Button variant="default" size="sm" onClick={handleUploadClick} className="gap-2 w-full">
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
            <path d="M19.615 3.184c-3.604-.246-11.631-.245-15.23 0-3.897.266-4.356 2.62-4.385 8.816.029 6.185.484 8.549 4.385 8.816 3.6.245 11.626.246 15.23 0 3.897-.266 4.356-2.62 4.385-8.816-.029-6.185-.484-8.549-4.385-8.816zm-10.615 12.816v-8l8 3.993-8 4.007z" />
          </svg>
          Upload to YouTube
        </Button>
        {accountInfo?.channelTitle && (
          <p className="text-xs text-muted-foreground text-center">
            Connected: {accountInfo.channelTitle}
          </p>
        )}
      </div>

      {showModal && (
        <YouTubeUploadModal
          clipPath={clipPath}
          defaultTitle={clipTitle}
          videoTitle={videoTitle}
          clipNumber={clipNumber}
          totalClips={totalClips}
          onClose={() => setShowModal(false)}
        />
      )}
    </>
  );
}
