import { Job, JobOptions } from './job';

// Job Creation API
export interface CreateJobRequest {
  videoUrl: string;
  options?: JobOptions;
}

export interface CreateJobResponse {
  jobId: string;
  status: string;
  createdAt: string;
  estimatedTime?: number;
}

// Job Status API
export interface GetJobStatusResponse {
  jobId: string;
  status: Job['status'];
  progress: Job['progress'];
  result?: Job['result'];
  error?: Job['error'];
  createdAt: string;
  updatedAt: string;
}

// Job Cancellation API
export interface CancelJobResponse {
  jobId: string;
  status: string;
}

// Error Response
export interface ApiErrorResponse {
  error: {
    message: string;
    code: string;
    details?: unknown;
  };
}
