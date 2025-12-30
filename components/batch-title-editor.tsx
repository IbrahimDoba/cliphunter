'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';

interface BatchTitleEditorProps {
  jobId: string;
  clips: Array<{
    id: string;
    title?: string;
  }>;
  onClose: () => void;
  onComplete: (updatedTitles: Array<{ clipId: string; title: string }>) => void;
}

interface RegenerateStatus {
  clipId: string;
  status: 'pending' | 'regenerating' | 'success' | 'error';
  error?: string;
  newTitle?: string;
}

export function BatchTitleEditor({ jobId, clips, onClose, onComplete }: BatchTitleEditorProps) {
  const [titleTemplate, setTitleTemplate] = useState('Best Moment {n}');
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [regenerateStatuses, setRegenerateStatuses] = useState<RegenerateStatus[]>([]);
  const [error, setError] = useState<string | null>(null);

  const generateTitle = (index: number): string => {
    return titleTemplate.replace(/\{n\}/g, (index + 1).toString());
  };

  const handleBatchRegenerate = async () => {
    setIsRegenerating(true);
    setError(null);

    // Initialize statuses
    const initialStatuses: RegenerateStatus[] = clips.map((clip) => ({
      clipId: clip.id,
      status: 'pending',
    }));
    setRegenerateStatuses(initialStatuses);

    const updatedTitles: Array<{ clipId: string; title: string }> = [];

    // Regenerate clips sequentially
    for (let i = 0; i < clips.length; i++) {
      const clip = clips[i];
      const newTitle = generateTitle(i);

      // Update status to regenerating
      setRegenerateStatuses((prev) =>
        prev.map((status, idx) =>
          idx === i ? { ...status, status: 'regenerating', newTitle } : status
        )
      );

      try {
        const response = await fetch(`/api/jobs/${jobId}/clips/${clip.id}/regenerate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: newTitle }),
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error?.message || 'Failed to regenerate clip');
        }

        // Update status to success
        setRegenerateStatuses((prev) =>
          prev.map((status, idx) =>
            idx === i ? { ...status, status: 'success' } : status
          )
        );

        updatedTitles.push({ clipId: clip.id, title: newTitle });

        // Wait 1 second before next regeneration (ffmpeg needs a moment)
        if (i < clips.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      } catch (err: any) {
        // Update status to error
        setRegenerateStatuses((prev) =>
          prev.map((status, idx) =>
            idx === i ? { ...status, status: 'error', error: err.message } : status
          )
        );

        // Continue with next clip even if one fails
        if (i < clips.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      }
    }

    setIsRegenerating(false);
    onComplete(updatedTitles);
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget && !isRegenerating) {
      onClose();
    }
  };

  const completedCount = regenerateStatuses.filter((s) => s.status === 'success').length;
  const failedCount = regenerateStatuses.filter((s) => s.status === 'error').length;
  const totalCount = clips.length;

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onClick={handleBackdropClick}
    >
      <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <CardHeader>
          <CardTitle>Batch Edit Video Titles</CardTitle>
          <CardDescription>
            Regenerate all {clips.length} clip{clips.length !== 1 ? 's' : ''} with new overlay titles
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {!isRegenerating && regenerateStatuses.length === 0 ? (
            <>
              <div className="p-4 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-800">
                <p className="text-sm text-amber-800 dark:text-amber-200 font-medium mb-1">
                  ⚠️ This will regenerate all video clips
                </p>
                <p className="text-xs text-amber-700 dark:text-amber-300">
                  New titles will be burned into the videos. This process may take a few minutes.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="title-template">
                  Title Template <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="title-template"
                  value={titleTemplate}
                  onChange={(e) => setTitleTemplate(e.target.value)}
                  placeholder="Best Moment {n}"
                  maxLength={100}
                />
                <p className="text-xs text-muted-foreground">
                  Use {'{n}'} for the clip number. These titles will appear overlaid on your videos.
                </p>
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-medium">Preview</Label>
                <div className="p-4 bg-muted rounded-lg space-y-1">
                  {clips.slice(0, 3).map((_, index) => (
                    <p key={index} className="text-sm">
                      Clip {index + 1}: <span className="font-medium">{generateTitle(index)}</span>
                    </p>
                  ))}
                  {clips.length > 3 && (
                    <p className="text-xs text-muted-foreground">
                      ... and {clips.length - 3} more
                    </p>
                  )}
                </div>
              </div>

              {error && <p className="text-sm text-destructive">{error}</p>}

              <div className="flex gap-3 pt-4">
                <Button type="button" variant="outline" onClick={onClose} className="flex-1">
                  Cancel
                </Button>
                <Button
                  onClick={handleBatchRegenerate}
                  disabled={!titleTemplate.trim()}
                  className="flex-1"
                >
                  Regenerate All {clips.length} Clips
                </Button>
              </div>
            </>
          ) : (
            <div className="space-y-4">
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="font-medium">
                    {isRegenerating ? 'Regenerating...' : 'Regeneration Complete'}
                  </span>
                  <span className="text-muted-foreground">
                    {completedCount}/{totalCount} successful
                    {failedCount > 0 && ` (${failedCount} failed)`}
                  </span>
                </div>
                <Progress value={(completedCount / totalCount) * 100} />
              </div>

              <div className="space-y-2 max-h-[400px] overflow-y-auto">
                {regenerateStatuses.map((status, index) => (
                  <div
                    key={status.clipId}
                    className="p-3 rounded-lg border flex items-center justify-between"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{status.newTitle || generateTitle(index)}</p>
                      <p className="text-xs text-muted-foreground">Clip {index + 1}</p>
                    </div>
                    <div className="flex items-center gap-2 ml-2">
                      {status.status === 'pending' && (
                        <span className="text-xs text-muted-foreground">Waiting...</span>
                      )}
                      {status.status === 'regenerating' && (
                        <div className="flex items-center gap-2">
                          <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                          </svg>
                          <span className="text-xs">Processing...</span>
                        </div>
                      )}
                      {status.status === 'success' && (
                        <svg className="w-4 h-4 text-green-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M20 6L9 17l-5-5" />
                        </svg>
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

              {!isRegenerating && (
                <div className="space-y-2">
                  <div className="p-3 bg-muted rounded-lg">
                    <p className="text-sm text-muted-foreground">
                      Videos have been regenerated with new titles. Refresh the page to see the updated clips.
                    </p>
                  </div>
                  <Button onClick={() => window.location.reload()} className="w-full">
                    Refresh Page
                  </Button>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
