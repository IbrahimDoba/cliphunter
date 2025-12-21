import * as fs from 'fs/promises';
import * as path from 'path';
import { env } from '@/config/env';
import { IStorageService } from './storage.interface';

export class LocalStorageService implements IStorageService {
  private baseDir: string;

  constructor() {
    this.baseDir = path.resolve(process.cwd(), env.OUTPUT_DIR);
    this.ensureBaseDir();
  }

  private async ensureBaseDir(): Promise<void> {
    try {
      await fs.mkdir(this.baseDir, { recursive: true });
    } catch (error) {
      console.error('Failed to create base directory:', error);
    }
  }

  async saveFile(key: string, filePath: string): Promise<string> {
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
    const filePath = this.getLocalPath(key);
    try {
      await fs.unlink(filePath);
    } catch (error: any) {
      if (error.code !== 'ENOENT') {
        throw error;
      }
      // File doesn't exist, ignore
    }
  }

  async deleteFiles(keys: string[]): Promise<void> {
    await Promise.all(keys.map((key) => this.deleteFile(key)));
  }

  async fileExists(key: string): Promise<boolean> {
    try {
      await fs.access(this.getLocalPath(key));
      return true;
    } catch {
      return false;
    }
  }

  getLocalPath(key: string): string {
    return path.join(this.baseDir, key);
  }

  /**
   * Delete all files for a specific job
   */
  async deleteJobFiles(jobId: string): Promise<void> {
    const jobDir = path.join(this.baseDir, jobId);
    try {
      await fs.rm(jobDir, { recursive: true, force: true });
    } catch (error: any) {
      if (error.code !== 'ENOENT') {
        console.error(`Failed to delete job files for ${jobId}:`, error);
      }
    }
  }

  /**
   * Ensure job directory exists
   */
  async ensureJobDir(jobId: string): Promise<string> {
    const jobDir = path.join(this.baseDir, jobId);
    await fs.mkdir(jobDir, { recursive: true });
    await fs.mkdir(path.join(jobDir, 'clips'), { recursive: true });
    await fs.mkdir(path.join(jobDir, 'thumbnails'), { recursive: true });
    await fs.mkdir(path.join(jobDir, 'subtitles'), { recursive: true });
    return jobDir;
  }
}

// Export singleton instance
export const storageService = new LocalStorageService();
