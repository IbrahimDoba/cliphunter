import { exec } from 'child_process';
import { promisify } from 'util';
import { Scene, VideoMetadata } from '@/types/clip';
import { CLIP_CONFIG } from '@/config/constants';
import { logger } from '../utils/logger';
import { getVideoMetadata } from '../utils/ffmpeg';

const execPromise = promisify(exec);

export class VideoService {
  /**
   * Detect scenes in a video using ffmpeg
   */
  async detectScenes(videoPath: string, threshold = CLIP_CONFIG.sceneThreshold): Promise<Scene[]> {
    logger.info('Starting scene detection', { videoPath, threshold });

    try {
      // Use ffmpeg to detect scene changes
      const command = [
        'ffmpeg',
        '-i', `"${videoPath}"`,
        '-vf', `select='gt(scene,${threshold})',showinfo`,
        '-f', 'null',
        '-',
        '2>&1',
      ].join(' ');

      const { stdout, stderr } = await execPromise(command, {
        maxBuffer: 50 * 1024 * 1024,
      });

      // Parse scene change timestamps from ffmpeg output
      const output = stdout + stderr;
      const sceneMatches = output.matchAll(/pts_time:(\d+\.?\d*)/g);
      const timestamps: number[] = [];

      for (const match of sceneMatches) {
        timestamps.push(parseFloat(match[1]));
      }

      // Get video metadata
      const metadata = await getVideoMetadata(videoPath);

      // Convert timestamps to scenes with duration
      const scenes: Scene[] = [];
      const minDuration = CLIP_CONFIG.minDuration;
      const maxDuration = CLIP_CONFIG.maxDuration;

      for (let i = 0; i < timestamps.length - 1; i++) {
        const startTime = timestamps[i];
        let endTime = timestamps[i + 1];

        // Ensure scene duration is within bounds
        if (endTime - startTime < minDuration) {
          // Extend scene to minimum duration
          endTime = Math.min(startTime + minDuration, metadata.duration);
        } else if (endTime - startTime > maxDuration) {
          // Cap scene to maximum duration
          endTime = startTime + maxDuration;
        }

        scenes.push({
          startTime,
          endTime,
          duration: endTime - startTime,
          score: 0.5, // Base score, will be enhanced later
        });
      }

      logger.info('Scene detection completed', { sceneCount: scenes.length });

      return scenes;
    } catch (error: any) {
      logger.error('Scene detection failed', { error: error.message, videoPath });
      throw new Error(`Scene detection failed: ${error.message}`);
    }
  }

  /**
   * Score scenes based on heuristics
   */
  scoreScenes(scenes: Scene[], duration: number): Scene[] {
    // Simple heuristic scoring for MVP
    return scenes.map((scene, index) => {
      let score = 0.5; // Base score

      // Prefer scenes from the middle of the video (usually more engaging)
      const position = scene.startTime / duration;
      if (position > 0.2 && position < 0.8) {
        score += 0.2;
      }

      // Prefer scenes with ideal duration
      const durationScore = Math.min(
        scene.duration / CLIP_CONFIG.defaultDuration,
        1
      );
      score += durationScore * 0.3;

      return {
        ...scene,
        score: Math.min(score, 1),
      };
    });
  }

  /**
   * Select best scenes for clipping
   */
  selectBestScenes(scenes: Scene[], maxClips: number): Scene[] {
    // Sort by score descending
    const sorted = [...scenes].sort((a, b) => b.score - a.score);

    // Select top scenes, ensuring they don't overlap
    const selected: Scene[] = [];

    for (const scene of sorted) {
      if (selected.length >= maxClips) break;

      // Check if scene overlaps with already selected scenes
      const overlaps = selected.some(
        (s) =>
          (scene.startTime >= s.startTime && scene.startTime < s.endTime) ||
          (scene.endTime > s.startTime && scene.endTime <= s.endTime)
      );

      if (!overlaps) {
        selected.push(scene);
      }
    }

    // Sort selected scenes by start time
    return selected.sort((a, b) => a.startTime - b.startTime);
  }

  /**
   * Get video metadata
   */
  async getMetadata(videoPath: string): Promise<VideoMetadata> {
    return getVideoMetadata(videoPath);
  }

  /**
   * Analyze video and return best scenes
   */
  async analyzeVideo(videoPath: string, maxClips: number): Promise<Scene[]> {
    logger.info('Analyzing video', { videoPath, maxClips });

    // Get metadata
    const metadata = await this.getMetadata(videoPath);

    // Detect scenes
    let scenes = await this.detectScenes(videoPath);

    // If no scenes detected or too few, create fallback scenes
    if (scenes.length < maxClips) {
      logger.warn('Not enough scenes detected, creating fallback scenes');
      scenes = this.createFallbackScenes(metadata.duration, maxClips);
    }

    // Score scenes
    scenes = this.scoreScenes(scenes, metadata.duration);

    // Select best scenes
    const bestScenes = this.selectBestScenes(scenes, maxClips);

    logger.info('Video analysis completed', { selectedScenes: bestScenes.length });

    return bestScenes;
  }

  /**
   * Create fallback scenes if detection fails
   */
  private createFallbackScenes(duration: number, count: number): Scene[] {
    const scenes: Scene[] = [];
    const clipDuration = CLIP_CONFIG.defaultDuration;
    const step = Math.max(duration / (count + 1), clipDuration);

    for (let i = 0; i < count; i++) {
      const startTime = Math.min((i + 1) * step, duration - clipDuration);
      const endTime = Math.min(startTime + clipDuration, duration);

      scenes.push({
        startTime,
        endTime,
        duration: endTime - startTime,
        score: 0.3, // Lower score for fallback scenes
      });
    }

    return scenes;
  }
}

export const videoService = new VideoService();
