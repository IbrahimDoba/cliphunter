import * as fs from 'fs';
import * as path from 'path';
import { env } from '../config/env';
import { logger } from '../utils/logger';

export interface Voice {
  voice_id: string;
  name: string;
  category: string;
}

export interface VoiceSettings {
  stability: number;
  similarity_boost: number;
  style?: number;
  use_speaker_boost?: boolean;
}

export interface WordTiming {
  word: string;
  start: number; // seconds
  end: number; // seconds
}

export interface SpeechWithTimestamps {
  audioPath: string;
  duration: number;
  wordTimings: WordTiming[];
}

export class ElevenLabsService {
  private apiKey: string | undefined;
  private voiceId: string;
  private baseUrl = 'https://api.elevenlabs.io/v1';

  constructor() {
    this.apiKey = env.ELEVEN_LABS_API_KEY;
    this.voiceId = env.ELEVEN_LABS_VOICE_ID;
  }

  /**
   * Check if ElevenLabs is configured
   */
  isConfigured(): boolean {
    return !!this.apiKey;
  }

  /**
   * Generate speech from text and save to file
   */
  async generateSpeech(
    text: string,
    outputPath: string,
    voiceId?: string,
    settings?: Partial<VoiceSettings>
  ): Promise<void> {
    if (!this.apiKey) {
      throw new Error('ElevenLabs API key not configured. Set ELEVENLABS_API_KEY in .env.local');
    }

    const selectedVoiceId = voiceId || this.voiceId;

    logger.info('Generating voice-over with ElevenLabs', {
      textLength: text.length,
      voiceId: selectedVoiceId,
      outputPath,
    });

    const voiceSettings: VoiceSettings = {
      stability: settings?.stability ?? 0.5,
      similarity_boost: settings?.similarity_boost ?? 0.75,
      style: settings?.style ?? 0.5,
      use_speaker_boost: settings?.use_speaker_boost ?? true,
    };

    try {
      const response = await fetch(
        `${this.baseUrl}/text-to-speech/${selectedVoiceId}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'xi-api-key': this.apiKey,
          },
          body: JSON.stringify({
            text,
            model_id: 'eleven_monolingual_v1',
            voice_settings: voiceSettings,
          }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          `ElevenLabs API error: ${response.status} - ${errorData.detail?.message || response.statusText}`
        );
      }

      // Get audio buffer
      const audioBuffer = await response.arrayBuffer();

      // Ensure output directory exists
      const outputDir = path.dirname(outputPath);
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      // Write to file
      fs.writeFileSync(outputPath, Buffer.from(audioBuffer));

      logger.info('Voice-over generated successfully', {
        outputPath,
        size: audioBuffer.byteLength,
      });
    } catch (error: any) {
      logger.error('Failed to generate voice-over', { error: error.message });
      throw error;
    }
  }

  /**
   * Generate speech with word-level timestamps for subtitles
   * Uses the streaming endpoint with timestamps
   */
  async generateSpeechWithTimestamps(
    text: string,
    outputPath: string,
    voiceId?: string,
    settings?: Partial<VoiceSettings>
  ): Promise<SpeechWithTimestamps> {
    if (!this.apiKey) {
      throw new Error('ElevenLabs API key not configured');
    }

    const selectedVoiceId = voiceId || this.voiceId;

    logger.info('Generating voice-over with timestamps', {
      textLength: text.length,
      voiceId: selectedVoiceId,
      outputPath,
    });

    const voiceSettings: VoiceSettings = {
      stability: settings?.stability ?? 0.5,
      similarity_boost: settings?.similarity_boost ?? 0.75,
      style: settings?.style ?? 0.5,
      use_speaker_boost: settings?.use_speaker_boost ?? true,
    };

    try {
      // Use the streaming endpoint with timestamps
      const response = await fetch(
        `${this.baseUrl}/text-to-speech/${selectedVoiceId}/stream/with-timestamps`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'xi-api-key': this.apiKey,
          },
          body: JSON.stringify({
            text,
            model_id: 'eleven_multilingual_v2',
            voice_settings: voiceSettings,
          }),
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `ElevenLabs API error: ${response.status} - ${errorText}`
        );
      }

      // Parse the streaming response (NDJSON format)
      const responseText = await response.text();
      const lines = responseText.trim().split('\n');

      const audioChunks: Buffer[] = [];
      const wordTimings: WordTiming[] = [];

      for (const line of lines) {
        if (!line.trim()) continue;

        try {
          const data = JSON.parse(line);

          // Audio chunk (base64 encoded)
          if (data.audio_base64) {
            audioChunks.push(Buffer.from(data.audio_base64, 'base64'));
          }

          // Word alignment data
          if (data.alignment) {
            const { characters, character_start_times_seconds, character_end_times_seconds } = data.alignment;

            if (characters && character_start_times_seconds && character_end_times_seconds) {
              // Build words from characters
              let currentWord = '';
              let wordStart = 0;
              let wordEnd = 0;

              for (let i = 0; i < characters.length; i++) {
                const char = characters[i];
                const startTime = character_start_times_seconds[i];
                const endTime = character_end_times_seconds[i];

                if (char === ' ' || i === characters.length - 1) {
                  // End of word
                  if (i === characters.length - 1 && char !== ' ') {
                    currentWord += char;
                    wordEnd = endTime;
                  }

                  if (currentWord.trim()) {
                    wordTimings.push({
                      word: currentWord.trim(),
                      start: wordStart,
                      end: wordEnd,
                    });
                  }

                  currentWord = '';
                  wordStart = endTime;
                } else {
                  if (currentWord === '') {
                    wordStart = startTime;
                  }
                  currentWord += char;
                  wordEnd = endTime;
                }
              }
            }
          }
        } catch (parseError) {
          // Skip malformed lines
          logger.debug('Skipping malformed line in response', { line: line.slice(0, 100) });
        }
      }

      // Ensure output directory exists
      const outputDir = path.dirname(outputPath);
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      // Combine audio chunks and write to file
      const audioBuffer = Buffer.concat(audioChunks);
      fs.writeFileSync(outputPath, audioBuffer);

      // Calculate duration from last word timing or estimate
      const duration = wordTimings.length > 0
        ? wordTimings[wordTimings.length - 1].end
        : text.split(/\s+/).length / 2.5; // Estimate ~2.5 words per second

      logger.info('Voice-over with timestamps generated successfully', {
        outputPath,
        size: audioBuffer.byteLength,
        wordCount: wordTimings.length,
        duration,
      });

      return {
        audioPath: outputPath,
        duration,
        wordTimings,
      };
    } catch (error: any) {
      logger.error('Failed to generate voice-over with timestamps', {
        error: error.message,
      });

      // Fallback to regular generation without timestamps
      logger.info('Falling back to regular speech generation without timestamps');
      await this.generateSpeech(text, outputPath, voiceId, settings);

      // Estimate word timings
      const words = text.split(/\s+/);
      const estimatedDuration = words.length / 2.5;
      const avgWordDuration = estimatedDuration / words.length;

      const estimatedTimings: WordTiming[] = words.map((word, i) => ({
        word,
        start: i * avgWordDuration,
        end: (i + 1) * avgWordDuration,
      }));

      return {
        audioPath: outputPath,
        duration: estimatedDuration,
        wordTimings: estimatedTimings,
      };
    }
  }

  /**
   * Get available voices
   */
  async getVoices(): Promise<Voice[]> {
    if (!this.apiKey) {
      throw new Error('ElevenLabs API key not configured');
    }

    try {
      const response = await fetch(`${this.baseUrl}/voices`, {
        headers: {
          'xi-api-key': this.apiKey,
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch voices: ${response.status}`);
      }

      const data = await response.json();
      return data.voices as Voice[];
    } catch (error: any) {
      logger.error('Failed to get voices', { error: error.message });
      throw error;
    }
  }

  /**
   * Generate voice-over for a video clip intro
   * Returns the path to the generated audio file
   */
  async generateClipVoiceOver(
    script: string,
    jobId: string,
    clipId: string
  ): Promise<string> {
    const outputDir = path.join(process.cwd(), 'temp', jobId);
    const outputPath = path.join(outputDir, `${clipId}_voiceover.mp3`);

    await this.generateSpeech(script, outputPath);

    return outputPath;
  }
}

export const elevenLabsService = new ElevenLabsService();
