/**
 * Landing Page Content
 * All copy in one place - human voice, no AI-generated feel
 */

export const LANDING_CONTENT = {
  hero: {
    headline: "Turn long videos into viral clips",
    subheadline:
      "Our AI watches your entire video and finds the moments people actually want to see. Not just scene changes—real engagement.",
    ctaPrimary: "Generate Clips",
    ctaPlaceholder: "https://youtube.com/watch?v=...",
    supportedFormats: "Works with YouTube videos, Shorts, and live streams",
  },

  stats: [
    { value: "3 min", label: "Average processing" },
    { value: "9:16", label: "Perfect vertical format" },
    { value: "AI-Powered", label: "ClipHunter analysis" },
  ],

  howItWorks: {
    title: "Three steps to viral content",
    subtitle: "No editing skills required. Just paste and go.",
    steps: [
      {
        number: "01",
        title: "Drop a YouTube link",
        description: "Paste any YouTube URL. We'll handle the rest.",
      },
      {
        number: "02",
        title: "ClipHunter AI analyzes every moment",
        description:
          "Not just scene cuts. We find humor, emotion, and hooks that actually work.",
      },
      {
        number: "03",
        title: "Download vertical clips ready to post",
        description:
          "9:16 format, subtitles burned in, titles generated. Just upload.",
      },
    ],
  },

  features: [
    {
      title: "ClipHunter AI Analysis",
      description:
        "We find engaging moments, not just scene cuts. Our AI understands humor, emotion, and what makes people click.",
      accentColor: "purple" as const,
    },
    {
      title: "Word-Level Subtitles",
      description:
        "Subtitles sync to every word, not every 3 seconds. Your captions actually match what people are saying.",
      accentColor: "cyan" as const,
    },
    {
      title: "AI-Generated Metadata",
      description:
        "Titles and hashtags written by AI that knows what goes viral. Saves you 10 minutes per clip.",
      accentColor: "blue" as const,
    },
    {
      title: "Voice-Over Generation",
      description:
        "Add AI voiceovers without recording anything. ElevenLabs integration for professional narration.",
      accentColor: "purple" as const,
    },
    {
      title: "Direct YouTube Upload",
      description:
        "Upload to YouTube without leaving the page. Schedule, publish, done.",
      accentColor: "cyan" as const,
    },
    {
      title: "Batch Processing",
      description:
        "Process 10 videos while you get coffee. We handle the queue.",
      accentColor: "blue" as const,
    },
  ],

  pricing: {
    title: "Currently in Beta",
    description:
      "ClipHunter is in active development. Sign up to get early access and help shape the product.",
    badge: "MVP",
  },

  finalCta: {
    title: "Ready to create viral clips?",
    description: "Join creators who are already using AI to grow their audience.",
    ctaPrimary: "Get Started",
    ctaSecondary: "View Documentation",
  },
} as const;
