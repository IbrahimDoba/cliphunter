import { geminiService } from './gemini.service';
import { compilationService } from './compilation.service';
import { jobService } from './job.service';
import { elevenLabsService, SpeechWithTimestamps, WordTiming } from './elevenlabs.service';
import { env } from '../config/env';
import { logger } from '../utils/logger';
import {
  ClipAnalysis,
  SelectedClip,
  CompilationScript,
  VoiceoverFile,
  NarrationStyle,
  SubtitleStyle,
  ClipAudioMode,
} from '../shared/types/compilation';
import { ClipInfo } from '../shared/types/job';
import * as path from 'path';
import * as fs from 'fs';
import { ffmpeg, formatTime, generateThumbnail } from '../utils/ffmpeg';
import { VIDEO_CONFIG } from '../config/constants';

// Narration style prompts for script generation
const NARRATION_STYLE_PROMPTS: Record<NarrationStyle, string> = {
  COMMENTARY: `You are an energetic content commentator. Use excited reactions, emphatic language, and engaging delivery.
Examples: "OH MY GOD, did you see that?!", "This is absolutely INSANE!", "No way, NO WAY!"
Tone: High energy, reactive, enthusiastic, use exclamations`,

  DOCUMENTARY: `You are a professional documentary narrator. Use informative, measured, and authoritative language.
Examples: "In this pivotal moment...", "What follows would change everything...", "The evidence suggests..."
Tone: Calm, professional, informative, builds tension subtly`,

  CASUAL: `You are a friendly content creator talking to your audience. Use conversational, relatable language.
Examples: "So basically what happened here is...", "Okay, you gotta see this...", "I mean, look at this..."
Tone: Relaxed, friendly, like talking to a friend`,

  DRAMATIC: `You are a cinematic storyteller. Use dramatic, suspenseful, and evocative language.
Examples: "No one could have predicted...", "The silence before the storm...", "In that moment, time stood still..."
Tone: Cinematic, suspenseful, emotionally charged, poetic`,

  HUMOROUS: `You are a witty entertainer. Use clever observations, mild sarcasm, and entertaining commentary.
Examples: "And that's when things went completely off the rails, as they do...", "Plot twist: nobody saw that coming. Nobody."
Tone: Witty, playful, self-aware, entertaining`,
};

export class CompilationProcessorService {
  /**
   * Process clip analysis for a compilation
   * Analyzes each clip from the job and scores them
   */
  async analyzeClips(compilationId: string): Promise<ClipAnalysis[]> {
    logger.info('Starting clip analysis', { compilationId });

    const compilation = await compilationService.getCompilation(compilationId);
    if (!compilation) {
      throw new Error('Compilation not found');
    }

    const job = await jobService.getJob(compilation.jobId);
    if (!job || !job.result?.clips) {
      throw new Error('Job not found or has no clips');
    }

    const analyses: ClipAnalysis[] = [];
    const totalClips = job.result.clips.length;

    for (let i = 0; i < totalClips; i++) {
      const clip = job.result.clips[i];

      // Update progress
      await compilationService.updateProgress(compilationId, {
        step: 'analyzing',
        percentage: Math.round(((i + 1) / totalClips) * 100),
        message: `Analyzing clip ${i + 1} of ${totalClips}...`,
      });

      try {
        const analysis = await this.analyzeIndividualClip(clip, compilation.jobId);
        analyses.push(analysis);
      } catch (error: any) {
        logger.error('Failed to analyze clip', {
          clipId: clip.id,
          error: error.message,
        });

        // Create a basic analysis for failed clips
        analyses.push({
          clipId: clip.id,
          description: clip.title || 'Unknown clip',
          emotionalTone: 'neutral',
          keyMoments: [],
          notableQuotes: [],
          engagementScore: 5,
          bestSegment: {
            start: 0,
            end: Math.min(clip.duration, 15),
            reason: 'Default segment (analysis failed)',
          },
        });
      }
    }

    // Save analysis results
    await compilationService.saveClipAnalysis(compilationId, analyses);

    logger.info('Clip analysis completed', {
      compilationId,
      clipCount: analyses.length,
    });

    return analyses;
  }

  /**
   * Analyze an individual clip using Gemini
   */
  private async analyzeIndividualClip(
    clip: ClipInfo,
    jobId: string
  ): Promise<ClipAnalysis> {
    logger.info('Analyzing individual clip', { clipId: clip.id });

    // Get the clip video path
    const clipPath = path.join(
      process.cwd(),
      env.OUTPUT_DIR,
      jobId,
      'clips',
      `${clip.id}.mp4`
    );

    // Check if clip file exists
    if (!fs.existsSync(clipPath)) {
      logger.warn('Clip file not found, using metadata only', { clipPath });
      return this.createBasicAnalysis(clip);
    }

    try {
      const ai = geminiService['getClient']();

      // Upload the clip for analysis
      const uploadedFile = await ai.files.upload({
        file: clipPath,
        config: { mimeType: 'video/mp4' },
      });

      // Wait for processing
      let fileState = uploadedFile.state;
      let attempts = 0;
      while (fileState === 'PROCESSING' && attempts < 30) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
        const fileInfo = await ai.files.get({ name: uploadedFile.name! });
        fileState = fileInfo.state;
        attempts++;
      }

      if (fileState !== 'ACTIVE') {
        throw new Error(`File processing failed: ${fileState}`);
      }

      // Analyze the clip
      const prompt = `Analyze this video clip and provide a detailed assessment for creating a compilation video.

Return ONLY a valid JSON object (no markdown, no code blocks) with this structure:
{
  "description": "A 1-2 sentence description of what happens in the clip",
  "emotionalTone": "One of: exciting, funny, tense, surprising, emotional, informative, satisfying, neutral",
  "keyMoments": [
    {"timestamp": <seconds from start>, "description": "What happens at this moment"}
  ],
  "notableQuotes": ["Any memorable quotes or dialogue from the clip"],
  "engagementScore": <1-10 rating of how engaging/viral-worthy this clip is>,
  "bestSegment": {
    "start": <best starting point in seconds>,
    "end": <best ending point in seconds>,
    "reason": "Why this is the best segment"
  }
}

Consider:
- Visual interest and action
- Audio peaks (reactions, music, dialogue)
- Emotional impact
- Pacing and flow
- Hook potential (strong opening)
- Satisfying or surprising ending`;

      const response = await ai.models.generateContent({
        model: env.GEMINI_MODEL || 'gemini-2.5-flash',
        contents: [
          {
            role: 'user',
            parts: [
              { fileData: { fileUri: uploadedFile.uri!, mimeType: uploadedFile.mimeType! } },
              { text: prompt },
            ],
          },
        ],
      });

      // Clean up uploaded file
      try {
        await ai.files.delete({ name: uploadedFile.name! });
      } catch (e) {
        logger.warn('Failed to delete file after analysis', e);
      }

      // Parse response
      const text = response.text?.trim() || '';
      const analysis = this.parseClipAnalysis(text, clip.id, clip.duration);

      return analysis;
    } catch (error: any) {
      logger.error('Gemini clip analysis failed', {
        clipId: clip.id,
        error: error.message,
      });
      return this.createBasicAnalysis(clip);
    }
  }

  /**
   * Create a basic analysis when Gemini analysis fails
   */
  private createBasicAnalysis(clip: ClipInfo): ClipAnalysis {
    return {
      clipId: clip.id,
      description: clip.title || 'Video clip',
      emotionalTone: 'neutral',
      keyMoments: [
        {
          timestamp: 0,
          description: 'Clip start',
        },
      ],
      notableQuotes: [],
      engagementScore: clip.score || 5,
      bestSegment: {
        start: 0,
        end: Math.min(clip.duration, 15),
        reason: 'Default segment selection',
      },
    };
  }

  /**
   * Parse clip analysis from Gemini response
   */
  private parseClipAnalysis(
    text: string,
    clipId: string,
    clipDuration: number
  ): ClipAnalysis {
    try {
      let cleaned = text.trim();

      // Remove markdown code blocks if present
      if (cleaned.startsWith('```')) {
        cleaned = cleaned
          .replace(/```json?\n?/g, '')
          .replace(/```\n?/g, '')
          .trim();
      }

      // Find JSON object
      const jsonStart = cleaned.indexOf('{');
      const jsonEnd = cleaned.lastIndexOf('}');

      if (jsonStart === -1 || jsonEnd === -1) {
        throw new Error('No JSON object found');
      }

      cleaned = cleaned.substring(jsonStart, jsonEnd + 1);
      const parsed = JSON.parse(cleaned);

      // Validate and normalize the response
      return {
        clipId,
        description: parsed.description || 'Video clip',
        emotionalTone: parsed.emotionalTone || 'neutral',
        keyMoments: Array.isArray(parsed.keyMoments) ? parsed.keyMoments : [],
        notableQuotes: Array.isArray(parsed.notableQuotes)
          ? parsed.notableQuotes
          : [],
        engagementScore: Math.min(
          10,
          Math.max(1, parsed.engagementScore || 5)
        ),
        bestSegment: {
          start: Math.max(0, parsed.bestSegment?.start || 0),
          end: Math.min(
            clipDuration,
            parsed.bestSegment?.end || Math.min(clipDuration, 15)
          ),
          reason: parsed.bestSegment?.reason || 'AI selected segment',
        },
      };
    } catch (error: any) {
      logger.error('Failed to parse clip analysis', {
        error: error.message,
        text: text.slice(0, 500),
      });

      // Return basic analysis on parse failure
      return {
        clipId,
        description: 'Video clip',
        emotionalTone: 'neutral',
        keyMoments: [],
        notableQuotes: [],
        engagementScore: 5,
        bestSegment: {
          start: 0,
          end: Math.min(clipDuration, 15),
          reason: 'Default segment (parse failed)',
        },
      };
    }
  }

  /**
   * Curate clips based on analysis and target duration
   * Selects the best segments and orders them for narrative flow
   */
  async curateClips(compilationId: string): Promise<SelectedClip[]> {
    logger.info('Starting clip curation', { compilationId });

    const compilation = await compilationService.getCompilation(compilationId);
    if (!compilation) {
      throw new Error('Compilation not found');
    }

    if (!compilation.clipAnalysis?.length) {
      throw new Error('No clip analysis available');
    }

    const targetDuration = compilation.targetDuration;
    const analyses = compilation.clipAnalysis;

    // Sort by engagement score (highest first)
    const sortedAnalyses = [...analyses].sort(
      (a, b) => b.engagementScore - a.engagementScore
    );

    const selectedClips: SelectedClip[] = [];
    let currentDuration = 0;

    // Reserve time for intro/outro narration (~10 seconds)
    const narrationReserve = 10;
    const availableDuration = targetDuration - narrationReserve;

    // Select clips until we reach target duration
    for (const analysis of sortedAnalyses) {
      const segmentDuration =
        analysis.bestSegment.end - analysis.bestSegment.start;

      // Check if adding this clip would exceed target
      if (currentDuration + segmentDuration > availableDuration) {
        // Try to fit a shorter segment if possible
        const remainingTime = availableDuration - currentDuration;
        if (remainingTime >= 5) {
          // At least 5 seconds needed
          selectedClips.push({
            clipId: analysis.clipId,
            segmentStart: analysis.bestSegment.start,
            segmentEnd: analysis.bestSegment.start + remainingTime,
            orderIndex: selectedClips.length,
            purpose: this.determinePurpose(
              selectedClips.length,
              selectedClips.length + 1,
              analysis.emotionalTone
            ),
          });
        }
        break;
      }

      selectedClips.push({
        clipId: analysis.clipId,
        segmentStart: analysis.bestSegment.start,
        segmentEnd: analysis.bestSegment.end,
        orderIndex: selectedClips.length,
        purpose: this.determinePurpose(
          selectedClips.length,
          sortedAnalyses.length,
          analysis.emotionalTone
        ),
      });

      currentDuration += segmentDuration;

      // Stop if we have enough clips
      if (currentDuration >= availableDuration * 0.9) {
        break;
      }
    }

    // Reorder for narrative flow (if we have enough clips)
    if (selectedClips.length >= 3) {
      this.reorderForNarrative(selectedClips, analyses);
    }

    // Save selected clips
    await compilationService.saveSelectedClips(compilationId, selectedClips);

    logger.info('Clip curation completed', {
      compilationId,
      selectedCount: selectedClips.length,
      totalDuration: currentDuration,
    });

    return selectedClips;
  }

  /**
   * Determine the purpose of a clip based on its position
   */
  private determinePurpose(
    index: number,
    totalClips: number,
    emotionalTone: string
  ): string {
    if (index === 0) {
      return 'opening_hook';
    } else if (index === totalClips - 1) {
      return 'conclusion';
    } else if (emotionalTone === 'exciting' || emotionalTone === 'surprising') {
      return 'climax';
    } else if (emotionalTone === 'funny') {
      return 'comic_relief';
    } else {
      return 'build_up';
    }
  }

  /**
   * Reorder clips for better narrative flow
   */
  private reorderForNarrative(
    clips: SelectedClip[],
    analyses: ClipAnalysis[]
  ): void {
    // Find clips by emotional tone
    const getAnalysis = (clipId: string) =>
      analyses.find((a) => a.clipId === clipId);

    // Sort strategy:
    // 1. Start with a hook (high engagement or exciting)
    // 2. Build tension in the middle
    // 3. End with payoff (surprising, satisfying, or funny)

    const findBestForRole = (
      tones: string[],
      exclude: string[]
    ): SelectedClip | undefined => {
      return clips.find((clip) => {
        if (exclude.includes(clip.clipId)) return false;
        const analysis = getAnalysis(clip.clipId);
        return analysis && tones.includes(analysis.emotionalTone);
      });
    };

    const usedIds: string[] = [];

    // Best opening hook
    const opening =
      findBestForRole(['exciting', 'surprising', 'funny'], usedIds) || clips[0];
    usedIds.push(opening.clipId);

    // Best conclusion
    const conclusion =
      findBestForRole(['satisfying', 'surprising', 'emotional'], usedIds) ||
      clips[clips.length - 1];
    if (conclusion.clipId !== opening.clipId) {
      usedIds.push(conclusion.clipId);
    }

    // Remaining clips go in the middle
    const middle = clips.filter((c) => !usedIds.includes(c.clipId));

    // Rebuild order
    const reordered = [opening, ...middle];
    if (conclusion.clipId !== opening.clipId) {
      reordered.push(conclusion);
    }

    // Update order indices
    reordered.forEach((clip, index) => {
      clip.orderIndex = index;
    });

    // Copy reordered back to original array
    clips.length = 0;
    clips.push(...reordered);
  }

  /**
   * Generate narration script for the compilation
   */
  async generateScript(compilationId: string): Promise<CompilationScript> {
    logger.info('Starting script generation', { compilationId });

    const compilation = await compilationService.getCompilation(compilationId);
    if (!compilation) {
      throw new Error('Compilation not found');
    }

    if (!compilation.selectedClips?.length) {
      throw new Error('No clips selected');
    }

    if (!compilation.clipAnalysis?.length) {
      throw new Error('No clip analysis available');
    }

    await compilationService.updateProgress(compilationId, {
      step: 'generating_script',
      percentage: 10,
      message: 'Generating narration script...',
    });

    const style = compilation.narrationStyle;
    const stylePrompt = NARRATION_STYLE_PROMPTS[style];

    // Get job info for context
    const job = await jobService.getJob(compilation.jobId);
    const videoTitle = job?.result?.videoTitle || 'Video';

    // Build context for script generation
    const clipContext = compilation.selectedClips.map((clip) => {
      const analysis = compilation.clipAnalysis?.find(
        (a) => a.clipId === clip.clipId
      );
      return {
        clipId: clip.clipId,
        duration: clip.segmentEnd - clip.segmentStart,
        purpose: clip.purpose,
        description: analysis?.description || 'Video clip',
        emotionalTone: analysis?.emotionalTone || 'neutral',
        notableQuotes: analysis?.notableQuotes || [],
      };
    });

    try {
      const ai = geminiService['getClient']();

      const prompt = `${stylePrompt}

Generate a narration script for a ${compilation.targetDuration}-second video compilation from "${videoTitle}".

The compilation has ${clipContext.length} clips in this order:
${clipContext
  .map(
    (c, i) => `
Clip ${i + 1} (${c.duration.toFixed(1)}s, ${c.purpose}):
- Description: ${c.description}
- Emotional tone: ${c.emotionalTone}
${c.notableQuotes.length > 0 ? `- Notable quotes: "${c.notableQuotes.join('", "')}"` : ''}
`
  )
  .join('\n')}

Generate a narration script that:
1. Has a compelling 2-3 sentence INTRO (10-15 seconds when spoken) that hooks viewers
2. Has brief transitions between clips (1-2 sentences each, optional - only where natural)
3. Has a memorable 1-2 sentence OUTRO that wraps up the story

IMPORTANT RULES:
- The intro should create curiosity without spoiling what happens
- NOT every clip needs narration - let some clips speak for themselves
- Use "narration_before" for setup/context BEFORE a clip plays
- Use "narration_during" ONLY for clips where commentary over the action is appropriate
- Use "narration_after" sparingly - only for reactions or transitions
- Keep narration punchy and match the ${style.toLowerCase()} style
- Total narration should be ~30% of the video length (for ${compilation.targetDuration}s, aim for ${Math.round(compilation.targetDuration * 0.3)}s of narration)

Return ONLY a valid JSON object (no markdown, no code blocks):
{
  "intro": {"text": "Opening narration text here"},
  "segments": [
    {
      "clipId": "${clipContext[0]?.clipId || 'clip_id'}",
      "narration_before": {"text": "Optional setup text"} or null,
      "narration_during": {"text": "Optional commentary during clip"} or null,
      "narration_after": {"text": "Optional reaction/transition"} or null
    }
  ],
  "outro": {"text": "Closing narration text here"}
}`;

      const response = await ai.models.generateContent({
        model: env.GEMINI_MODEL || 'gemini-2.5-flash',
        contents: prompt,
      });

      const text = response.text?.trim() || '';
      const script = this.parseScriptResponse(
        text,
        compilation.selectedClips,
        compilation.clipAnalysis
      );

      await compilationService.updateProgress(compilationId, {
        step: 'generating_script',
        percentage: 100,
        message: 'Script generated successfully',
      });

      // Save the script
      await compilationService.saveScript(compilationId, script);

      logger.info('Script generation completed', { compilationId });

      return script;
    } catch (error: any) {
      logger.error('Script generation failed', {
        compilationId,
        error: error.message,
      });

      // Generate a fallback script
      const fallbackScript = this.generateFallbackScript(
        compilation.selectedClips,
        compilation.clipAnalysis,
        style
      );

      await compilationService.saveScript(compilationId, fallbackScript);

      return fallbackScript;
    }
  }

  /**
   * Parse script response from Gemini
   */
  private parseScriptResponse(
    text: string,
    selectedClips: SelectedClip[],
    clipAnalyses: ClipAnalysis[]
  ): CompilationScript {
    try {
      let cleaned = text.trim();

      // Remove markdown code blocks
      if (cleaned.startsWith('```')) {
        cleaned = cleaned
          .replace(/```json?\n?/g, '')
          .replace(/```\n?/g, '')
          .trim();
      }

      // Find JSON object
      const jsonStart = cleaned.indexOf('{');
      const jsonEnd = cleaned.lastIndexOf('}');

      if (jsonStart === -1 || jsonEnd === -1) {
        throw new Error('No JSON object found');
      }

      cleaned = cleaned.substring(jsonStart, jsonEnd + 1);
      const parsed = JSON.parse(cleaned);

      // Build the script structure
      const script: CompilationScript = {
        intro: { text: parsed.intro?.text || 'Check out these amazing moments.' },
        segments: [],
        outro: { text: parsed.outro?.text || 'Thanks for watching!' },
        totalEstimatedDuration: 0,
      };

      // Process segments
      for (const clip of selectedClips) {
        const parsedSegment = parsed.segments?.find(
          (s: any) => s.clipId === clip.clipId
        );

        script.segments.push({
          clipId: clip.clipId,
          clipStart: clip.segmentStart,
          clipEnd: clip.segmentEnd,
          narrationBefore: parsedSegment?.narration_before?.text
            ? { text: parsedSegment.narration_before.text }
            : undefined,
          narrationDuring: parsedSegment?.narration_during?.text
            ? { text: parsedSegment.narration_during.text }
            : undefined,
          narrationAfter: parsedSegment?.narration_after?.text
            ? { text: parsedSegment.narration_after.text }
            : undefined,
        });
      }

      // Calculate estimated duration
      script.totalEstimatedDuration = this.estimateScriptDuration(script);

      return script;
    } catch (error: any) {
      logger.error('Failed to parse script response', {
        error: error.message,
        text: text.slice(0, 500),
      });

      // Return a basic fallback script
      return this.generateFallbackScript(
        selectedClips,
        clipAnalyses,
        'COMMENTARY'
      );
    }
  }

  /**
   * Generate a fallback script when Gemini fails
   */
  private generateFallbackScript(
    selectedClips: SelectedClip[],
    clipAnalyses: ClipAnalysis[],
    style: NarrationStyle
  ): CompilationScript {
    const introTexts: Record<NarrationStyle, string> = {
      COMMENTARY:
        "You won't BELIEVE what you're about to see. These moments are absolutely insane!",
      DOCUMENTARY:
        'What follows is a collection of remarkable moments that demand attention.',
      CASUAL:
        "Okay, so I put together some of the wildest clips and you've gotta see this.",
      DRAMATIC:
        'Some moments define us. Some moments change everything. These are those moments.',
      HUMOROUS:
        "Buckle up, because things are about to get weird. And by weird, I mean incredibly entertaining.",
    };

    const outroTexts: Record<NarrationStyle, string> = {
      COMMENTARY:
        'If that blew your mind, make sure to like and subscribe for more!',
      DOCUMENTARY:
        'And so concludes this remarkable collection of moments.',
      CASUAL: 'Anyway, that was pretty wild, right? See you in the next one!',
      DRAMATIC: 'And in the end, these moments remind us why we watch.',
      HUMOROUS:
        "And that's all folks! My therapist says I need to stop watching these clips, but here we are.",
    };

    const script: CompilationScript = {
      intro: { text: introTexts[style] },
      segments: selectedClips.map((clip) => ({
        clipId: clip.clipId,
        clipStart: clip.segmentStart,
        clipEnd: clip.segmentEnd,
        narrationBefore: undefined,
        narrationDuring: undefined,
        narrationAfter: undefined,
      })),
      outro: { text: outroTexts[style] },
      totalEstimatedDuration: 0,
    };

    script.totalEstimatedDuration = this.estimateScriptDuration(script);

    return script;
  }

  /**
   * Estimate total duration of a script (narration + clips)
   */
  private estimateScriptDuration(script: CompilationScript): number {
    const wordsPerSecond = 2.5;
    let duration = 0;

    // Intro duration
    if (script.intro.text) {
      duration += script.intro.text.split(/\s+/).length / wordsPerSecond;
    }

    // Segments
    for (const segment of script.segments) {
      // Clip duration
      duration += segment.clipEnd - segment.clipStart;

      // Narration durations (before and after add to total, during overlaps)
      if (segment.narrationBefore?.text) {
        duration +=
          segment.narrationBefore.text.split(/\s+/).length / wordsPerSecond;
      }
      if (segment.narrationAfter?.text) {
        duration +=
          segment.narrationAfter.text.split(/\s+/).length / wordsPerSecond;
      }
    }

    // Outro duration
    if (script.outro.text) {
      duration += script.outro.text.split(/\s+/).length / wordsPerSecond;
    }

    return Math.round(duration);
  }

  /**
   * Generate voiceovers for all narration segments
   */
  async generateVoiceovers(compilationId: string): Promise<VoiceoverFile[]> {
    logger.info('Starting voiceover generation', { compilationId });

    const compilation = await compilationService.getCompilation(compilationId);
    if (!compilation) {
      throw new Error('Compilation not found');
    }

    if (!compilation.script) {
      throw new Error('No script available');
    }

    // Check if ElevenLabs is configured
    if (!elevenLabsService.isConfigured()) {
      throw new Error('ElevenLabs API not configured');
    }

    const script = compilation.script;
    const voiceoverFiles: VoiceoverFile[] = [];

    // Create output directory for voiceovers
    const voiceoverDir = path.join(
      process.cwd(),
      env.OUTPUT_DIR,
      compilation.jobId,
      'compilations',
      compilationId,
      'voiceovers'
    );

    if (!fs.existsSync(voiceoverDir)) {
      fs.mkdirSync(voiceoverDir, { recursive: true });
    }

    // Count total segments for progress
    let totalSegments = 0;
    if (script.intro.text) totalSegments++;
    if (script.outro.text) totalSegments++;
    for (const segment of script.segments) {
      if (segment.narrationBefore?.text) totalSegments++;
      if (segment.narrationDuring?.text) totalSegments++;
      if (segment.narrationAfter?.text) totalSegments++;
    }

    let completedSegments = 0;

    // Generate intro voiceover
    if (script.intro.text) {
      await compilationService.updateProgress(compilationId, {
        step: 'generating_voiceover',
        percentage: Math.round((completedSegments / totalSegments) * 100),
        message: 'Generating intro voiceover...',
      });

      const result = await this.generateSegmentVoiceover(
        script.intro.text,
        'intro',
        voiceoverDir
      );

      voiceoverFiles.push({
        segmentId: 'intro',
        filePath: result.audioPath,
        duration: result.duration,
        wordTimings: result.wordTimings,
      });

      completedSegments++;
    }

    // Generate segment voiceovers
    for (let i = 0; i < script.segments.length; i++) {
      const segment = script.segments[i];

      // Narration before clip
      if (segment.narrationBefore?.text) {
        await compilationService.updateProgress(compilationId, {
          step: 'generating_voiceover',
          percentage: Math.round((completedSegments / totalSegments) * 100),
          message: `Generating narration for clip ${i + 1}...`,
        });

        const result = await this.generateSegmentVoiceover(
          segment.narrationBefore.text,
          `clip_${i}_before`,
          voiceoverDir
        );

        voiceoverFiles.push({
          segmentId: `clip_${i}_before`,
          filePath: result.audioPath,
          duration: result.duration,
          wordTimings: result.wordTimings,
        });

        completedSegments++;
      }

      // Narration during clip
      if (segment.narrationDuring?.text) {
        await compilationService.updateProgress(compilationId, {
          step: 'generating_voiceover',
          percentage: Math.round((completedSegments / totalSegments) * 100),
          message: `Generating commentary for clip ${i + 1}...`,
        });

        const result = await this.generateSegmentVoiceover(
          segment.narrationDuring.text,
          `clip_${i}_during`,
          voiceoverDir
        );

        voiceoverFiles.push({
          segmentId: `clip_${i}_during`,
          filePath: result.audioPath,
          duration: result.duration,
          wordTimings: result.wordTimings,
        });

        completedSegments++;
      }

      // Narration after clip
      if (segment.narrationAfter?.text) {
        await compilationService.updateProgress(compilationId, {
          step: 'generating_voiceover',
          percentage: Math.round((completedSegments / totalSegments) * 100),
          message: `Generating transition for clip ${i + 1}...`,
        });

        const result = await this.generateSegmentVoiceover(
          segment.narrationAfter.text,
          `clip_${i}_after`,
          voiceoverDir
        );

        voiceoverFiles.push({
          segmentId: `clip_${i}_after`,
          filePath: result.audioPath,
          duration: result.duration,
          wordTimings: result.wordTimings,
        });

        completedSegments++;
      }
    }

    // Generate outro voiceover
    if (script.outro.text) {
      await compilationService.updateProgress(compilationId, {
        step: 'generating_voiceover',
        percentage: Math.round((completedSegments / totalSegments) * 100),
        message: 'Generating outro voiceover...',
      });

      const result = await this.generateSegmentVoiceover(
        script.outro.text,
        'outro',
        voiceoverDir
      );

      voiceoverFiles.push({
        segmentId: 'outro',
        filePath: result.audioPath,
        duration: result.duration,
        wordTimings: result.wordTimings,
      });

      completedSegments++;
    }

    // Save voiceover files metadata
    await compilationService.saveVoiceoverFiles(compilationId, voiceoverFiles);

    logger.info('Voiceover generation completed', {
      compilationId,
      fileCount: voiceoverFiles.length,
    });

    return voiceoverFiles;
  }

  /**
   * Generate voiceover for a single segment
   */
  private async generateSegmentVoiceover(
    text: string,
    segmentId: string,
    outputDir: string
  ): Promise<SpeechWithTimestamps> {
    const outputPath = path.join(outputDir, `${segmentId}.mp3`);

    try {
      const result = await elevenLabsService.generateSpeechWithTimestamps(
        text,
        outputPath
      );

      return result;
    } catch (error: any) {
      logger.error('Failed to generate segment voiceover', {
        segmentId,
        error: error.message,
      });

      // Return a placeholder for failed segments
      return {
        audioPath: '',
        duration: text.split(/\s+/).length / 2.5,
        wordTimings: text.split(/\s+/).map((word, i) => ({
          word,
          start: i * 0.4,
          end: (i + 1) * 0.4,
        })),
      };
    }
  }

  /**
   * Run the full analysis and script generation pipeline
   */
  async processCompilation(compilationId: string): Promise<void> {
    logger.info('Starting full compilation processing', { compilationId });

    try {
      // Phase 2: Analyze clips
      await this.analyzeClips(compilationId);

      // Phase 2: Curate clips
      await this.curateClips(compilationId);

      // Phase 3: Generate script
      await this.generateScript(compilationId);

      logger.info('Compilation processing completed', { compilationId });
    } catch (error: any) {
      logger.error('Compilation processing failed', {
        compilationId,
        error: error.message,
      });

      await compilationService.failCompilation(compilationId, error.message);
      throw error;
    }
  }

  /**
   * Run the full render pipeline (voiceover + video assembly)
   */
  async renderCompilation(
    compilationId: string,
    clipSubtitles: Record<string, boolean> = {}
  ): Promise<string> {
    logger.info('Starting compilation render', { compilationId, clipSubtitles });

    try {
      // Phase 4: Generate voiceovers
      await this.generateVoiceovers(compilationId);

      // Phase 4.5: Generate clip transcriptions for subtitles
      const clipTranscriptions = await this.transcribeClips(compilationId, clipSubtitles);

      // Phase 5: Assemble video
      const outputPath = await this.assembleVideo(compilationId, clipSubtitles, clipTranscriptions);

      logger.info('Compilation render completed', { compilationId, outputPath });

      return outputPath;
    } catch (error: any) {
      logger.error('Compilation render failed', {
        compilationId,
        error: error.message,
      });

      await compilationService.failCompilation(compilationId, error.message);
      throw error;
    }
  }

  /**
   * Transcribe clips that have subtitles enabled
   */
  async transcribeClips(
    compilationId: string,
    clipSubtitles: Record<string, boolean>
  ): Promise<Record<string, WordTiming[]>> {
    const clipsToTranscribe = Object.entries(clipSubtitles)
      .filter(([_, enabled]) => enabled)
      .map(([clipId]) => clipId);

    if (clipsToTranscribe.length === 0) {
      return {};
    }

    logger.info('Transcribing clips for subtitles', {
      compilationId,
      clipCount: clipsToTranscribe.length,
    });

    const compilation = await compilationService.getCompilation(compilationId);
    if (!compilation) {
      throw new Error('Compilation not found');
    }

    const clipsDir = path.join(process.cwd(), env.OUTPUT_DIR, compilation.jobId, 'clips');
    const transcriptions: Record<string, WordTiming[]> = {};

    for (let i = 0; i < clipsToTranscribe.length; i++) {
      const clipId = clipsToTranscribe[i];
      const clipPath = path.join(clipsDir, `${clipId}.mp4`);

      await compilationService.updateProgress(compilationId, {
        step: 'generating_voiceover',
        percentage: 50 + Math.round((i / clipsToTranscribe.length) * 30),
        message: `Transcribing clip ${i + 1} of ${clipsToTranscribe.length}...`,
      });

      try {
        const wordTimings = await this.transcribeClipAudio(clipPath, clipId);
        transcriptions[clipId] = wordTimings;
      } catch (error: any) {
        logger.warn('Failed to transcribe clip, skipping subtitles', {
          clipId,
          error: error.message,
        });
        transcriptions[clipId] = [];
      }
    }

    return transcriptions;
  }

  /**
   * Transcribe a single clip's audio using Gemini
   */
  private async transcribeClipAudio(clipPath: string, clipId: string): Promise<WordTiming[]> {
    if (!fs.existsSync(clipPath)) {
      logger.warn('Clip file not found for transcription', { clipPath });
      return [];
    }

    try {
      const ai = geminiService['getClient']();

      // Upload the clip for transcription
      const uploadedFile = await ai.files.upload({
        file: clipPath,
        config: { mimeType: 'video/mp4' },
      });

      // Wait for processing
      let fileState = uploadedFile.state;
      let attempts = 0;
      while (fileState === 'PROCESSING' && attempts < 30) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
        const fileInfo = await ai.files.get({ name: uploadedFile.name! });
        fileState = fileInfo.state;
        attempts++;
      }

      if (fileState !== 'ACTIVE') {
        throw new Error(`File processing failed: ${fileState}`);
      }

      // Transcribe the clip
      const prompt = `Transcribe all spoken words in this video clip with precise timing.

Return ONLY a valid JSON array (no markdown, no code blocks) with this structure:
[
  {"word": "word1", "start": 0.0, "end": 0.3},
  {"word": "word2", "start": 0.35, "end": 0.6}
]

Rules:
- Include EVERY spoken word
- Times are in seconds from the start of the clip
- Be precise with start/end times (to 0.01 second accuracy)
- Include punctuation as part of words where natural (e.g., "Hello," or "Wait!")
- If there is no speech, return an empty array: []`;

      const response = await ai.models.generateContent({
        model: env.GEMINI_MODEL || 'gemini-2.5-flash',
        contents: [
          {
            role: 'user',
            parts: [
              { fileData: { fileUri: uploadedFile.uri!, mimeType: uploadedFile.mimeType! } },
              { text: prompt },
            ],
          },
        ],
      });

      // Clean up uploaded file
      try {
        await ai.files.delete({ name: uploadedFile.name! });
      } catch (e) {
        logger.warn('Failed to delete file after transcription', e);
      }

      // Parse response
      const text = response.text?.trim() || '[]';
      return this.parseTranscriptionResponse(text);
    } catch (error: any) {
      logger.error('Clip transcription failed', {
        clipId,
        error: error.message,
      });
      return [];
    }
  }

  /**
   * Parse transcription response from Gemini
   */
  private parseTranscriptionResponse(text: string): WordTiming[] {
    try {
      let cleaned = text.trim();

      // Remove markdown code blocks
      if (cleaned.startsWith('```')) {
        cleaned = cleaned
          .replace(/```json?\n?/g, '')
          .replace(/```\n?/g, '')
          .trim();
      }

      // Find JSON array
      const jsonStart = cleaned.indexOf('[');
      const jsonEnd = cleaned.lastIndexOf(']');

      if (jsonStart === -1 || jsonEnd === -1) {
        return [];
      }

      cleaned = cleaned.substring(jsonStart, jsonEnd + 1);
      const parsed = JSON.parse(cleaned);

      if (!Array.isArray(parsed)) {
        return [];
      }

      return parsed
        .filter((item: any) => item.word && typeof item.start === 'number' && typeof item.end === 'number')
        .map((item: any) => ({
          word: String(item.word),
          start: Number(item.start),
          end: Number(item.end),
        }));
    } catch (error: any) {
      logger.error('Failed to parse transcription', { error: error.message, text: text.slice(0, 200) });
      return [];
    }
  }

  /**
   * Phase 5: Assemble the final compilation video
   * Combines clips with voiceovers and subtitles
   */
  async assembleVideo(
    compilationId: string,
    clipSubtitles: Record<string, boolean> = {},
    clipTranscriptions: Record<string, WordTiming[]> = {}
  ): Promise<string> {
    logger.info('Starting video assembly', { compilationId, hasTranscriptions: Object.keys(clipTranscriptions).length > 0 });

    const compilation = await compilationService.getCompilation(compilationId);
    if (!compilation) {
      throw new Error('Compilation not found');
    }

    if (!compilation.script || !compilation.selectedClips || !compilation.voiceoverFiles) {
      throw new Error('Missing required data for video assembly');
    }

    const job = await jobService.getJob(compilation.jobId);
    if (!job?.result?.clips) {
      throw new Error('Job clips not found');
    }

    // Setup directories
    const outputDir = path.join(
      process.cwd(),
      env.OUTPUT_DIR,
      compilation.jobId,
      'compilations',
      compilationId
    );
    const tempDir = path.join(outputDir, 'temp');
    const clipsDir = path.join(process.cwd(), env.OUTPUT_DIR, compilation.jobId, 'clips');

    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    const script = compilation.script;
    const voiceoverFiles = compilation.voiceoverFiles;
    const clipAudioMode = compilation.clipAudioMode as ClipAudioMode;
    const subtitleStyle = compilation.subtitleStyle as SubtitleStyle;

    // Get voiceover by segment ID
    const getVoiceover = (segmentId: string): VoiceoverFile | undefined =>
      voiceoverFiles.find((v) => v.segmentId === segmentId);

    // Track all segment files for concatenation
    const segmentFiles: string[] = [];
    let totalSegments = 0;

    // Count total segments for progress
    if (script.intro.text) totalSegments++;
    for (const segment of script.segments) {
      if (segment.narrationBefore?.text) totalSegments++;
      totalSegments++; // The clip itself
      if (segment.narrationAfter?.text) totalSegments++;
    }
    if (script.outro.text) totalSegments++;

    let completedSegments = 0;

    try {
      // 1. Create intro segment (blurred frame + voiceover + subtitles)
      if (script.intro.text) {
        await compilationService.updateProgress(compilationId, {
          step: 'rendering',
          percentage: Math.round((completedSegments / totalSegments) * 80) + 10,
          message: 'Creating intro segment...',
        });

        const introVoiceover = getVoiceover('intro');
        if (introVoiceover?.filePath && fs.existsSync(introVoiceover.filePath)) {
          // Get first clip's first frame for background
          const firstClipId = script.segments[0]?.clipId;
          const firstClipPath = path.join(clipsDir, `${firstClipId}.mp4`);

          const introPath = path.join(tempDir, 'segment_000_intro.mp4');
          await this.createNarrationSegment(
            firstClipPath,
            introVoiceover,
            introPath,
            subtitleStyle,
            'start'
          );
          segmentFiles.push(introPath);
        }
        completedSegments++;
      }

      // 2. Process each clip segment
      for (let i = 0; i < script.segments.length; i++) {
        const segment = script.segments[i];
        const clipPath = path.join(clipsDir, `${segment.clipId}.mp4`);

        if (!fs.existsSync(clipPath)) {
          logger.warn('Clip file not found, skipping', { clipPath });
          continue;
        }

        // 2a. Narration before clip (blurred frame + voiceover)
        if (segment.narrationBefore?.text) {
          await compilationService.updateProgress(compilationId, {
            step: 'rendering',
            percentage: Math.round((completedSegments / totalSegments) * 80) + 10,
            message: `Creating narration before clip ${i + 1}...`,
          });

          const beforeVoiceover = getVoiceover(`clip_${i}_before`);
          if (beforeVoiceover?.filePath && fs.existsSync(beforeVoiceover.filePath)) {
            const beforePath = path.join(tempDir, `segment_${String(segmentFiles.length).padStart(3, '0')}_before.mp4`);
            await this.createNarrationSegment(
              clipPath,
              beforeVoiceover,
              beforePath,
              subtitleStyle,
              'start'
            );
            segmentFiles.push(beforePath);
          }
          completedSegments++;
        }

        // 2b. The clip segment itself
        await compilationService.updateProgress(compilationId, {
          step: 'rendering',
          percentage: Math.round((completedSegments / totalSegments) * 80) + 10,
          message: `Processing clip ${i + 1} of ${script.segments.length}...`,
        });

        const duringVoiceover = segment.narrationDuring?.text
          ? getVoiceover(`clip_${i}_during`)
          : undefined;

        // Get clip transcription for subtitles if enabled
        const clipTranscription = clipSubtitles[segment.clipId]
          ? clipTranscriptions[segment.clipId]
          : undefined;

        const clipSegmentPath = path.join(tempDir, `segment_${String(segmentFiles.length).padStart(3, '0')}_clip.mp4`);
        await this.processClipSegment(
          clipPath,
          segment.clipStart,
          segment.clipEnd,
          clipSegmentPath,
          clipAudioMode,
          duringVoiceover,
          subtitleStyle,
          clipTranscription
        );
        segmentFiles.push(clipSegmentPath);
        completedSegments++;

        // 2c. Narration after clip (blurred frame + voiceover)
        if (segment.narrationAfter?.text) {
          await compilationService.updateProgress(compilationId, {
            step: 'rendering',
            percentage: Math.round((completedSegments / totalSegments) * 80) + 10,
            message: `Creating narration after clip ${i + 1}...`,
          });

          const afterVoiceover = getVoiceover(`clip_${i}_after`);
          if (afterVoiceover?.filePath && fs.existsSync(afterVoiceover.filePath)) {
            const afterPath = path.join(tempDir, `segment_${String(segmentFiles.length).padStart(3, '0')}_after.mp4`);
            await this.createNarrationSegment(
              clipPath,
              afterVoiceover,
              afterPath,
              subtitleStyle,
              'end'
            );
            segmentFiles.push(afterPath);
          }
          completedSegments++;
        }
      }

      // 3. Create outro segment (blurred frame + voiceover + subtitles)
      if (script.outro.text) {
        await compilationService.updateProgress(compilationId, {
          step: 'rendering',
          percentage: Math.round((completedSegments / totalSegments) * 80) + 10,
          message: 'Creating outro segment...',
        });

        const outroVoiceover = getVoiceover('outro');
        if (outroVoiceover?.filePath && fs.existsSync(outroVoiceover.filePath)) {
          // Get last clip's last frame for background
          const lastClipId = script.segments[script.segments.length - 1]?.clipId;
          const lastClipPath = path.join(clipsDir, `${lastClipId}.mp4`);

          const outroPath = path.join(tempDir, `segment_${String(segmentFiles.length).padStart(3, '0')}_outro.mp4`);
          await this.createNarrationSegment(
            lastClipPath,
            outroVoiceover,
            outroPath,
            subtitleStyle,
            'end'
          );
          segmentFiles.push(outroPath);
        }
        completedSegments++;
      }

      // 4. Concatenate all segments
      await compilationService.updateProgress(compilationId, {
        step: 'rendering',
        percentage: 90,
        message: 'Concatenating all segments...',
      });

      const outputPath = path.join(outputDir, 'compilation.mp4');
      await this.concatenateSegments(segmentFiles, outputPath);

      // 5. Generate thumbnail
      const thumbnailPath = path.join(outputDir, 'thumbnail.jpg');
      await generateThumbnail(outputPath, thumbnailPath, 2);

      // 6. Complete compilation
      // Build relative URL for serving the video
      const outputUrl = `/api/jobs/${compilation.jobId}/compilations/${compilationId}/video`;
      await compilationService.completeCompilation(compilationId, outputPath, outputUrl, thumbnailPath);

      await compilationService.updateProgress(compilationId, {
        step: 'completed',
        percentage: 100,
        message: 'Compilation completed successfully!',
      });

      // 7. Cleanup temp files
      for (const file of segmentFiles) {
        try {
          if (fs.existsSync(file)) fs.unlinkSync(file);
        } catch (e) {
          logger.warn('Failed to cleanup temp file', { file });
        }
      }

      // Clean up temp directory
      try {
        fs.rmdirSync(tempDir, { recursive: true });
      } catch (e) {
        logger.warn('Failed to cleanup temp directory', { tempDir });
      }

      logger.info('Video assembly completed', { compilationId, outputPath });

      return outputPath;
    } catch (error: any) {
      logger.error('Video assembly failed', {
        compilationId,
        error: error.message,
        stack: error.stack,
      });

      // Cleanup on error
      for (const file of segmentFiles) {
        try {
          if (fs.existsSync(file)) fs.unlinkSync(file);
        } catch (e) {
          // Ignore cleanup errors
        }
      }

      throw error;
    }
  }

  /**
   * Create a narration segment with blurred background + voiceover + subtitles
   */
  private async createNarrationSegment(
    sourceClipPath: string,
    voiceover: VoiceoverFile,
    outputPath: string,
    subtitleStyle: SubtitleStyle,
    framePosition: 'start' | 'end'
  ): Promise<void> {
    const tempDir = path.dirname(outputPath);
    const segmentId = path.basename(outputPath, '.mp4');
    const framePath = path.join(tempDir, `${segmentId}_frame.png`);
    const blurredPath = path.join(tempDir, `${segmentId}_blurred.png`);

    try {
      // 1. Extract frame from source clip
      const seekTime = framePosition === 'start' ? 0.5 : -1; // -1 means end of video

      await new Promise<void>((resolve, reject) => {
        let cmd = ffmpeg(sourceClipPath);

        if (framePosition === 'end') {
          // Seek to near the end
          const metadata = ffmpeg.ffprobe(sourceClipPath, (err, data) => {
            if (err) {
              reject(err);
              return;
            }
            const duration = data.format.duration || 5;
            ffmpeg(sourceClipPath)
              .seekInput(Math.max(0, duration - 1))
              .frames(1)
              .output(framePath)
              .on('end', () => resolve())
              .on('error', reject)
              .run();
          });
        } else {
          ffmpeg(sourceClipPath)
            .seekInput(seekTime)
            .frames(1)
            .output(framePath)
            .on('end', () => resolve())
            .on('error', reject)
            .run();
        }
      });

      // Wait for frame extraction to complete for 'end' position
      if (framePosition === 'end') {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }

      // 2. Apply blur effect
      await new Promise<void>((resolve, reject) => {
        ffmpeg(framePath)
          .videoFilters('gblur=sigma=40')
          .output(blurredPath)
          .on('end', () => resolve())
          .on('error', reject)
          .run();
      });

      // 3. Build subtitle filters
      const subtitleFilters = this.buildWordTimingSubtitles(
        voiceover.wordTimings,
        subtitleStyle
      );

      // 4. Create video segment: blurred image + voiceover audio + subtitles
      await new Promise<void>((resolve, reject) => {
        const filterString = subtitleFilters.length > 0 ? subtitleFilters.join(',') : 'null';

        ffmpeg()
          .input(blurredPath)
          .inputOptions(['-loop 1'])
          .input(voiceover.filePath)
          .outputOptions([
            '-c:v libx264',
            '-preset ultrafast',
            '-tune stillimage',
            '-c:a aac',
            '-b:a 192k',
            '-pix_fmt yuv420p',
            '-shortest',
            '-r 30',
          ])
          .videoFilters(filterString)
          .output(outputPath)
          .on('end', () => resolve())
          .on('error', (err, stdout, stderr) => {
            logger.error('Narration segment creation failed', {
              error: err.message,
              stderr,
            });
            reject(err);
          })
          .run();
      });

      // Cleanup temp files
      try {
        if (fs.existsSync(framePath)) fs.unlinkSync(framePath);
        if (fs.existsSync(blurredPath)) fs.unlinkSync(blurredPath);
      } catch (e) {
        // Ignore cleanup errors
      }

      logger.info('Narration segment created', { outputPath });
    } catch (error: any) {
      // Cleanup on error
      try {
        if (fs.existsSync(framePath)) fs.unlinkSync(framePath);
        if (fs.existsSync(blurredPath)) fs.unlinkSync(blurredPath);
      } catch (e) {
        // Ignore
      }
      throw error;
    }
  }

  /**
   * Process a clip segment with optional voiceover overlay and transcription subtitles
   */
  private async processClipSegment(
    clipPath: string,
    startTime: number,
    endTime: number,
    outputPath: string,
    audioMode: ClipAudioMode,
    duringVoiceover?: VoiceoverFile,
    subtitleStyle?: SubtitleStyle,
    clipTranscription?: WordTiming[]
  ): Promise<void> {
    const duration = endTime - startTime;
    const qualityPreset = VIDEO_CONFIG.qualityPresets['medium'];

    // Adjust transcription timings relative to segment start
    const adjustedTranscription = clipTranscription
      ? clipTranscription
          .filter((t) => t.start >= startTime && t.end <= endTime)
          .map((t) => ({
            word: t.word,
            start: t.start - startTime,
            end: t.end - startTime,
          }))
      : [];

    const hasVoiceover = duringVoiceover?.filePath && fs.existsSync(duringVoiceover.filePath);
    const hasTranscription = adjustedTranscription.length > 0;

    if (!hasVoiceover && !hasTranscription) {
      // No voiceover and no transcription - just extract the segment
      await new Promise<void>((resolve, reject) => {
        ffmpeg(clipPath)
          .setStartTime(formatTime(startTime))
          .setDuration(duration)
          .videoCodec('libx264')
          .videoBitrate(qualityPreset.videoBitrate)
          .audioCodec('aac')
          .audioBitrate(qualityPreset.audioBitrate)
          .outputOptions([
            `-preset ${qualityPreset.preset}`,
            '-movflags +faststart',
          ])
          .output(outputPath)
          .on('end', () => resolve())
          .on('error', reject)
          .run();
      });
    } else if (!hasVoiceover && hasTranscription) {
      // Has transcription but no voiceover - add subtitles to clip audio
      const subtitleFilters = this.buildClipSubtitles(adjustedTranscription, subtitleStyle || 'WORD_BY_WORD_HIGHLIGHT');
      const videoFilter = subtitleFilters.length > 0 ? subtitleFilters.join(',') : 'null';

      await new Promise<void>((resolve, reject) => {
        ffmpeg(clipPath)
          .setStartTime(formatTime(startTime))
          .setDuration(duration)
          .videoFilters(videoFilter)
          .videoCodec('libx264')
          .videoBitrate(qualityPreset.videoBitrate)
          .audioCodec('aac')
          .audioBitrate(qualityPreset.audioBitrate)
          .outputOptions([
            `-preset ${qualityPreset.preset}`,
            '-movflags +faststart',
          ])
          .output(outputPath)
          .on('end', () => resolve())
          .on('error', (err, stdout, stderr) => {
            logger.error('Clip segment with subtitles failed', {
              error: err.message,
              stderr,
            });
            reject(err);
          })
          .run();
      });
    } else {
      // Has voiceover during clip - mix audio and add subtitles
      // Combine voiceover subtitles with clip transcription subtitles
      let subtitleFilters: string[] = [];

      if (subtitleStyle && duringVoiceover?.wordTimings) {
        subtitleFilters = this.buildWordTimingSubtitles(duringVoiceover.wordTimings, subtitleStyle);
      }

      // Add clip transcription subtitles at bottom of screen (different position)
      if (hasTranscription) {
        const transcriptionFilters = this.buildClipSubtitles(adjustedTranscription, subtitleStyle || 'WORD_BY_WORD_HIGHLIGHT');
        subtitleFilters = [...subtitleFilters, ...transcriptionFilters];
      }

      await new Promise<void>((resolve, reject) => {
        let audioFilter: string;

        switch (audioMode) {
          case 'MUTED':
            // Mute clip audio completely, use only voiceover
            audioFilter = '[1:a]volume=1.5[aout]';
            break;
          case 'DUCKED':
            // Duck clip audio when voiceover plays
            audioFilter =
              '[0:a]volume=0.3[clip];[1:a]volume=1.5[vo];[clip][vo]amix=inputs=2:duration=first:dropout_transition=2[aout]';
            break;
          case 'FULL':
          default:
            // Mix both at similar levels
            audioFilter =
              '[0:a]volume=0.8[clip];[1:a]volume=1.2[vo];[clip][vo]amix=inputs=2:duration=first[aout]';
            break;
        }

        const videoFilter =
          subtitleFilters.length > 0 ? subtitleFilters.join(',') : 'null';

        ffmpeg(clipPath)
          .setStartTime(formatTime(startTime))
          .setDuration(duration)
          .input(duringVoiceover!.filePath)
          .complexFilter([audioFilter, `[0:v]${videoFilter}[vout]`])
          .outputOptions([
            '-map [vout]',
            '-map [aout]',
            '-c:v libx264',
            `-preset ${qualityPreset.preset}`,
            `-b:v ${qualityPreset.videoBitrate}`,
            '-c:a aac',
            `-b:a ${qualityPreset.audioBitrate}`,
            '-movflags +faststart',
          ])
          .output(outputPath)
          .on('end', () => resolve())
          .on('error', (err, stdout, stderr) => {
            logger.error('Clip segment processing failed', {
              error: err.message,
              stderr,
            });
            reject(err);
          })
          .run();
      });
    }

    logger.info('Clip segment processed', { outputPath, duration, hasSubtitles: hasTranscription });
  }

  /**
   * Build subtitle filters for clip transcription (positioned at bottom)
   */
  private buildClipSubtitles(wordTimings: WordTiming[], style: SubtitleStyle): string[] {
    if (!wordTimings || wordTimings.length === 0) {
      return [];
    }

    const filters: string[] = [];

    // Group words into phrases for better readability
    const phrases = this.groupWordsIntoPhrases(wordTimings, 5);

    for (const phrase of phrases) {
      const phraseText = phrase.words.map((w) => w.word).join(' ');
      const escaped = this.escapeTextForFFmpeg(phraseText);

      // Use bold, centered text at the bottom of the screen
      filters.push(
        `drawtext=text='${escaped}':` +
          `fontfile='C\\:/Windows/Fonts/impact.ttf':` +
          `fontsize=80:` +
          `fontcolor=white:` +
          `borderw=6:` +
          `bordercolor=black:` +
          `shadowcolor=black@0.6:` +
          `shadowx=4:` +
          `shadowy=4:` +
          `x=(w-text_w)/2:` +
          `y=h-150:` +
          `enable='between(t,${phrase.start.toFixed(2)},${phrase.end.toFixed(2)})'`
      );
    }

    return filters;
  }

  /**
   * Concatenate all segment files into final output
   */
  private async concatenateSegments(
    segmentFiles: string[],
    outputPath: string
  ): Promise<void> {
    if (segmentFiles.length === 0) {
      throw new Error('No segments to concatenate');
    }

    if (segmentFiles.length === 1) {
      // Just copy the single file
      fs.copyFileSync(segmentFiles[0], outputPath);
      return;
    }

    const concatListPath = path.join(path.dirname(outputPath), 'concat_list.txt');
    const qualityPreset = VIDEO_CONFIG.qualityPresets['medium'];

    // Create concat file list with forward slashes for FFmpeg
    const concatContent = segmentFiles
      .map((file) => `file '${file.replace(/\\/g, '/')}'`)
      .join('\n');
    fs.writeFileSync(concatListPath, concatContent);

    logger.info('Concatenating segments', {
      segmentCount: segmentFiles.length,
      concatContent,
    });

    try {
      await new Promise<void>((resolve, reject) => {
        ffmpeg()
          .input(concatListPath)
          .inputOptions(['-f concat', '-safe 0'])
          .outputOptions([
            '-c:v libx264',
            `-preset ${qualityPreset.preset}`,
            `-b:v ${qualityPreset.videoBitrate}`,
            '-c:a aac',
            `-b:a ${qualityPreset.audioBitrate}`,
            '-movflags +faststart',
          ])
          .output(outputPath)
          .on('end', () => resolve())
          .on('error', (err, stdout, stderr) => {
            logger.error('Concatenation failed', {
              error: err.message,
              stderr,
            });
            reject(err);
          })
          .run();
      });

      logger.info('Segments concatenated successfully', { outputPath });
    } finally {
      // Cleanup concat list file
      try {
        fs.unlinkSync(concatListPath);
      } catch (e) {
        // Ignore
      }
    }
  }

  /**
   * Build subtitle filters for word-by-word timing
   */
  private buildWordTimingSubtitles(
    wordTimings: WordTiming[],
    style: SubtitleStyle
  ): string[] {
    if (!wordTimings || wordTimings.length === 0) {
      return [];
    }

    const filters: string[] = [];

    switch (style) {
      case 'WORD_BY_WORD_HIGHLIGHT':
        // Each word appears with colored highlight
        for (const timing of wordTimings) {
          const escaped = this.escapeTextForFFmpeg(timing.word);
          filters.push(
            `drawtext=text='${escaped}':` +
              `fontfile='C\\:/Windows/Fonts/impact.ttf':` +
              `fontsize=72:` +
              `fontcolor=yellow:` +
              `borderw=6:` +
              `bordercolor=black:` +
              `shadowcolor=black@0.5:` +
              `shadowx=3:` +
              `shadowy=3:` +
              `x=(w-text_w)/2:` +
              `y=(h-text_h)/2:` +
              `enable='between(t,${timing.start.toFixed(2)},${timing.end.toFixed(2)})'`
          );
        }
        break;

      case 'KARAOKE':
        // Words highlight in sequence, showing full phrase
        // Group words into phrases of 3-4 words
        const phrases = this.groupWordsIntoPhrases(wordTimings, 4);
        for (const phrase of phrases) {
          const phraseText = phrase.words.map((w) => w.word).join(' ');
          const escaped = this.escapeTextForFFmpeg(phraseText);
          filters.push(
            `drawtext=text='${escaped}':` +
              `fontfile='C\\:/Windows/Fonts/impact.ttf':` +
              `fontsize=64:` +
              `fontcolor=white:` +
              `borderw=5:` +
              `bordercolor=black:` +
              `x=(w-text_w)/2:` +
              `y=(h-text_h)/2:` +
              `enable='between(t,${phrase.start.toFixed(2)},${phrase.end.toFixed(2)})'`
          );
        }
        break;

      case 'SENTENCE_POP':
        // Full sentences with pop animation
        const sentences = this.groupWordsIntoPhrases(wordTimings, 8);
        for (const sentence of sentences) {
          const sentenceText = sentence.words.map((w) => w.word).join(' ');
          const escaped = this.escapeTextForFFmpeg(sentenceText);
          filters.push(
            `drawtext=text='${escaped}':` +
              `fontfile='C\\:/Windows/Fonts/impact.ttf':` +
              `fontsize=56:` +
              `fontcolor=white:` +
              `borderw=4:` +
              `bordercolor=black:` +
              `x=(w-text_w)/2:` +
              `y=(h-text_h)/2:` +
              `enable='between(t,${sentence.start.toFixed(2)},${sentence.end.toFixed(2)})'`
          );
        }
        break;

      case 'MINIMAL':
        // Simple white text, grouped into phrases
        const minPhrases = this.groupWordsIntoPhrases(wordTimings, 5);
        for (const phrase of minPhrases) {
          const phraseText = phrase.words.map((w) => w.word).join(' ');
          const escaped = this.escapeTextForFFmpeg(phraseText);
          filters.push(
            `drawtext=text='${escaped}':` +
              `fontfile='C\\:/Windows/Fonts/arial.ttf':` +
              `fontsize=48:` +
              `fontcolor=white:` +
              `x=(w-text_w)/2:` +
              `y=h-200:` +
              `enable='between(t,${phrase.start.toFixed(2)},${phrase.end.toFixed(2)})'`
          );
        }
        break;

      case 'BOLD_KEYWORDS':
      default:
        // Show all words, highlight important ones
        for (const timing of wordTimings) {
          const escaped = this.escapeTextForFFmpeg(timing.word);
          const isKeyword = timing.word.length > 4; // Simple heuristic for keywords
          filters.push(
            `drawtext=text='${escaped}':` +
              `fontfile='C\\:/Windows/Fonts/impact.ttf':` +
              `fontsize=${isKeyword ? 76 : 68}:` +
              `fontcolor=${isKeyword ? 'yellow' : 'white'}:` +
              `borderw=${isKeyword ? 6 : 5}:` +
              `bordercolor=black:` +
              `x=(w-text_w)/2:` +
              `y=(h-text_h)/2:` +
              `enable='between(t,${timing.start.toFixed(2)},${timing.end.toFixed(2)})'`
          );
        }
        break;
    }

    return filters;
  }

  /**
   * Group word timings into phrases
   */
  private groupWordsIntoPhrases(
    wordTimings: WordTiming[],
    maxWordsPerPhrase: number
  ): Array<{ words: WordTiming[]; start: number; end: number }> {
    const phrases: Array<{ words: WordTiming[]; start: number; end: number }> = [];
    let currentPhrase: WordTiming[] = [];

    for (let i = 0; i < wordTimings.length; i++) {
      currentPhrase.push(wordTimings[i]);

      if (currentPhrase.length >= maxWordsPerPhrase || i === wordTimings.length - 1) {
        phrases.push({
          words: [...currentPhrase],
          start: currentPhrase[0].start,
          end: currentPhrase[currentPhrase.length - 1].end,
        });
        currentPhrase = [];
      }
    }

    return phrases;
  }

  /**
   * Escape text for FFmpeg drawtext filter
   */
  private escapeTextForFFmpeg(text: string): string {
    return text
      .replace(/\\/g, '\\\\\\\\')
      .replace(/'/g, "'\\\\\\''")
      .replace(/:/g, '\\:')
      .replace(/%/g, '\\%')
      .replace(/\n/g, '')
      .trim();
  }
}

export const compilationProcessorService = new CompilationProcessorService();
