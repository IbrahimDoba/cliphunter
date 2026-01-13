'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  NARRATION_STYLE,
  NARRATION_STYLE_INFO,
  SUBTITLE_STYLE,
  SUBTITLE_STYLE_INFO,
  CLIP_AUDIO_MODE,
  DURATION_PRESETS,
  NarrationStyle,
  SubtitleStyle,
  ClipAudioMode,
} from '@/types/compilation';

interface CompilationCreateModalProps {
  jobId: string;
  clipCount: number;
  onClose: () => void;
  onCreated?: (compilationId: string) => void;
}

export function CompilationCreateModal({
  jobId,
  clipCount,
  onClose,
  onCreated,
}: CompilationCreateModalProps) {
  const [targetDuration, setTargetDuration] = useState(60);
  const [narrationStyle, setNarrationStyle] = useState<NarrationStyle>('COMMENTARY');
  const [subtitleStyle, setSubtitleStyle] = useState<SubtitleStyle>('WORD_BY_WORD_HIGHLIGHT');
  const [clipAudioMode, setClipAudioMode] = useState<ClipAudioMode>('MUTED');
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsCreating(true);
    setError(null);

    try {
      const response = await fetch('/api/compilations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobId,
          targetDuration,
          narrationStyle,
          subtitleStyle,
          audioSettings: {
            clipAudioMode,
            backgroundMusic: null,
            musicVolume: 0.3,
          },
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error?.message || 'Failed to create compilation');
      }

      // Compilation created, now start analysis
      const analyzeResponse = await fetch(`/api/compilations/${data.id}/analyze`, {
        method: 'POST',
      });

      if (!analyzeResponse.ok) {
        const analyzeData = await analyzeResponse.json();
        throw new Error(analyzeData.error?.message || 'Failed to start analysis');
      }

      // Navigate to compilation page
      if (onCreated) {
        onCreated(data.id);
      } else {
        window.location.href = `/compilations/${data.id}`;
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onClick={handleBackdropClick}
    >
      <Card className="w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <CardHeader>
          <CardTitle>Create AI Compilation</CardTitle>
          <CardDescription>
            Generate a narrated compilation from {clipCount} clips using AI
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Target Duration */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Target Duration</label>
              <Select
                value={targetDuration.toString()}
                onValueChange={(v) => setTargetDuration(parseInt(v))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DURATION_PRESETS.map((preset) => (
                    <SelectItem key={preset.value} value={preset.value.toString()}>
                      {preset.label} - {preset.description}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Narration Style */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Narration Style</label>
              <Select
                value={narrationStyle}
                onValueChange={(v) => setNarrationStyle(v as NarrationStyle)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(NARRATION_STYLE_INFO).map(([key, info]) => (
                    <SelectItem key={key} value={key}>
                      <div className="flex flex-col">
                        <span>{info.label}</span>
                        <span className="text-xs text-muted-foreground">
                          {info.description}
                        </span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {narrationStyle && (
                <p className="text-xs text-muted-foreground italic">
                  Example: "{NARRATION_STYLE_INFO[narrationStyle].example}"
                </p>
              )}
            </div>

            {/* Subtitle Style */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Subtitle Style</label>
              <Select
                value={subtitleStyle}
                onValueChange={(v) => setSubtitleStyle(v as SubtitleStyle)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(SUBTITLE_STYLE_INFO).map(([key, info]) => (
                    <SelectItem key={key} value={key}>
                      <div className="flex flex-col">
                        <span>{info.label}</span>
                        <span className="text-xs text-muted-foreground">
                          {info.description}
                        </span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Clip Audio Mode */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Clip Audio</label>
              <Select
                value={clipAudioMode}
                onValueChange={(v) => setClipAudioMode(v as ClipAudioMode)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="MUTED">
                    <div className="flex flex-col">
                      <span>Muted</span>
                      <span className="text-xs text-muted-foreground">
                        No clip audio during narration
                      </span>
                    </div>
                  </SelectItem>
                  <SelectItem value="DUCKED">
                    <div className="flex flex-col">
                      <span>Ducked</span>
                      <span className="text-xs text-muted-foreground">
                        Clip audio lowered during narration
                      </span>
                    </div>
                  </SelectItem>
                  <SelectItem value="FULL">
                    <div className="flex flex-col">
                      <span>Full</span>
                      <span className="text-xs text-muted-foreground">
                        Both clip and narration audio
                      </span>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {error && (
              <div className="p-3 bg-destructive/10 rounded-lg">
                <p className="text-sm text-destructive">{error}</p>
              </div>
            )}

            {/* Info box */}
            <div className="p-3 bg-muted rounded-lg">
              <p className="text-sm text-muted-foreground">
                AI will analyze all clips, select the best moments, generate a narration
                script, and create voiceover audio. You'll be able to review and edit
                everything before the final render.
              </p>
            </div>

            <div className="flex gap-3 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
                className="flex-1"
                disabled={isCreating}
              >
                Cancel
              </Button>
              <Button type="submit" className="flex-1" disabled={isCreating}>
                {isCreating ? (
                  <>
                    <svg
                      className="w-4 h-4 animate-spin mr-2"
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
                    Creating...
                  </>
                ) : (
                  'Create Compilation'
                )}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
