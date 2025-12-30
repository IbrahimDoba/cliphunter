'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { YouTubeUploadResponse, GenerateMetadataResponse } from '@/types/youtube';

interface YouTubeUploadModalProps {
  clipPath: string;
  defaultTitle?: string;
  videoTitle: string;
  clipNumber: number;
  totalClips: number;
  onClose: () => void;
}

type UploadState = 'form' | 'uploading' | 'success' | 'error';

export function YouTubeUploadModal({
  clipPath,
  defaultTitle,
  videoTitle,
  clipNumber,
  totalClips,
  onClose,
}: YouTubeUploadModalProps) {
  const [state, setState] = useState<UploadState>('form');
  const [title, setTitle] = useState(defaultTitle || '');
  const [description, setDescription] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [privacy, setPrivacy] = useState<'public' | 'unlisted' | 'private'>('private');
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<YouTubeUploadResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

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
          clipNumber,
          totalClips,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error?.message || 'Failed to generate metadata');
      }

      const metadata = data as GenerateMetadataResponse;
      setTitle(metadata.title);
      setDescription(metadata.description);
      setTags(metadata.tags);
    } catch (err: any) {
      setError(err.message || 'Failed to generate metadata');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!title.trim()) {
      setError('Title is required');
      return;
    }

    setState('uploading');
    setProgress(10);

    try {
      const progressInterval = setInterval(() => {
        setProgress((prev) => {
          if (prev >= 90) {
            clearInterval(progressInterval);
            return 90;
          }
          return prev + Math.random() * 10;
        });
      }, 500);

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
          clipPath,
          title: title.trim(),
          description: fullDescription,
          privacy,
        }),
      });

      clearInterval(progressInterval);

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error?.message || 'Upload failed');
      }

      setProgress(100);
      setResult(data);
      setState('success');
    } catch (err: any) {
      setError(err.message || 'Failed to upload video');
      setState('error');
    }
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  const removeTag = (tagToRemove: string) => {
    setTags(tags.filter((tag) => tag !== tagToRemove));
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onClick={handleBackdropClick}
    >
      <Card className="w-full max-w-md max-h-[90vh] overflow-y-auto">
        {state === 'form' && (
          <>
            <CardHeader>
              <CardTitle>Upload to YouTube</CardTitle>
              <CardDescription>Set the details for your video</CardDescription>
            </CardHeader>
            <CardContent className="pt-4">
              <form onSubmit={handleSubmit} className="space-y-5">
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
                      Auto-generate with AI
                    </>
                  )}
                </Button>

                <div className="space-y-2">
                  <label htmlFor="title" className="text-sm font-medium">
                    Title <span className="text-destructive">*</span>
                  </label>
                  <Input
                    id="title"
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Enter video title"
                    maxLength={100}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <label htmlFor="description" className="text-sm font-medium">
                    Description
                  </label>
                  <textarea
                    id="description"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Enter video description (optional)"
                    className="w-full min-h-[80px] px-3 py-2 text-sm rounded-md border border-input bg-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    maxLength={5000}
                  />
                </div>

                {/* Tags display */}
                {tags.length > 0 && (
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Tags</label>
                    <div className="flex flex-wrap gap-2">
                      {tags.map((tag) => (
                        <span
                          key={tag}
                          className="inline-flex items-center gap-1 px-2 py-1 text-xs bg-secondary rounded-full"
                        >
                          #{tag}
                          <button
                            type="button"
                            onClick={() => removeTag(tag)}
                            className="hover:text-destructive"
                          >
                            <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M18 6L6 18M6 6l12 12" />
                            </svg>
                          </button>
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                <div className="space-y-2">
                  <label htmlFor="privacy" className="text-sm font-medium">
                    Privacy
                  </label>
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

                {error && <p className="text-sm text-destructive mt-2">{error}</p>}

                <div className="flex gap-3 pt-4">
                  <Button type="button" variant="outline" onClick={onClose} className="flex-1">
                    Cancel
                  </Button>
                  <Button type="submit" className="flex-1">
                    Upload
                  </Button>
                </div>
              </form>
            </CardContent>
          </>
        )}

        {state === 'uploading' && (
          <>
            <CardHeader>
              <CardTitle>Uploading to YouTube</CardTitle>
              <CardDescription>Please wait while your video uploads...</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5 pt-4">
              <Progress value={progress} />
              <p className="text-center text-sm text-muted-foreground">
                {Math.round(progress)}% complete
              </p>
            </CardContent>
          </>
        )}

        {state === 'success' && result && (
          <>
            <CardHeader>
              <CardTitle className="text-green-600">Upload Complete!</CardTitle>
              <CardDescription>Your video has been uploaded to YouTube</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5 pt-4">
              <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg">
                <p className="text-sm font-medium">{result.title}</p>
              </div>

              <a
                href={result.videoUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="block"
              >
                <Button variant="default" className="w-full gap-2">
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M19.615 3.184c-3.604-.246-11.631-.245-15.23 0-3.897.266-4.356 2.62-4.385 8.816.029 6.185.484 8.549 4.385 8.816 3.6.245 11.626.246 15.23 0 3.897-.266 4.356-2.62 4.385-8.816-.029-6.185-.484-8.549-4.385-8.816zm-10.615 12.816v-8l8 3.993-8 4.007z" />
                  </svg>
                  Open on YouTube
                </Button>
              </a>

              <Button variant="outline" onClick={onClose} className="w-full">
                Close
              </Button>
            </CardContent>
          </>
        )}

        {state === 'error' && (
          <>
            <CardHeader>
              <CardTitle className="text-destructive">Upload Failed</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5 pt-4">
              <p className="text-sm text-muted-foreground">{error}</p>

              <div className="flex gap-3">
                <Button variant="outline" onClick={onClose} className="flex-1">
                  Close
                </Button>
                <Button
                  onClick={() => {
                    setError(null);
                    setState('form');
                  }}
                  className="flex-1"
                >
                  Try Again
                </Button>
              </div>
            </CardContent>
          </>
        )}
      </Card>
    </div>
  );
}
