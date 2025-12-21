export interface IStorageService {
  /**
   * Save a file to storage
   * @param key - The storage key/path
   * @param filePath - Local file path to upload
   * @returns The URL or path where the file can be accessed
   */
  saveFile(key: string, filePath: string): Promise<string>;

  /**
   * Get the URL for accessing a stored file
   * @param key - The storage key/path
   * @returns The public URL or path
   */
  getFileUrl(key: string): string;

  /**
   * Delete a file from storage
   * @param key - The storage key/path
   */
  deleteFile(key: string): Promise<void>;

  /**
   * Delete multiple files from storage
   * @param keys - Array of storage keys/paths
   */
  deleteFiles(keys: string[]): Promise<void>;

  /**
   * Check if a file exists
   * @param key - The storage key/path
   */
  fileExists(key: string): Promise<boolean>;

  /**
   * Get the local file path (if applicable)
   * @param key - The storage key/path
   */
  getLocalPath(key: string): string;
}
