import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { aiService } from '@/lib/services/ai.service';
import { GenerateMetadataResponse } from '@/types/youtube';

// Request validation schema
const generateSchema = z.object({
  videoTitle: z.string().min(1, 'Video title is required'),
  clipNumber: z.number().int().positive(),
  totalClips: z.number().int().positive(),
});

/**
 * POST /api/youtube/generate-metadata
 * Auto-generates title, description, and tags using AI
 * Optionally transcribes the clip audio for context-aware generation
 */
export async function POST(request: NextRequest) {
  try {
    // Check if OpenAI is configured
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        {
          error: {
            message: 'AI generation not configured. Set OPENAI_API_KEY in .env.local',
            code: 'NOT_CONFIGURED',
          },
        },
        { status: 503 }
      );
    }

    const body = await request.json();

    // Validate request
    const validationResult = generateSchema.safeParse(body);
    if (!validationResult.success) {
      return NextResponse.json(
        {
          error: {
            message: 'Invalid request',
            code: 'VALIDATION_ERROR',
            details: validationResult.error.issues,
          },
        },
        { status: 400 }
      );
    }

    const { videoTitle, clipNumber, totalClips } = validationResult.data;

    // Generate metadata using AI
    const metadata = await aiService.generateMetadata(
      videoTitle,
      clipNumber,
      totalClips
    );

    const response: GenerateMetadataResponse = {
      title: metadata.title,
      description: metadata.description,
      tags: metadata.tags,
    };

    return NextResponse.json(response);
  } catch (error: any) {
    console.error('Metadata generation error:', error);

    return NextResponse.json(
      {
        error: {
          message: error.message || 'Failed to generate metadata',
          code: 'GENERATION_ERROR',
        },
      },
      { status: 500 }
    );
  }
}
