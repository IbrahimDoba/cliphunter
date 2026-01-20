import { apiClient } from './client';

export interface UsageResponse {
  used: number;
  limit: number;
  remaining: number;
  plan: string;
}

export const usageApi = {
  get: () => apiClient<UsageResponse>('/usage'),
};
