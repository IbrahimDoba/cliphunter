// YouTube Account stored in database
export interface YouTubeAccount {
  id: string;
  email: string;
  channelId: string;
  channelTitle?: string;
  accessToken: string;
  refreshToken: string;
  tokenExpiry: number;
  createdAt: Date;
}

// Database record format
export interface YouTubeAccountRecord {
  id: string;
  email: string;
  channel_id: string;
  channel_title: string | null;
  access_token: string;
  refresh_token: string;
  token_expiry: number;
  created_at: number;
}

// Upload options for YouTube
export interface YouTubeUploadOptions {
  title: string;
  description: string;
  privacy: 'public' | 'unlisted' | 'private';
}

// Upload progress callback
export interface YouTubeUploadProgress {
  percentage: number;
  bytesUploaded: number;
  totalBytes: number;
}

// Upload result
export interface YouTubeUploadResult {
  videoId: string;
  videoUrl: string;
  title: string;
}

// API request/response types
export interface YouTubeUploadRequest {
  clipPath: string;
  title: string;
  description: string;
  privacy: 'public' | 'unlisted' | 'private';
}

export interface YouTubeUploadResponse {
  videoId: string;
  videoUrl: string;
  title: string;
}

export interface YouTubeAuthUrlResponse {
  authUrl: string;
}

export interface YouTubeAccountResponse {
  connected: boolean;
  email?: string;
  channelTitle?: string;
}

// Auto-generate metadata
export interface GenerateMetadataRequest {
  videoTitle: string;
  clipNumber: number;
  totalClips: number;
}

export interface GenerateMetadataResponse {
  title: string;
  description: string;
  tags: string[];
}
