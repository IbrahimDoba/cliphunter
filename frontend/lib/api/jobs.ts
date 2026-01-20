import { apiClient } from './client';
import type { JobProgress, JobResult, JobError } from '@/lib/shared';

export interface CreateJobRequest {
  videoUrl: string;
  options?: {
    maxClips?: number;
    includeSubtitles?: boolean;
    showSubscribe?: boolean;
    framingMode?: 'crop' | 'fit';
  };
}

export interface CreateJobResponse {
  jobId: string;
  status: string;
}

export interface JobStatusResponse {
  jobId: string;
  status: string;
  progress?: JobProgress;
  result?: JobResult;
  error?: JobError;
}

export const jobsApi = {
  create: (data: CreateJobRequest) =>
    apiClient<CreateJobResponse>('/jobs/create', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  getStatus: (jobId: string) =>
    apiClient<JobStatusResponse>(`/jobs/${jobId}/status`),

  cancel: (jobId: string) =>
    apiClient<{ jobId: string; status: string }>(`/jobs/${jobId}/cancel`, {
      method: 'POST',
    }),

  regenerateClip: (jobId: string, clipId: string, newTitle?: string) =>
    apiClient<{ success: boolean }>(`/jobs/${jobId}/clips/${clipId}/regenerate`, {
      method: 'POST',
      body: JSON.stringify({ title: newTitle }),
    }),

  getVideoUrl: (jobId: string, compilationId: string) =>
    `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/jobs/${jobId}/compilations/${compilationId}/video`,
};
