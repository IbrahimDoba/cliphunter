'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { YouTubeAccountResponse } from '@/types/youtube';

interface BatchYouTubeUploadProps {
  clips: Array<{
    id: string;
    videoUrl: string;
    title?: string;
  }>;
  videoTitle: string;
  onClose: () => void;
}

interface UploadStatus {
  clipId: string;
  status: 'pending' | 'uploading' | 'success' | 'error';
  error?: string;
  videoUrl?: string;
}

export function BatchYouTubeUpload({ clips, videoTitle, onClose }: BatchYouTubeUploadProps) {
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [accountInfo, setAccountInfo] = useState<{ email?: string; channelTitle?: string } | null>(null);

  // Batch settings
  const [titleTemplate, setTitleTemplate] = useState(`${videoTitle} Part {n}`);
  const [description, setDescription] = useState('');
  const [tagsInput, setTagsInput] = useState('');
  const [privacy, setPrivacy] = useState<'public' | 'unlisted' | 'private'>('private');

  // Upload state
  const [isUploading, setIsUploading] = useState(false);
  const [uploadStatuses, setUploadStatuses] = useState<UploadStatus[]>([]);
  const [currentUploadIndex, setCurrentUploadIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  // Check YouTube connection on mount
  useEffect(() => {
    checkConnectionStatus();

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

      if (data.error) {
        setError(data.error.message);
        setIsConnecting(false);
        return;
      }

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

  const generateTitle = (index: number): string => {
    return titleTemplate.replace(/\{n\}/g, (index + 1).toString());
  };

  const parseTags = (): string[] => {
    return tagsInput
      .split(',')
      .map((tag) => tag.trim())
      .filter((tag) => tag.length > 0);
  };

  const handleAutoGenerate = async () => {
    setIsGenerating(true);
    setError(null);

    try {
      const response = await fetch('/api/youtube/generate-metadata', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          videoTitle,
          clipNumber: 1,
          totalClips: clips.length,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error?.message || 'Failed to generate metadata');
      }

      // Use the generated description and tags
      setDescription(data.description);
      setTagsInput(data.tags.join(', '));
    } catch (err: any) {
      setError(err.message || 'Failed to generate metadata');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleBatchUpload = async () => {
    if (!isConnected) {
      setError('Please connect to YouTube first');
      return;
    }

    setIsUploading(true);
    setError(null);

    // Initialize upload statuses
    const initialStatuses: UploadStatus[] = clips.map((clip) => ({
      clipId: clip.id,
      status: 'pending',
    }));
    setUploadStatuses(initialStatuses);
    setCurrentUploadIndex(0);

    // Upload clips sequentially
    for (let i = 0; i < clips.length; i++) {
      setCurrentUploadIndex(i);

      // Update status to uploading
      setUploadStatuses((prev) =>
        prev.map((status, idx) =>
          idx === i ? { ...status, status: 'uploading' } : status
        )
      );

      try {
        const clip = clips[i];
        const title = generateTitle(i);
        const tags = parseTags();

        // Build description with tags
        let fullDescription = description.trim();
        if (tags.length > 0) {
          const hashTags = tags.map((tag) => `#${tag}`).join(' ');
          fullDescription = fullDescription ? `${fullDescription}\n\n${hashTags}` : hashTags;
        }

        const response = await fetch('/api/youtube/upload', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            clipPath: clip.videoUrl,
            title,
            description: fullDescription,
            privacy,
          }),
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error?.message || 'Upload failed');
        }

        // Update status to success
        setUploadStatuses((prev) =>
          prev.map((status, idx) =>
            idx === i
              ? { ...status, status: 'success', videoUrl: data.videoUrl }
              : status
          )
        );

        // Wait 2 seconds before next upload (except for the last one)
        if (i < clips.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, 2000));
        }
      } catch (err: any) {
        // Update status to error
        setUploadStatuses((prev) =>
          prev.map((status, idx) =>
            idx === i
              ? { ...status, status: 'error', error: err.message }
              : status
          )
        );

        // Continue with next upload even if one fails
        if (i < clips.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, 2000));
        }
      }
    }

    setIsUploading(false);
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget && !isUploading) {
      onClose();
    }
  };

  const completedUploads = uploadStatuses.filter((s) => s.status === 'success').length;
  const failedUploads = uploadStatuses.filter((s) => s.status === 'error').length;
  const totalUploads = clips.length;

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onClick={handleBackdropClick}
    >
      <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <CardHeader>
          <CardTitle>Batch Upload to YouTube</CardTitle>
          <CardDescription>
            Upload {clips.length} clip{clips.length !== 1 ? 's' : ''} with the same settings
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {!isConnected ? (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Connect your YouTube account to enable batch uploading
              </p>
              <Button
                onClick={handleConnect}
                disabled={isConnecting}
                className="w-full gap-2"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M19.615 3.184c-3.604-.246-11.631-.245-15.23 0-3.897.266-4.356 2.62-4.385 8.816.029 6.185.484 8.549 4.385 8.816 3.6.245 11.626.246 15.23 0 3.897-.266 4.356-2.62 4.385-8.816-.029-6.185-.484-8.549-4.385-8.816zm-10.615 12.816v-8l8 3.993-8 4.007z" />
                </svg>
                {isConnecting ? 'Connecting...' : 'Connect YouTube'}
              </Button>
              {error && <p className="text-sm text-destructive">{error}</p>}
            </div>
          ) : !isUploading && uploadStatuses.length === 0 ? (
            <>
              {accountInfo?.channelTitle && (
                <div className="p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
                  <p className="text-sm text-green-800 dark:text-green-200">
                    Connected to: {accountInfo.channelTitle}
                  </p>
                </div>
              )}

              {/* Auto-generate button */}
              <Button
                type="button"
                variant="secondary"
                onClick={handleAutoGenerate}
                disabled={isGenerating}
                className="w-full gap-2"
              >
                {isGenerating ? (
                  <>
                    <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Generating...
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
                    </svg>
                    Auto-generate Description & Tags with AI
                  </>
                )}
              </Button>

              <div className="space-y-2">
                <Label htmlFor="title-template">
                  Title Template <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="title-template"
                  value={titleTemplate}
                  onChange={(e) => setTitleTemplate(e.target.value)}
                  placeholder="My Video Part {n}"
                  maxLength={100}
                />
                <p className="text-xs text-muted-foreground">
                  Use {'{n}'} for the clip number. Preview: {generateTitle(0)}, {generateTitle(1)}, ...
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <textarea
                  id="description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Enter video description (same for all clips)"
                  className="w-full min-h-[80px] px-3 py-2 text-sm rounded-md border border-input bg-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  maxLength={5000}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="tags">Tags</Label>
                <Input
                  id="tags"
                  value={tagsInput}
                  onChange={(e) => setTagsInput(e.target.value)}
                  placeholder="gaming, valorant, highlights (comma-separated)"
                />
                <p className="text-xs text-muted-foreground">
                  Separate tags with commas. Same tags will be applied to all clips.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="privacy">Privacy</Label>
                <select
                  id="privacy"
                  value={privacy}
                  onChange={(e) => setPrivacy(e.target.value as 'public' | 'unlisted' | 'private')}
                  className="w-full px-3 py-2 text-sm rounded-md border border-input bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <option value="private">Private</option>
                  <option value="unlisted">Unlisted</option>
                  <option value="public">Public</option>
                </select>
              </div>

              {error && <p className="text-sm text-destructive">{error}</p>}

              <div className="flex gap-3 pt-4">
                <Button type="button" variant="outline" onClick={onClose} className="flex-1">
                  Cancel
                </Button>
                <Button
                  onClick={handleBatchUpload}
                  disabled={!titleTemplate.trim()}
                  className="flex-1"
                >
                  Upload All {clips.length} Clips
                </Button>
              </div>
            </>
          ) : (
            <div className="space-y-4">
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="font-medium">
                    {isUploading ? 'Uploading...' : 'Upload Complete'}
                  </span>
                  <span className="text-muted-foreground">
                    {completedUploads}/{totalUploads} successful
                    {failedUploads > 0 && ` (${failedUploads} failed)`}
                  </span>
                </div>
                <Progress value={(completedUploads / totalUploads) * 100} />
              </div>

              <div className="space-y-2 max-h-[400px] overflow-y-auto">
                {uploadStatuses.map((status, index) => (
                  <div
                    key={status.clipId}
                    className="p-3 rounded-lg border flex items-center justify-between"
                  >
                    <div className="flex-1">
                      <p className="text-sm font-medium">{generateTitle(index)}</p>
                      <p className="text-xs text-muted-foreground">Clip {index + 1}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {status.status === 'pending' && (
                        <span className="text-xs text-muted-foreground">Waiting...</span>
                      )}
                      {status.status === 'uploading' && (
                        <div className="flex items-center gap-2">
                          <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                          </svg>
                          <span className="text-xs">Uploading...</span>
                        </div>
                      )}
                      {status.status === 'success' && (
                        <div className="flex items-center gap-2">
                          <svg className="w-4 h-4 text-green-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M20 6L9 17l-5-5" />
                          </svg>
                          {status.videoUrl && (
                            <a
                              href={status.videoUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-primary hover:underline"
                            >
                              View
                            </a>
                          )}
                        </div>
                      )}
                      {status.status === 'error' && (
                        <div className="flex items-center gap-2">
                          <svg className="w-4 h-4 text-destructive" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M18 6L6 18M6 6l12 12" />
                          </svg>
                          <span className="text-xs text-destructive" title={status.error}>
                            Failed
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {!isUploading && (
                <Button onClick={onClose} className="w-full">
                  Close
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
