import { apiClient } from './client';

export interface YouTubeMetadata {
  title: string;
  description: string;
  tags: string[];
}

export interface YouTubeUploadData {
  clipId: string;
  title: string;
  description: string;
  tags: string[];
  privacyStatus: 'private' | 'unlisted' | 'public';
}

export const youtubeApi = {
  getAuthUrl: () =>
    apiClient<{ authUrl: string }>('/youtube/auth', { method: 'POST' }),

  upload: (data: YouTubeUploadData) =>
    apiClient<{ videoId: string }>('/youtube/upload', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  generateMetadata: (clipId: string) =>
    apiClient<YouTubeMetadata>('/youtube/generate-metadata', {
      method: 'POST',
      body: JSON.stringify({ clipId }),
    }),

  disconnect: () =>
    apiClient<{ success: boolean }>('/youtube/disconnect', {
      method: 'DELETE',
    }),
};
