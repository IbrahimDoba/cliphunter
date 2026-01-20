'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';

interface Voice {
  voice_id: string;
  name: string;
  category: string;
}

interface VoiceoverIntroModalProps {
  clipId: string;
  jobId: string;
  clipTitle?: string;
  onClose: () => void;
  onSuccess: () => void;
}

type ModalState = 'form' | 'processing' | 'success' | 'error';

export function VoiceoverIntroModal({
  clipId,
  jobId,
  clipTitle,
  onClose,
  onSuccess,
}: VoiceoverIntroModalProps) {
  const [state, setState] = useState<ModalState>('form');
  const [script, setScript] = useState('');
  const [voiceId, setVoiceId] = useState('');
  const [voices, setVoices] = useState<Voice[]>([]);
  const [loadingVoices, setLoadingVoices] = useState(true);
  const [isGeneratingScript, setIsGeneratingScript] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressStep, setProgressStep] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Calculate estimated duration (~2.5 words per second)
  const wordCount = script.trim().split(/\s+/).filter(w => w.length > 0).length;
  const estimatedDuration = wordCount > 0 ? Math.round((wordCount / 2.5) * 10) / 10 : 0;

  // Fetch available voices on mount
  useEffect(() => {
    const fetchVoices = async () => {
      try {
        const response = await fetch((() => process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:4000")() + '/api/elevenlabs/voices');
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error?.message || 'Failed to fetch voices');
        }

        setVoices(data.voices || []);
        // Set default voice if available
        if (data.voices && data.voices.length > 0) {
          setVoiceId(data.voices[0].voice_id);
        }
      } catch (err: any) {
        console.error('Failed to fetch voices:', err);
        setError('Failed to load voices. ElevenLabs may not be configured.');
      } finally {
        setLoadingVoices(false);
      }
    };

    fetchVoices();
  }, []);

  const handleGenerateScript = async () => {
    setIsGeneratingScript(true);
    setError(null);

    try {
      const response = await fetch(`${(() => process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:4000")()}/api/clips/${clipId}/generate-intro-script`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ jobId }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error?.message || 'Failed to generate script');
      }

      setScript(data.script);
    } catch (err: any) {
      setError(err.message || 'Failed to generate script');
    } finally {
      setIsGeneratingScript(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!script.trim()) {
      setError('Script is required');
      return;
    }

    if (script.length > 500) {
      setError('Script must be 500 characters or less');
      return;
    }

    setState('processing');
    setProgress(0);
    setProgressStep('Starting...');

    try {
      // Simulate progress since we don't have real-time updates
      const progressInterval = setInterval(() => {
        setProgress((prev) => {
          if (prev >= 90) {
            clearInterval(progressInterval);
            return 90;
          }
          // Update step based on progress
          if (prev < 20) setProgressStep('Extracting frame...');
          else if (prev < 35) setProgressStep('Applying blur effect...');
          else if (prev < 50) setProgressStep('Generating voiceover...');
          else if (prev < 65) setProgressStep('Creating subtitles...');
          else if (prev < 80) setProgressStep('Building intro video...');
          else setProgressStep('Concatenating videos...');

          return prev + Math.random() * 8;
        });
      }, 800);

      const response = await fetch(`${(() => process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:4000")()}/api/clips/${clipId}/add-intro`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          jobId,
          script: script.trim(),
          voiceId: voiceId || undefined,
        }),
      });

      clearInterval(progressInterval);

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error?.message || 'Failed to add intro');
      }

      setProgress(100);
      setProgressStep('Complete!');
      setState('success');
    } catch (err: any) {
      setError(err.message || 'Failed to add intro');
      setState('error');
    }
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget && state === 'form') {
      onClose();
    }
  };

  const handleSuccessClose = () => {
    onSuccess();
    onClose();
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
              <CardTitle>Add Voiceover Intro</CardTitle>
              <CardDescription>
                Create an AI-generated intro with voiceover and subtitles that plays before your clip
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-4">
              <form onSubmit={handleSubmit} className="space-y-5">
                {/* Generate Script Button */}
                <Button
                  type="button"
                  variant="secondary"
                  onClick={handleGenerateScript}
                  disabled={isGeneratingScript || loadingVoices}
                  className="w-full gap-2"
                >
                  {isGeneratingScript ? (
                    <>
                      <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      Generating Script...
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
                      </svg>
                      Generate Script with AI
                    </>
                  )}
                </Button>

                {/* Voice Selection */}
                <div className="space-y-2">
                  <label htmlFor="voice" className="text-sm font-medium">
                    Voice
                  </label>
                  {loadingVoices ? (
                    <div className="w-full px-3 py-2 text-sm text-muted-foreground border border-input rounded-md">
                      Loading voices...
                    </div>
                  ) : voices.length > 0 ? (
                    <select
                      id="voice"
                      value={voiceId}
                      onChange={(e) => setVoiceId(e.target.value)}
                      className="w-full px-3 py-2 text-sm rounded-md border border-input bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {voices.map((voice) => (
                        <option key={voice.voice_id} value={voice.voice_id}>
                          {voice.name} ({voice.category})
                        </option>
                      ))}
                    </select>
                  ) : (
                    <div className="w-full px-3 py-2 text-sm text-muted-foreground border border-input rounded-md">
                      No voices available
                    </div>
                  )}
                </div>

                {/* Script Input */}
                <div className="space-y-2">
                  <label htmlFor="script" className="text-sm font-medium">
                    Voiceover Script <span className="text-destructive">*</span>
                  </label>
                  <textarea
                    id="script"
                    value={script}
                    onChange={(e) => setScript(e.target.value)}
                    placeholder="Enter the text that will be spoken in the intro..."
                    className="w-full min-h-[100px] px-3 py-2 text-sm rounded-md border border-input bg-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
                    maxLength={500}
                  />
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>
                      {wordCount} words (~{estimatedDuration}s duration)
                      {estimatedDuration > 15 && (
                        <span className="text-yellow-600 ml-2">
                          (Long intro - consider shortening)
                        </span>
                      )}
                    </span>
                    <span>{script.length}/500</span>
                  </div>
                </div>

                {/* Info Box */}
                <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                  <p className="text-xs text-blue-800 dark:text-blue-200">
                    The intro will show a blurred background with your voiceover playing and
                    word-by-word subtitles appearing in sync. It will be prepended to your clip.
                  </p>
                </div>

                {error && <p className="text-sm text-destructive">{error}</p>}

                <div className="flex gap-3 pt-4">
                  <Button type="button" variant="outline" onClick={onClose} className="flex-1">
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    className="flex-1"
                    disabled={!script.trim() || loadingVoices || voices.length === 0}
                  >
                    Apply Intro
                  </Button>
                </div>
              </form>
            </CardContent>
          </>
        )}

        {state === 'processing' && (
          <>
            <CardHeader>
              <CardTitle>Creating Voiceover Intro</CardTitle>
              <CardDescription>This may take a minute...</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5 pt-4">
              <Progress value={progress} />
              <div className="text-center">
                <p className="text-sm font-medium">{progressStep}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {Math.round(progress)}% complete
                </p>
              </div>
            </CardContent>
          </>
        )}

        {state === 'success' && (
          <>
            <CardHeader>
              <CardTitle className="text-green-600">Intro Added!</CardTitle>
              <CardDescription>
                Your clip now has a voiceover intro
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5 pt-4">
              <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg">
                <p className="text-sm">
                  The voiceover intro has been added to your clip. Refresh the page to see the updated video.
                </p>
              </div>

              <Button onClick={handleSuccessClose} className="w-full">
                Close & Refresh
              </Button>
            </CardContent>
          </>
        )}

        {state === 'error' && (
          <>
            <CardHeader>
              <CardTitle className="text-destructive">Failed to Add Intro</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5 pt-4">
              <p className="text-sm text-muted-foreground">{error}</p>

              <div className="flex flex-col gap-3">
                <Button
                  onClick={() => {
                    setError(null);
                    setState('form');
                  }}
                  className="w-full"
                >
                  Try Again
                </Button>
                <Button variant="outline" onClick={onClose} className="w-full">
                  Close
                </Button>
              </div>
            </CardContent>
          </>
        )}
      </Card>
    </div>
  );
}
