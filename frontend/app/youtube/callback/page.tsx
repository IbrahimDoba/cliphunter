'use client';

import { Suspense, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

function YouTubeCallbackContent() {
  const searchParams = useSearchParams();
  const success = searchParams.get('success');
  const error = searchParams.get('error');
  const email = searchParams.get('email');
  const channel = searchParams.get('channel');

  useEffect(() => {
    // If this is in a popup, close it and notify parent
    if (window.opener) {
      if (success) {
        window.opener.postMessage(
          {
            type: 'youtube-auth-success',
            email,
            channel,
          },
          window.location.origin
        );
      } else if (error) {
        window.opener.postMessage(
          {
            type: 'youtube-auth-error',
            error,
          },
          window.location.origin
        );
      }

      // Close popup after short delay
      setTimeout(() => {
        window.close();
      }, 1500);
    }
  }, [success, error, email, channel]);

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardHeader>
            <CardTitle className="text-green-600">Connected!</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">
              YouTube account connected successfully.
              {channel && <span className="block mt-2 font-medium">{channel}</span>}
            </p>
            <p className="text-sm text-muted-foreground mt-4">
              This window will close automatically...
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardHeader>
            <CardTitle className="text-destructive">Connection Failed</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">{error}</p>
            <p className="text-sm text-muted-foreground mt-4">
              This window will close automatically...
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <Card className="max-w-md w-full">
        <CardContent className="p-8">
          <div className="text-center text-muted-foreground">Processing...</div>
        </CardContent>
      </Card>
    </div>
  );
}

function LoadingFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <Card className="max-w-md w-full">
        <CardContent className="p-8">
          <div className="text-center text-muted-foreground">Loading...</div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function YouTubeCallbackPage() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <YouTubeCallbackContent />
    </Suspense>
  );
}
