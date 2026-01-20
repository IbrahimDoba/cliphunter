/**
 * Storage Service Factory
 * Returns appropriate storage service based on environment
 */

import { IStorageService } from "./storage.interface";

// Lazy load storage services to avoid import errors in different environments
let storageInstance: IStorageService | null = null;

// Use Vercel Blob in production, local storage in development
const isProduction = process.env.NODE_ENV === "production";
const hasVercelBlob = !!process.env.BLOB_READ_WRITE_TOKEN;

export async function getStorageService(): Promise<IStorageService> {
  if (storageInstance) {
    return storageInstance;
  }

  if (isProduction && hasVercelBlob) {
    // Production: Use Vercel Blob
    const { storageService } = await import("./vercel-blob-storage");
    storageInstance = storageService;
    console.log("Using Vercel Blob Storage");
  } else {
    // Development: Use local storage
    const { storageService } = await import("./local-storage");
    storageInstance = storageService;
    console.log("Using Local Storage");
  }

  if (!storageInstance) {
    throw new Error("Failed to initialize storage service");
  }

  return storageInstance;
}

// Export a getter for the singleton
export const getStorage = () => {
  if (!storageInstance) {
    throw new Error(
      "Storage service not initialized. Call getStorageService() first."
    );
  }
  return storageInstance;
};
