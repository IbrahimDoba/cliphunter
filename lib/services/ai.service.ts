import OpenAI from 'openai';
import * as fs from 'fs';
import * as path from 'path';
import { env } from '@/config/env';
import { logger } from '../utils/logger';

export interface GeneratedMetadata {
  title: string;
  description: string;
  tags: string[];
}

export class AIService {
  private client: OpenAI | null = null;

  private getClient(): OpenAI {
    if (!env.OPENAI_API_KEY) {
      throw new Error('OpenAI API key not configured. Set OPENAI_API_KEY in .env.local');
    }

    if (!this.client) {
      this.client = new OpenAI({
        apiKey: env.OPENAI_API_KEY,
      });
    }

    return this.client;
  }

  /**
   * Transcribe audio from a video clip using Whisper
   */
  async transcribeClip(clipPath: string): Promise<string> {
    const client = this.getClient();

    logger.info('Transcribing clip with Whisper', { clipPath });

    try {
      // Check if file exists
      if (!fs.existsSync(clipPath)) {
        throw new Error(`Clip file not found: ${clipPath}`);
      }

      const response = await client.audio.transcriptions.create({
        file: fs.createReadStream(clipPath),
        model: 'whisper-1',
        language: 'en',
      });

      const transcript = response.text;

      logger.info('Transcription completed', {
        clipPath,
        transcriptLength: transcript.length,
        preview: transcript.slice(0, 100)
      });

      return transcript;
    } catch (error: any) {
      logger.error('Transcription failed', { error: error.message, clipPath });
      return ''; // Return empty string, generation will still work with just the title
    }
  }

  /**
   * Generate engaging title, description, and tags for a YouTube Short
   */
  async generateMetadata(
    originalTitle: string,
    clipNumber: number,
    totalClips: number
  ): Promise<GeneratedMetadata> {
    const client = this.getClient();

    logger.info('Generating metadata with AI', { originalTitle, clipNumber });

    const prompt = `You are a YouTube Shorts expert specializing in gaming and viral content. Generate an engaging title, description, and tags for a short-form vertical video clip.

Original video title: "${originalTitle}"
Clip ${clipNumber} of ${totalClips}

Requirements:
- Title: Create a SPECIFIC, action-focused title. Examples:
  - "1v3 Clutch on Ascent with the Vandal"
  - "This 4K Ace Was INSANE"
  - "When the Flank Actually Works"
  - "POV: Solo Queue at 3AM"
  Keep under 70 characters. Be catchy and specific to the content.

- Description: 1-2 punchy sentences that create curiosity. Include a CTA. Under 150 characters.

- Tags: 5-8 relevant tags based on the video title (game name, content type, etc). No # symbol.

Respond in this exact JSON format only, no other text:
{
  "title": "Your specific, engaging title here",
  "description": "Your compelling description here",
  "tags": ["tag1", "tag2", "tag3", "tag4", "tag5"]
}`;

    try {
      const response = await client.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: 0.9,
        max_tokens: 300,
      });

      const content = response.choices[0]?.message?.content;

      if (!content) {
        throw new Error('No response from OpenAI');
      }

      // Parse JSON response (handle potential markdown code blocks)
      let jsonContent = content.trim();
      if (jsonContent.startsWith('```')) {
        jsonContent = jsonContent.replace(/```json?\n?/g, '').replace(/```$/g, '').trim();
      }

      const parsed = JSON.parse(jsonContent) as GeneratedMetadata;

      // Validate response structure
      if (!parsed.title || !parsed.description || !Array.isArray(parsed.tags)) {
        throw new Error('Invalid response structure from OpenAI');
      }

      logger.info('Metadata generated successfully', { title: parsed.title });

      return {
        title: parsed.title.slice(0, 100),
        description: parsed.description.slice(0, 5000),
        tags: parsed.tags.slice(0, 10),
      };
    } catch (error: any) {
      logger.error('Failed to generate metadata', { error: error.message });

      // Fallback to simple template if AI fails
      return this.getFallbackMetadata(originalTitle, clipNumber);
    }
  }

  /**
   * Generate title overlays for video clips
   * Returns an array of short, catchy titles for burning into videos
   */
  async generateClipTitles(
    videoTitle: string,
    clipCount: number
  ): Promise<string[]> {
    const client = this.getClient();

    logger.info('Generating clip titles with AI', { videoTitle, clipCount });

    const prompt = `Generate ${clipCount} short, catchy title overlays for video clips from: "${videoTitle}"

Requirements:
- Each title should be 3-8 words maximum
- Use hooks: questions, bold statements, or intriguing phrases
- Make them attention-grabbing for social media (TikTok/YouTube Shorts style)
- They should work as text overlays at the top of vertical videos
- Don't use numbers or "Part X" format
- Make each one unique and interesting

Examples of good titles:
- "Wait For The Ending..."
- "Nobody Expected This"
- "Is This Even Possible?"
- "The Timing Was Perfect"
- "How Did That Work?"

Return ONLY a JSON array of ${clipCount} title strings, no other text:
["Title 1", "Title 2", ...]`;

    try {
      const response = await client.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.9,
        max_tokens: 200,
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error('No response from OpenAI');
      }

      // Parse JSON array
      let jsonContent = content.trim();
      if (jsonContent.startsWith('```')) {
        jsonContent = jsonContent.replace(/```json?\n?/g, '').replace(/```$/g, '').trim();
      }

      const titles = JSON.parse(jsonContent) as string[];

      if (!Array.isArray(titles) || titles.length === 0) {
        throw new Error('Invalid titles response');
      }

      logger.info('Clip titles generated', { titles });

      // Ensure we have enough titles (pad with fallback if needed)
      while (titles.length < clipCount) {
        titles.push(`Moment ${titles.length + 1}`);
      }

      return titles.slice(0, clipCount);
    } catch (error: any) {
      logger.error('Failed to generate clip titles', { error: error.message });

      // Fallback titles
      return Array.from({ length: clipCount }, (_, i) => `Best Moment ${i + 1}`);
    }
  }

  /**
   * Fallback metadata if AI generation fails
   */
  private getFallbackMetadata(originalTitle: string, clipNumber: number): GeneratedMetadata {
    const cleanTitle = originalTitle.replace(/[^\w\s]/g, '').slice(0, 50);

    return {
      title: `${cleanTitle} - Highlight ${clipNumber}`,
      description: `Check out this amazing moment! Like and follow for more content.`,
      tags: ['shorts', 'viral', 'trending', 'fyp', 'highlight'],
    };
  }
}

export const aiService = new AIService();
