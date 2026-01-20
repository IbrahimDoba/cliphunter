import { put, del, list } from "@vercel/blob";
import { IStorageService } from "./storage.interface";

/**
 * Vercel Blob Storage Service
 * Upload processed videos/thumbnails to Vercel Blob for persistence
 */
export class VercelBlobStorageService implements IStorageService {
  async saveFile(key: string, filePath: string): Promise<string> {
    // This method is used by the worker (Node.js)
    // We use dynamic imports here to avoid bundling fs/path in Edge runtime
    const fs = await import("fs/promises");
    const path = await import("path");

    try {
      // Read file from local path
      const fileBuffer = await fs.readFile(filePath);

      // Determine content type from extension
      const ext = path.extname(filePath).toLowerCase();
      const contentType = this.getContentType(ext);

      // Upload to Vercel Blob
      const blob = await put(key, fileBuffer, {
        access: "public",
        contentType,
      });

      return blob.url;
    } catch (error) {
      console.error("Failed to upload to Vercel Blob:", error);
      throw error;
    }
  }

  getFileUrl(key: string): string {
    // In production, the URL is stored in the DB or returned by Vercel Blob
    // This is a placeholder for the relative path which the route will handle
    return `/outputs/${key}`;
  }

  async deleteFile(key: string): Promise<void> {
    try {
      await del(key);
    } catch (error) {
      console.error("Failed to delete from Vercel Blob:", error);
    }
  }

  async deleteFiles(keys: string[]): Promise<void> {
    await Promise.all(keys.map((key) => this.deleteFile(key)));
  }

  async fileExists(key: string): Promise<boolean> {
    try {
      const { blobs } = await list({ prefix: key, limit: 1 });
      return blobs.length > 0;
    } catch {
      return false;
    }
  }

  getLocalPath(key: string): string {
    return `/tmp/${key}`;
  }

  async deleteJobFiles(jobId: string): Promise<void> {
    try {
      const { blobs } = await list({ prefix: jobId });
      await Promise.all(blobs.map((blob) => del(blob.url)));
    } catch (error) {
      console.error(`Failed to delete job files for ${jobId}:`, error);
    }
  }

  async ensureJobDir(jobId: string): Promise<string> {
    return `/tmp/${jobId}`;
  }

  private getContentType(ext: string): string {
    const types: Record<string, string> = {
      ".mp4": "video/mp4",
      ".webm": "video/webm",
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".png": "image/png",
      ".gif": "image/gif",
      ".srt": "text/plain",
      ".vtt": "text/vtt",
    };
    return types[ext] || "application/octet-stream";
  }
}

// Export singleton instance
export const storageService = new VercelBlobStorageService();
