/**
 * Storage Service Factory
 * Returns appropriate storage service based on environment
 */

import { IStorageService } from './storage.interface';

// Lazy load storage services to avoid import errors in different environments
let storageInstance: IStorageService | null = null;

export function getStorageService(): IStorageService {
  if (storageInstance) {
    return storageInstance;
  }

  // Use Vercel Blob in production, local storage in development
  const isProduction = process.env.NODE_ENV === 'production';
  const hasVercelBlob = !!process.env.BLOB_READ_WRITE_TOKEN;

  if (isProduction && hasVercelBlob) {
    // Production: Use Vercel Blob
    const { storageService } = require('./vercel-blob-storage');
    storageInstance = storageService;
    console.log('Using Vercel Blob Storage');
  } else {
    // Development: Use local storage
    const { storageService } = require('./local-storage');
    storageInstance = storageService;
    console.log('Using Local Storage');
  }

  return storageInstance;
}

// Export as singleton
export const storageService = getStorageService();
