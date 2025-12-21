import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().default('3000'),

  // Paths
  OUTPUT_DIR: z.string().default('./public/outputs'),
  TEMP_DIR: z.string().default('./temp'),
  DATABASE_PATH: z.string().default('./cliphunter.db'),

  // Video Processing
  MAX_VIDEO_DURATION: z.string().transform(Number).pipe(z.number().positive()).default('3600'),
  MAX_CLIPS_PER_VIDEO: z.string().transform(Number).pipe(z.number().positive()).default('5'),
  DEFAULT_CLIP_DURATION: z.string().transform(Number).pipe(z.number().positive()).default('45'),
  FFMPEG_THREADS: z.string().transform(Number).pipe(z.number().positive()).default('2'),

  // Job Queue
  QUEUE_POLL_INTERVAL: z.string().transform(Number).pipe(z.number().positive()).default('5000'),
  MAX_JOB_RETRIES: z.string().transform(Number).pipe(z.number().nonnegative()).default('3'),

  // Optional: Deepgram API
  DEEPGRAM_API_KEY: z.string().optional(),
});

// Parse and validate environment variables
const parseEnv = () => {
  try {
    return envSchema.parse(process.env);
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error('❌ Invalid environment variables:');
      error.errors.forEach((err) => {
        console.error(`  ${err.path.join('.')}: ${err.message}`);
      });
      process.exit(1);
    }
    throw error;
  }
};

export const env = parseEnv();
