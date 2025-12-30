import { exec } from 'child_process';
import { promisify } from 'util';
import { Scene, VideoMetadata } from '@/types/clip';
import { CLIP_CONFIG } from '@/config/constants';
import { logger } from '../utils/logger';
import { getVideoMetadata } from '../utils/ffmpeg';

const execPromise = promisify(exec);

export class VideoService {
  /**
   * Detect scenes in a video using ffmpeg (optimized for speed)
   */
  async detectScenes(videoPath: string, threshold = CLIP_CONFIG.sceneThreshold): Promise<Scene[]> {
    logger.info('Starting scene detection', { videoPath, threshold });

    try {
      // Use ffmpeg to detect scene changes (optimized: analyze every 5th frame)
      const command = [
        'ffmpeg',
        '-i', `"${videoPath}"`,
        '-vf', `select='not(mod(n,5))*gt(scene,${threshold})',showinfo`,
        '-vsync', 'vfr',
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
      const paddingBefore = CLIP_CONFIG.paddingBefore;
      const paddingAfter = CLIP_CONFIG.paddingAfter;

      for (let i = 0; i < timestamps.length - 1; i++) {
        // Add padding before scene to capture lead-up
        let startTime = Math.max(0, timestamps[i] - paddingBefore);
        // Add padding after scene to capture aftermath
        let endTime = Math.min(timestamps[i + 1] + paddingAfter, metadata.duration);

        // Ensure scene duration is within bounds
        const duration = endTime - startTime;
        if (duration < minDuration) {
          // Extend scene to minimum duration (extend end time)
          endTime = Math.min(startTime + minDuration, metadata.duration);
        } else if (duration > maxDuration) {
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
   * Score scenes based on heuristics for finding engaging content
   */
  scoreScenes(scenes: Scene[], duration: number): Scene[] {
    return scenes.map((scene, index) => {
      let score = 0.5; // Base score

      // Prefer scenes from the middle of the video (usually more engaging)
      // Streamers often have highlights in the middle, not intro/outro
      const position = scene.startTime / duration;
      if (position > 0.15 && position < 0.85) {
        score += 0.15;
      }
      // Extra boost for middle third (peak content)
      if (position > 0.3 && position < 0.7) {
        score += 0.1;
      }

      // Prefer scenes with ideal duration (60-75 seconds is usually best)
      const idealDuration = 60;
      const durationDiff = Math.abs(scene.duration - idealDuration);
      const durationScore = Math.max(0, 1 - (durationDiff / idealDuration));
      score += durationScore * 0.25;

      // Slight preference for longer clips (more content)
      if (scene.duration >= 60) {
        score += 0.1;
      }

      return {
        ...scene,
        score: Math.min(score, 1),
      };
    });
  }

  /**
   * Select best scenes for clipping with good spacing
   */
  selectBestScenes(scenes: Scene[], maxClips: number): Scene[] {
    // Sort by score descending
    const sorted = [...scenes].sort((a, b) => b.score - a.score);

    // Select top scenes, ensuring they don't overlap and have minimum spacing
    const selected: Scene[] = [];
    const minSpacing = CLIP_CONFIG.minTimeBetweenClips;

    for (const scene of sorted) {
      if (selected.length >= maxClips) break;

      // Check if scene overlaps or is too close to already selected scenes
      const tooClose = selected.some((s) => {
        // Check for overlap
        const overlaps =
          (scene.startTime >= s.startTime && scene.startTime < s.endTime) ||
          (scene.endTime > s.startTime && scene.endTime <= s.endTime) ||
          (scene.startTime <= s.startTime && scene.endTime >= s.endTime);

        // Check for minimum spacing
        const spacingOk =
          scene.endTime + minSpacing < s.startTime ||
          scene.startTime > s.endTime + minSpacing;

        return overlaps || !spacingOk;
      });

      if (!tooClose) {
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
