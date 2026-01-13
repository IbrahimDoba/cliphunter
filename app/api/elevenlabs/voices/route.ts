import { NextResponse } from 'next/server';
import { elevenLabsService } from '@/lib/services/elevenlabs.service';
import { logger } from '@/lib/utils/logger';

// Cache voices for 1 hour
let cachedVoices: { voice_id: string; name: string; category: string }[] | null = null;
let cacheTimestamp = 0;
const CACHE_DURATION = 60 * 60 * 1000; // 1 hour

export async function GET() {
  try {
    // Check if ElevenLabs is configured
    if (!elevenLabsService.isConfigured()) {
      return NextResponse.json(
        {
          error: {
            message: 'ElevenLabs API not configured',
            code: 'NOT_CONFIGURED',
          },
        },
        { status: 503 }
      );
    }

    // Return cached voices if still valid
    const now = Date.now();
    if (cachedVoices && now - cacheTimestamp < CACHE_DURATION) {
      return NextResponse.json({ voices: cachedVoices });
    }

    // Fetch fresh voices
    const voices = await elevenLabsService.getVoices();

    // Simplify and cache the response
    cachedVoices = voices.map((v) => ({
      voice_id: v.voice_id,
      name: v.name,
      category: v.category,
    }));
    cacheTimestamp = now;

    logger.info('Fetched ElevenLabs voices', { count: cachedVoices.length });

    return NextResponse.json({ voices: cachedVoices });
  } catch (error: any) {
    logger.error('Failed to fetch ElevenLabs voices', { error: error.message });

    return NextResponse.json(
      {
        error: {
          message: error.message || 'Failed to fetch voices',
          code: 'FETCH_ERROR',
        },
      },
      { status: 500 }
    );
  }
}
