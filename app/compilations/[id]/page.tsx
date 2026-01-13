'use client';

import { useEffect, useState, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Switch } from '@/components/ui/switch';
import {
  CompilationResponse,
  NARRATION_STYLE_INFO,
  NarrationStyle,
} from '@/types/compilation';

// Extended response type that includes jobId
interface ExtendedCompilationResponse extends CompilationResponse {
  jobId: string;
}

export default function CompilationPage() {
  const params = useParams();
  const router = useRouter();
  const compilationId = params.id as string;

  const [compilation, setCompilation] = useState<ExtendedCompilationResponse | null>(null);
  const [error, setError] = useState('');
  const [isPolling, setIsPolling] = useState(true);
  const [isRendering, setIsRendering] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [editedIntro, setEditedIntro] = useState('');
  const [editedOutro, setEditedOutro] = useState('');
  const [clipSubtitles, setClipSubtitles] = useState<Record<string, boolean>>({});
  const [expandedClip, setExpandedClip] = useState<string | null>(null);

  // Track if we've initialized certain states to prevent re-initialization on polling
  const subtitlesInitialized = useRef(false);
  const scriptInitialized = useRef(false);

  useEffect(() => {
    if (!compilationId) return;

    const fetchStatus = async () => {
      try {
        const response = await fetch(`/api/compilations/${compilationId}`);
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error?.message || 'Failed to fetch compilation');
        }

        setCompilation(data);

        // Initialize edited values (only once)
        if (data.script && !scriptInitialized.current) {
          setEditedIntro(data.script.intro?.text || '');
          setEditedOutro(data.script.outro?.text || '');
          scriptInitialized.current = true;
        }

        // Initialize clip subtitles state (only once)
        if (data.selectedClips && !subtitlesInitialized.current) {
          const initialSubtitles: Record<string, boolean> = {};
          data.selectedClips.forEach((clip: any) => {
            initialSubtitles[clip.clipId] = false;
          });
          setClipSubtitles(initialSubtitles);
          subtitlesInitialized.current = true;
        }

        // Stop polling if completed or failed
        if (data.status === 'COMPLETED' || data.status === 'FAILED') {
          setIsPolling(false);
        }
      } catch (err: any) {
        setError(err.message);
        setIsPolling(false);
      }
    };

    fetchStatus();

    let interval: NodeJS.Timeout;
    if (isPolling) {
      interval = setInterval(fetchStatus, 2000);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [compilationId, isPolling]);

  const handleStartRender = async () => {
    setIsRendering(true);
    setError('');

    try {
      // Save any script changes first
      if (compilation?.script) {
        await fetch(`/api/compilations/${compilationId}/script`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            intro: { text: editedIntro },
            segments: compilation.script.segments.map((seg) => ({
              clipId: seg.clipId,
              narrationBefore: seg.narrationBefore?.text,
              narrationDuring: seg.narrationDuring?.text,
              narrationAfter: seg.narrationAfter?.text,
            })),
            outro: { text: editedOutro },
            clipSubtitles, // Pass subtitle preferences
          }),
        });
      }

      // Start render
      const response = await fetch(`/api/compilations/${compilationId}/render`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clipSubtitles }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error?.message || 'Failed to start render');
      }

      setIsPolling(true);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsRendering(false);
    }
  };

  const handleRegenerateScript = async () => {
    setIsRegenerating(true);
    setError('');

    try {
      const response = await fetch(`/api/compilations/${compilationId}/regenerate-script`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error?.message || 'Failed to regenerate script');
      }

      setIsPolling(true);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsRegenerating(false);
    }
  };

  const toggleClipSubtitles = (clipId: string) => {
    setClipSubtitles((prev) => ({
      ...prev,
      [clipId]: !prev[clipId],
    }));
  };

  const toggleAllSubtitles = (enabled: boolean) => {
    if (!compilation?.selectedClips) return;
    const newState: Record<string, boolean> = {};
    compilation.selectedClips.forEach((clip) => {
      newState[clip.clipId] = enabled;
    });
    setClipSubtitles(newState);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'COMPLETED':
        return 'text-green-600 bg-green-50 dark:bg-green-900/20';
      case 'FAILED':
        return 'text-destructive bg-destructive/10';
      case 'REVIEWING':
        return 'text-blue-600 bg-blue-50 dark:bg-blue-900/20';
      default:
        return 'text-yellow-600 bg-yellow-50 dark:bg-yellow-900/20';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'CONFIGURING':
        return 'Configuring';
      case 'ANALYZING':
        return 'Analyzing Clips';
      case 'GENERATING_SCRIPT':
        return 'Generating Script';
      case 'REVIEWING':
        return 'Ready for Review';
      case 'GENERATING_VOICEOVER':
        return 'Generating Voiceover';
      case 'RENDERING':
        return 'Rendering Video';
      case 'COMPLETED':
        return 'Completed';
      case 'FAILED':
        return 'Failed';
      default:
        return status;
    }
  };

  const getEmotionIcon = (tone: string) => {
    switch (tone) {
      case 'exciting':
        return '🔥';
      case 'funny':
        return '😂';
      case 'tense':
        return '😰';
      case 'surprising':
        return '😮';
      case 'emotional':
        return '😢';
      case 'satisfying':
        return '✨';
      default:
        return '🎬';
    }
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
  };

  if (error && !compilation) {
    return (
      <div className="max-w-5xl mx-auto p-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-destructive text-2xl">Error</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-lg">{error}</p>
            <Link href="/" className="mt-4 inline-block">
              <Button size="lg">Go Home</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!compilation) {
    return (
      <div className="max-w-5xl mx-auto p-6">
        <Card>
          <CardContent className="p-12">
            <div className="text-center text-xl">Loading compilation...</div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const isProcessing =
    compilation.status !== 'COMPLETED' &&
    compilation.status !== 'FAILED' &&
    compilation.status !== 'REVIEWING';

  const allSubtitlesEnabled = compilation.selectedClips?.every(
    (clip) => clipSubtitles[clip.clipId]
  );

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">AI Compilation</h1>
          <p className="text-muted-foreground text-base mt-1">ID: {compilationId}</p>
        </div>
        <Link href={compilation.jobId ? `/jobs/${compilation.jobId}` : '/'}>
          <Button variant="outline" size="lg">
            Back to Job
          </Button>
        </Link>
      </div>

      {/* Status Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-2xl">Status</CardTitle>
              <CardDescription className="text-base mt-1">
                {NARRATION_STYLE_INFO[compilation.config.narrationStyle as NarrationStyle]?.label || compilation.config.narrationStyle} style,{' '}
                {compilation.config.targetDuration}s target
              </CardDescription>
            </div>
            <span
              className={`px-4 py-2 rounded-full text-base font-semibold ${getStatusColor(
                compilation.status
              )}`}
            >
              {getStatusLabel(compilation.status)}
            </span>
          </div>
        </CardHeader>
        <CardContent>
          {compilation.progress && isProcessing && (
            <div className="space-y-3">
              <div className="flex justify-between text-base">
                <span>{compilation.progress.message}</span>
                <span className="font-semibold">{compilation.progress.percentage}%</span>
              </div>
              <Progress value={compilation.progress.percentage} className="h-3" />
            </div>
          )}

          {compilation.status === 'FAILED' && compilation.error && (
            <div className="p-5 bg-destructive/10 rounded-lg">
              <p className="text-destructive text-lg">{compilation.error}</p>
            </div>
          )}

          {compilation.status === 'COMPLETED' && compilation.outputUrl && (
            <div className="space-y-5">
              <div className="p-5 bg-green-50 dark:bg-green-900/20 rounded-lg">
                <p className="text-green-800 dark:text-green-200 font-semibold text-lg">
                  Compilation ready!
                </p>
              </div>
              <video
                src={compilation.outputUrl}
                controls
                className="w-full rounded-lg shadow-lg"
                poster={compilation.outputUrl.replace('/video', '/thumbnail')}
              />
              <div className="flex gap-3">
                <a href={compilation.outputUrl} download className="flex-1">
                  <Button className="w-full" size="lg">
                    Download Video
                  </Button>
                </a>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Selected Clips - Improved UI */}
      {compilation.selectedClips && compilation.selectedClips.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-2xl">
                  Selected Clips ({compilation.selectedClips.length})
                </CardTitle>
                <CardDescription className="text-base mt-1">
                  AI-selected best moments for your compilation
                </CardDescription>
              </div>
              {compilation.status === 'REVIEWING' && (
                <div className="flex items-center gap-3 bg-muted px-4 py-2 rounded-lg">
                  <span className="text-base font-medium">Subtitles for all</span>
                  <Switch
                    checked={allSubtitlesEnabled}
                    onCheckedChange={toggleAllSubtitles}
                  />
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4">
              {compilation.selectedClips.map((clip, index) => {
                const analysis = compilation.clipAnalysis?.find(
                  (a) => a.clipId === clip.clipId
                );
                const clipDuration = clip.segmentEnd - clip.segmentStart;
                const isExpanded = expandedClip === clip.clipId;
                const thumbnailUrl = compilation.jobId
                  ? `/api/clips/${compilation.jobId}/clips/${clip.clipId}`
                  : null;

                return (
                  <div
                    key={clip.clipId}
                    className={`border rounded-xl overflow-hidden transition-all ${
                      isExpanded ? 'ring-2 ring-primary' : 'hover:border-primary/50'
                    }`}
                  >
                    {/* Main clip row */}
                    <div
                      className="flex items-stretch cursor-pointer"
                      onClick={() => setExpandedClip(isExpanded ? null : clip.clipId)}
                    >
                      {/* Clip number badge */}
                      <div className="w-16 bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <span className="text-2xl font-bold text-primary">{index + 1}</span>
                      </div>

                      {/* Video preview thumbnail */}
                      <div className="w-40 h-24 bg-muted flex-shrink-0 relative overflow-hidden">
                        {thumbnailUrl ? (
                          <video
                            src={thumbnailUrl}
                            className="w-full h-full object-cover"
                            muted
                            playsInline
                            preload="metadata"
                            onMouseEnter={(e) => {
                              e.currentTarget.currentTime = clip.segmentStart;
                              e.currentTarget.play();
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.pause();
                              e.currentTarget.currentTime = clip.segmentStart;
                            }}
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                            <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                          </div>
                        )}
                        {/* Duration overlay */}
                        <div className="absolute bottom-1 right-1 bg-black/70 text-white text-sm px-2 py-0.5 rounded">
                          {formatDuration(clipDuration)}
                        </div>
                      </div>

                      {/* Clip info */}
                      <div className="flex-1 p-4 min-w-0">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            <p className="text-lg font-semibold truncate">
                              {analysis?.description || `Clip ${clip.clipId.slice(0, 8)}`}
                            </p>
                            <div className="flex items-center gap-4 mt-2 text-base text-muted-foreground">
                              <span>
                                {clip.segmentStart.toFixed(1)}s - {clip.segmentEnd.toFixed(1)}s
                              </span>
                              {analysis && (
                                <span className="flex items-center gap-1">
                                  <span className="text-yellow-500">★</span>
                                  <span className="font-medium">{analysis.engagementScore}/10</span>
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Tags */}
                          <div className="flex items-center gap-2 flex-shrink-0">
                            {analysis && (
                              <span
                                className={`px-3 py-1.5 text-base font-medium rounded-full flex items-center gap-1.5 ${
                                  analysis.emotionalTone === 'exciting'
                                    ? 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-200'
                                    : analysis.emotionalTone === 'funny'
                                    ? 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-200'
                                    : analysis.emotionalTone === 'surprising'
                                    ? 'bg-pink-100 text-pink-800 dark:bg-pink-900/30 dark:text-pink-200'
                                    : analysis.emotionalTone === 'satisfying'
                                    ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-200'
                                    : 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-200'
                                }`}
                              >
                                <span>{getEmotionIcon(analysis.emotionalTone)}</span>
                                {analysis.emotionalTone}
                              </span>
                            )}
                            {/* Expand indicator */}
                            <svg
                              className={`w-5 h-5 text-muted-foreground transition-transform ${
                                isExpanded ? 'rotate-180' : ''
                              }`}
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                            >
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Expanded details */}
                    {isExpanded && analysis && (
                      <div className="border-t bg-muted/30 p-5 space-y-4">
                        {/* Key moments */}
                        {analysis.keyMoments && analysis.keyMoments.length > 0 && (
                          <div>
                            <h4 className="text-base font-semibold mb-2">Key Moments</h4>
                            <div className="flex flex-wrap gap-2">
                              {analysis.keyMoments.map((moment, i) => (
                                <span
                                  key={i}
                                  className="bg-background px-3 py-1.5 rounded-lg text-sm border"
                                >
                                  <span className="text-primary font-medium">{moment.timestamp.toFixed(1)}s:</span>{' '}
                                  {moment.description}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Notable quotes */}
                        {analysis.notableQuotes && analysis.notableQuotes.length > 0 && (
                          <div>
                            <h4 className="text-base font-semibold mb-2">Notable Quotes</h4>
                            <div className="space-y-1">
                              {analysis.notableQuotes.map((quote, i) => (
                                <p key={i} className="text-base italic text-muted-foreground">
                                  "{quote}"
                                </p>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Subtitles toggle */}
                        {compilation.status === 'REVIEWING' && (
                          <div className="flex items-center justify-between pt-3 border-t">
                            <div>
                              <p className="text-base font-semibold">Add Subtitles</p>
                              <p className="text-sm text-muted-foreground">
                                Transcribe and display subtitles for this clip
                              </p>
                            </div>
                            <Switch
                              checked={clipSubtitles[clip.clipId] || false}
                              onCheckedChange={() => toggleClipSubtitles(clip.clipId)}
                            />
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Subtitles summary */}
            {compilation.status === 'REVIEWING' && (
              <div className="mt-6 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                <div className="flex items-center gap-3">
                  <svg className="w-6 h-6 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
                  </svg>
                  <div>
                    <p className="text-base font-medium text-blue-800 dark:text-blue-200">
                      {Object.values(clipSubtitles).filter(Boolean).length} of {compilation.selectedClips.length} clips will have subtitles
                    </p>
                    <p className="text-sm text-blue-600 dark:text-blue-300">
                      Subtitles make your content more engaging and accessible
                    </p>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Script Editor */}
      {compilation.status === 'REVIEWING' && compilation.script && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-2xl">Narration Script</CardTitle>
                <CardDescription className="text-base mt-1">
                  Review and edit the AI-generated script before rendering
                </CardDescription>
              </div>
              <Button
                variant="outline"
                size="lg"
                onClick={handleRegenerateScript}
                disabled={isRegenerating}
              >
                {isRegenerating ? 'Regenerating...' : 'Regenerate Script'}
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Intro */}
            <div className="space-y-3">
              <label className="text-lg font-semibold">Intro Narration</label>
              <textarea
                value={editedIntro}
                onChange={(e) => setEditedIntro(e.target.value)}
                className="w-full min-h-[100px] px-4 py-3 text-base rounded-lg border border-input bg-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                placeholder="Opening narration..."
              />
            </div>

            {/* Segment narrations */}
            {compilation.script.segments.map((segment, index) => {
              const analysis = compilation.clipAnalysis?.find(
                (a) => a.clipId === segment.clipId
              );
              const hasNarration =
                segment.narrationBefore?.text ||
                segment.narrationDuring?.text ||
                segment.narrationAfter?.text;

              if (!hasNarration) return null;

              return (
                <div
                  key={segment.clipId}
                  className="p-5 border rounded-xl space-y-4"
                >
                  <p className="text-base font-semibold text-muted-foreground">
                    Clip {index + 1}: {analysis?.description || segment.clipId.slice(0, 8)}
                  </p>
                  {segment.narrationBefore?.text && (
                    <div className="pl-4 border-l-4 border-blue-400">
                      <p className="text-sm text-blue-600 dark:text-blue-400 font-medium mb-1">Before clip:</p>
                      <p className="text-base">{segment.narrationBefore.text}</p>
                    </div>
                  )}
                  {segment.narrationDuring?.text && (
                    <div className="pl-4 border-l-4 border-green-400">
                      <p className="text-sm text-green-600 dark:text-green-400 font-medium mb-1">During clip:</p>
                      <p className="text-base">{segment.narrationDuring.text}</p>
                    </div>
                  )}
                  {segment.narrationAfter?.text && (
                    <div className="pl-4 border-l-4 border-purple-400">
                      <p className="text-sm text-purple-600 dark:text-purple-400 font-medium mb-1">After clip:</p>
                      <p className="text-base">{segment.narrationAfter.text}</p>
                    </div>
                  )}
                </div>
              );
            })}

            {/* Outro */}
            <div className="space-y-3">
              <label className="text-lg font-semibold">Outro Narration</label>
              <textarea
                value={editedOutro}
                onChange={(e) => setEditedOutro(e.target.value)}
                className="w-full min-h-[80px] px-4 py-3 text-base rounded-lg border border-input bg-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                placeholder="Closing narration..."
              />
            </div>

            {/* Estimated duration */}
            <div className="p-4 bg-muted rounded-lg">
              <p className="text-base text-muted-foreground">
                <span className="font-medium">Estimated duration:</span> ~{compilation.script.totalEstimatedDuration}s
              </p>
            </div>

            {error && (
              <div className="p-4 bg-destructive/10 rounded-lg">
                <p className="text-base text-destructive">{error}</p>
              </div>
            )}

            {/* Render button */}
            <Button
              onClick={handleStartRender}
              className="w-full text-lg py-6"
              disabled={isRendering}
              size="lg"
            >
              {isRendering ? (
                <>
                  <svg
                    className="w-5 h-5 animate-spin mr-2"
                    viewBox="0 0 24 24"
                    fill="none"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                  Starting Render...
                </>
              ) : (
                'Start Render'
              )}
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
