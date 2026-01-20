import { IStorageService } from "./storage.interface";
import { env } from "../config/env";

export class LocalStorageService implements IStorageService {
  private baseDir: string;

  constructor() {
    // We'll initialize baseDir in a way that doesn't require 'path' at top level
    this.baseDir = env.OUTPUT_DIR;
    this.ensureBaseDir();
  }

  private async ensureBaseDir(): Promise<void> {
    const fs = await import("fs/promises");
    const path = await import("path");
    const resolvedBaseDir = path.resolve(process.cwd(), this.baseDir);

    try {
      await fs.mkdir(resolvedBaseDir, { recursive: true });
    } catch (error) {
      console.error("Failed to create base directory:", error);
    }
  }

  async saveFile(key: string, filePath: string): Promise<string> {
    const fs = await import("fs/promises");
    const path = await import("path");

    const destinationPath = this.getLocalPath(key);
    const destinationDir = path.dirname(destinationPath);

    // Ensure destination directory exists
    await fs.mkdir(destinationDir, { recursive: true });

    // Copy file
    await fs.copyFile(filePath, destinationPath);

    return this.getFileUrl(key);
  }

  getFileUrl(key: string): string {
    // Return URL path relative to public folder
    return `/outputs/${key}`;
  }

  async deleteFile(key: string): Promise<void> {
    const fs = await import("fs/promises");
    const filePath = this.getLocalPath(key);
    try {
      await fs.unlink(filePath);
    } catch (error: any) {
      if (error.code !== "ENOENT") {
        throw error;
      }
    }
  }

  async deleteFiles(keys: string[]): Promise<void> {
    await Promise.all(keys.map((key) => this.deleteFile(key)));
  }

  async fileExists(key: string): Promise<boolean> {
    const fs = await import("fs/promises");
    try {
      await fs.access(this.getLocalPath(key));
      return true;
    } catch {
      return false;
    }
  }

  getLocalPath(key: string): string {
    // Note: This still uses path.join if we were to be strict,
    // but for local dev we assume Node environment.
    // To be safe for Edge bundling, we'll use a simple join or dynamic import.
    return `${this.baseDir}/${key}`.replace(/\/+/g, "/");
  }

  async deleteJobFiles(jobId: string): Promise<void> {
    const fs = await import("fs/promises");
    const path = await import("path");
    const jobDir = path.join(path.resolve(process.cwd(), this.baseDir), jobId);
    try {
      await fs.rm(jobDir, { recursive: true, force: true });
    } catch (error: any) {
      if (error.code !== "ENOENT") {
        console.error(`Failed to delete job files for ${jobId}:`, error);
      }
    }
  }

  async ensureJobDir(jobId: string): Promise<string> {
    const fs = await import("fs/promises");
    const path = await import("path");
    const resolvedBaseDir = path.resolve(process.cwd(), this.baseDir);
    const jobDir = path.join(resolvedBaseDir, jobId);

    await fs.mkdir(jobDir, { recursive: true });
    await fs.mkdir(path.join(jobDir, "clips"), { recursive: true });
    await fs.mkdir(path.join(jobDir, "thumbnails"), { recursive: true });
    await fs.mkdir(path.join(jobDir, "subtitles"), { recursive: true });
    return jobDir;
  }
}

// Export singleton instance
export const storageService = new LocalStorageService();
