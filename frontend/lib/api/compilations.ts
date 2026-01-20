import { apiClient } from './client';
import type {
  Compilation,
  CompilationConfig,
  CompilationProgress,
  ClipAnalysis,
  SelectedClip,
  CompilationScript,
} from '@/lib/shared';

export interface CompilationResponse {
  id: string;
  status: string;
  progress: CompilationProgress | null;
  config: {
    targetDuration: number;
    narrationStyle: string;
    subtitleStyle: string;
    audioSettings: {
      clipAudioMode: string;
      backgroundMusic: string | null;
      musicVolume: number;
    };
  };
  clipAnalysis: ClipAnalysis[] | null;
  selectedClips: SelectedClip[] | null;
  script: CompilationScript | null;
  outputUrl: string | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

export const compilationsApi = {
  create: (jobId: string, config: Omit<CompilationConfig, 'jobId'>) =>
    apiClient<{ compilationId: string }>('/compilations', {
      method: 'POST',
      body: JSON.stringify({ jobId, ...config }),
    }),

  get: (compilationId: string) =>
    apiClient<CompilationResponse>(`/compilations/${compilationId}`),

  analyze: (compilationId: string) =>
    apiClient<{ status: string }>(`/compilations/${compilationId}/analyze`, {
      method: 'POST',
    }),

  saveScript: (compilationId: string, script: any) =>
    apiClient<{ status: string }>(`/compilations/${compilationId}/script`, {
      method: 'POST',
      body: JSON.stringify({ script }),
    }),

  regenerateScript: (compilationId: string, instructions?: string) =>
    apiClient<{ status: string }>(`/compilations/${compilationId}/regenerate-script`, {
      method: 'POST',
      body: JSON.stringify({ instructions }),
    }),

  render: (compilationId: string) =>
    apiClient<{ status: string }>(`/compilations/${compilationId}/render`, {
      method: 'POST',
    }),

  getClips: (compilationId: string) =>
    apiClient<{ clips: any[] }>(`/compilations/${compilationId}/clips`),
};
