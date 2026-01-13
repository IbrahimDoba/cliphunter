import { prisma } from '../db/prisma';
import {
  CompilationStatus as PrismaCompilationStatus,
  NarrationStyle as PrismaNarrationStyle,
  SubtitleStyle as PrismaSubtitleStyle,
  ClipAudioMode as PrismaClipAudioMode,
  Prisma,
} from '@prisma/client';
import {
  Compilation,
  CompilationClip,
  CompilationConfig,
  CompilationProgress,
  ClipAnalysis,
  SelectedClip,
  CompilationScript,
  VoiceoverFile,
  COMPILATION_STATUS,
} from '@/types/compilation';
import { logger } from '../utils/logger';

// Helper to convert objects to Prisma JSON input
function toJson<T>(obj: T): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(obj));
}

export class CompilationService {
  /**
   * Create a new compilation
   */
  async createCompilation(
    userId: string,
    config: CompilationConfig
  ): Promise<Compilation> {
    const compilation = await prisma.compilation.create({
      data: {
        userId,
        jobId: config.jobId,
        targetDuration: config.targetDuration,
        narrationStyle: config.narrationStyle as PrismaNarrationStyle,
        subtitleStyle: config.subtitleStyle as PrismaSubtitleStyle,
        clipAudioMode: config.audioSettings
          .clipAudioMode as PrismaClipAudioMode,
        backgroundMusic: config.audioSettings.backgroundMusic,
        musicVolume: config.audioSettings.musicVolume,
        status: 'CONFIGURING',
        progress: toJson({
          step: 'configuring',
          percentage: 0,
          message: 'Compilation created',
        }),
      },
      include: {
        clips: true,
      },
    });

    logger.info('Compilation created', {
      compilationId: compilation.id,
      userId,
      jobId: config.jobId,
    });

    return this.prismaToCompilation(compilation);
  }

  /**
   * Get compilation by ID
   */
  async getCompilation(compilationId: string): Promise<Compilation | null> {
    const compilation = await prisma.compilation.findUnique({
      where: { id: compilationId },
      include: { clips: { orderBy: { orderIndex: 'asc' } } },
    });

    if (!compilation) {
      return null;
    }

    return this.prismaToCompilation(compilation);
  }

  /**
   * Get compilation by ID for a specific user (authorization check)
   */
  async getCompilationForUser(
    compilationId: string,
    userId: string
  ): Promise<Compilation | null> {
    const compilation = await prisma.compilation.findFirst({
      where: {
        id: compilationId,
        userId,
      },
      include: { clips: { orderBy: { orderIndex: 'asc' } } },
    });

    if (!compilation) {
      return null;
    }

    return this.prismaToCompilation(compilation);
  }

  /**
   * Get all compilations for a user
   */
  async getCompilationsForUser(
    userId: string,
    limit: number = 50
  ): Promise<Compilation[]> {
    const compilations = await prisma.compilation.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: { clips: { orderBy: { orderIndex: 'asc' } } },
    });

    return compilations.map((c) => this.prismaToCompilation(c));
  }

  /**
   * Get all compilations for a job
   */
  async getCompilationsForJob(jobId: string): Promise<Compilation[]> {
    const compilations = await prisma.compilation.findMany({
      where: { jobId },
      orderBy: { createdAt: 'desc' },
      include: { clips: { orderBy: { orderIndex: 'asc' } } },
    });

    return compilations.map((c) => this.prismaToCompilation(c));
  }

  /**
   * Update compilation status
   */
  async updateStatus(
    compilationId: string,
    status: PrismaCompilationStatus,
    progress?: CompilationProgress
  ): Promise<void> {
    const updateData: Prisma.CompilationUpdateInput = {
      status,
    };

    if (progress) {
      updateData.progress = toJson(progress);
    }

    await prisma.compilation.update({
      where: { id: compilationId },
      data: updateData,
    });

    logger.debug('Compilation status updated', {
      compilationId,
      status,
      progress,
    });
  }

  /**
   * Update compilation progress
   */
  async updateProgress(
    compilationId: string,
    progress: CompilationProgress
  ): Promise<void> {
    await prisma.compilation.update({
      where: { id: compilationId },
      data: { progress: toJson(progress) },
    });

    logger.debug('Compilation progress updated', { compilationId, progress });
  }

  /**
   * Save clip analysis results
   */
  async saveClipAnalysis(
    compilationId: string,
    analysis: ClipAnalysis[]
  ): Promise<void> {
    await prisma.compilation.update({
      where: { id: compilationId },
      data: {
        clipAnalysis: toJson(analysis),
        status: 'ANALYZING',
        progress: toJson({
          step: 'analyzing',
          percentage: 100,
          message: 'Clip analysis complete',
        }),
      },
    });

    logger.info('Clip analysis saved', {
      compilationId,
      clipCount: analysis.length,
    });
  }

  /**
   * Save selected clips
   */
  async saveSelectedClips(
    compilationId: string,
    selectedClips: SelectedClip[]
  ): Promise<void> {
    // First, delete any existing compilation clips
    await prisma.compilationClip.deleteMany({
      where: { compilationId },
    });

    // Create new compilation clips
    await prisma.compilationClip.createMany({
      data: selectedClips.map((clip) => ({
        compilationId,
        sourceClipId: clip.clipId,
        segmentStart: clip.segmentStart,
        segmentEnd: clip.segmentEnd,
        orderIndex: clip.orderIndex,
      })),
    });

    // Update compilation with selected clips JSON
    await prisma.compilation.update({
      where: { id: compilationId },
      data: {
        selectedClips: toJson(selectedClips),
      },
    });

    logger.info('Selected clips saved', {
      compilationId,
      clipCount: selectedClips.length,
    });
  }

  /**
   * Save generated script
   */
  async saveScript(
    compilationId: string,
    script: CompilationScript
  ): Promise<void> {
    await prisma.compilation.update({
      where: { id: compilationId },
      data: {
        script: toJson(script),
        status: 'REVIEWING',
        progress: toJson({
          step: 'reviewing',
          percentage: 0,
          message: 'Script ready for review',
        }),
      },
    });

    logger.info('Script saved', { compilationId });
  }

  /**
   * Update clip narrations (from review/edit)
   */
  async updateClipNarrations(
    compilationId: string,
    clipUpdates: Array<{
      sourceClipId: string;
      narrationBefore?: string;
      narrationDuring?: string;
      narrationAfter?: string;
    }>
  ): Promise<void> {
    for (const update of clipUpdates) {
      await prisma.compilationClip.updateMany({
        where: {
          compilationId,
          sourceClipId: update.sourceClipId,
        },
        data: {
          narrationBefore: update.narrationBefore,
          narrationDuring: update.narrationDuring,
          narrationAfter: update.narrationAfter,
        },
      });
    }

    logger.info('Clip narrations updated', {
      compilationId,
      updateCount: clipUpdates.length,
    });
  }

  /**
   * Reorder clips
   */
  async reorderClips(
    compilationId: string,
    clipOrder: Array<{ sourceClipId: string; orderIndex: number }>
  ): Promise<void> {
    for (const { sourceClipId, orderIndex } of clipOrder) {
      await prisma.compilationClip.updateMany({
        where: {
          compilationId,
          sourceClipId,
        },
        data: { orderIndex },
      });
    }

    // Update selectedClips JSON as well
    const compilation = await this.getCompilation(compilationId);
    if (compilation?.selectedClips) {
      const updatedClips = compilation.selectedClips.map((clip) => {
        const newOrder = clipOrder.find((c) => c.sourceClipId === clip.clipId);
        return newOrder ? { ...clip, orderIndex: newOrder.orderIndex } : clip;
      });
      updatedClips.sort((a, b) => a.orderIndex - b.orderIndex);

      await prisma.compilation.update({
        where: { id: compilationId },
        data: { selectedClips: toJson(updatedClips) },
      });
    }

    logger.info('Clips reordered', { compilationId });
  }

  /**
   * Update clip segment (trim)
   */
  async updateClipSegment(
    compilationId: string,
    sourceClipId: string,
    segmentStart: number,
    segmentEnd: number
  ): Promise<void> {
    await prisma.compilationClip.updateMany({
      where: {
        compilationId,
        sourceClipId,
      },
      data: {
        segmentStart,
        segmentEnd,
      },
    });

    // Update selectedClips JSON as well
    const compilation = await this.getCompilation(compilationId);
    if (compilation?.selectedClips) {
      const updatedClips = compilation.selectedClips.map((clip) =>
        clip.clipId === sourceClipId
          ? { ...clip, segmentStart, segmentEnd }
          : clip
      );

      await prisma.compilation.update({
        where: { id: compilationId },
        data: { selectedClips: toJson(updatedClips) },
      });
    }

    logger.info('Clip segment updated', {
      compilationId,
      sourceClipId,
      segmentStart,
      segmentEnd,
    });
  }

  /**
   * Add a clip to the compilation
   */
  async addClip(
    compilationId: string,
    clip: SelectedClip
  ): Promise<void> {
    await prisma.compilationClip.create({
      data: {
        compilationId,
        sourceClipId: clip.clipId,
        segmentStart: clip.segmentStart,
        segmentEnd: clip.segmentEnd,
        orderIndex: clip.orderIndex,
      },
    });

    // Update selectedClips JSON
    const compilation = await this.getCompilation(compilationId);
    const updatedClips = [...(compilation?.selectedClips || []), clip];
    updatedClips.sort((a, b) => a.orderIndex - b.orderIndex);

    await prisma.compilation.update({
      where: { id: compilationId },
      data: { selectedClips: toJson(updatedClips) },
    });

    logger.info('Clip added', { compilationId, clipId: clip.clipId });
  }

  /**
   * Remove a clip from the compilation
   */
  async removeClip(
    compilationId: string,
    sourceClipId: string
  ): Promise<void> {
    await prisma.compilationClip.deleteMany({
      where: {
        compilationId,
        sourceClipId,
      },
    });

    // Update selectedClips JSON
    const compilation = await this.getCompilation(compilationId);
    if (compilation?.selectedClips) {
      const updatedClips = compilation.selectedClips.filter(
        (clip) => clip.clipId !== sourceClipId
      );

      await prisma.compilation.update({
        where: { id: compilationId },
        data: { selectedClips: toJson(updatedClips) },
      });
    }

    logger.info('Clip removed', { compilationId, sourceClipId });
  }

  /**
   * Save voiceover files
   */
  async saveVoiceoverFiles(
    compilationId: string,
    voiceoverFiles: VoiceoverFile[]
  ): Promise<void> {
    await prisma.compilation.update({
      where: { id: compilationId },
      data: {
        voiceoverFiles: toJson(voiceoverFiles),
        status: 'GENERATING_VOICEOVER',
        progress: toJson({
          step: 'generating_voiceover',
          percentage: 100,
          message: 'Voiceover generation complete',
        }),
      },
    });

    logger.info('Voiceover files saved', {
      compilationId,
      fileCount: voiceoverFiles.length,
    });
  }

  /**
   * Complete compilation with output
   */
  async completeCompilation(
    compilationId: string,
    outputPath: string,
    outputUrl: string,
    thumbnailPath?: string
  ): Promise<void> {
    await prisma.compilation.update({
      where: { id: compilationId },
      data: {
        outputPath,
        outputUrl,
        thumbnailPath,
        status: 'COMPLETED',
        progress: toJson({
          step: 'completed',
          percentage: 100,
          message: 'Compilation complete',
        }),
      },
    });

    logger.info('Compilation completed', { compilationId, outputPath });
  }

  /**
   * Fail compilation with error
   */
  async failCompilation(compilationId: string, error: string): Promise<void> {
    await prisma.compilation.update({
      where: { id: compilationId },
      data: {
        error,
        status: 'FAILED',
        progress: toJson({
          step: 'error',
          percentage: 0,
          message: error,
        }),
      },
    });

    logger.error('Compilation failed', { compilationId, error });
  }

  /**
   * Delete a compilation
   */
  async deleteCompilation(compilationId: string): Promise<boolean> {
    try {
      await prisma.compilation.delete({
        where: { id: compilationId },
      });

      logger.info('Compilation deleted', { compilationId });
      return true;
    } catch (error) {
      logger.error('Failed to delete compilation', { compilationId, error });
      return false;
    }
  }

  /**
   * Start analysis phase
   */
  async startAnalysis(compilationId: string): Promise<void> {
    await this.updateStatus(compilationId, 'ANALYZING', {
      step: 'analyzing',
      percentage: 0,
      message: 'Analyzing clips...',
    });
  }

  /**
   * Start script generation phase
   */
  async startScriptGeneration(compilationId: string): Promise<void> {
    await this.updateStatus(compilationId, 'GENERATING_SCRIPT', {
      step: 'generating_script',
      percentage: 0,
      message: 'Generating narration script...',
    });
  }

  /**
   * Start voiceover generation phase
   */
  async startVoiceoverGeneration(compilationId: string): Promise<void> {
    await this.updateStatus(compilationId, 'GENERATING_VOICEOVER', {
      step: 'generating_voiceover',
      percentage: 0,
      message: 'Generating voiceover audio...',
    });
  }

  /**
   * Start rendering phase
   */
  async startRendering(compilationId: string): Promise<void> {
    await this.updateStatus(compilationId, 'RENDERING', {
      step: 'rendering',
      percentage: 0,
      message: 'Rendering final video...',
    });
  }

  /**
   * Convert Prisma compilation to our Compilation interface
   */
  private prismaToCompilation(compilation: any): Compilation {
    return {
      id: compilation.id,
      userId: compilation.userId,
      jobId: compilation.jobId,
      targetDuration: compilation.targetDuration,
      narrationStyle: compilation.narrationStyle,
      subtitleStyle: compilation.subtitleStyle,
      clipAudioMode: compilation.clipAudioMode,
      backgroundMusic: compilation.backgroundMusic,
      musicVolume: compilation.musicVolume,
      status: compilation.status,
      progress: compilation.progress as CompilationProgress | null,
      clipAnalysis: compilation.clipAnalysis as ClipAnalysis[] | null,
      selectedClips: compilation.selectedClips as SelectedClip[] | null,
      script: compilation.script as CompilationScript | null,
      voiceoverFiles: compilation.voiceoverFiles as VoiceoverFile[] | null,
      outputPath: compilation.outputPath,
      outputUrl: compilation.outputUrl,
      thumbnailPath: compilation.thumbnailPath,
      error: compilation.error,
      createdAt: compilation.createdAt,
      updatedAt: compilation.updatedAt,
      clips: (compilation.clips || []).map((clip: any) =>
        this.prismaToCompilationClip(clip)
      ),
    };
  }

  /**
   * Convert Prisma compilation clip to our CompilationClip interface
   */
  private prismaToCompilationClip(clip: any): CompilationClip {
    return {
      id: clip.id,
      compilationId: clip.compilationId,
      sourceClipId: clip.sourceClipId,
      segmentStart: clip.segmentStart,
      segmentEnd: clip.segmentEnd,
      orderIndex: clip.orderIndex,
      analysis: clip.analysis as ClipAnalysis | null,
      engagementScore: clip.engagementScore,
      narrationBefore: clip.narrationBefore,
      narrationDuring: clip.narrationDuring,
      narrationAfter: clip.narrationAfter,
      createdAt: clip.createdAt,
      updatedAt: clip.updatedAt,
    };
  }
}

export const compilationService = new CompilationService();
