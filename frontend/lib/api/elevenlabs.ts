import { apiClient } from './client';

export interface Voice {
  voice_id: string;
  name: string;
}

export const elevenlabsApi = {
  getVoices: () => apiClient<{ voices: Voice[] }>('/elevenlabs/voices'),
};
