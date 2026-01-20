export const siteConfig = {
  name: "Cliphunter",
  description:
    "Transform YouTube videos into engaging short clips for TikTok, Reels, and Shorts using AI.",
  url: process.env.NEXT_PUBLIC_APP_URL || "https://cliphunter.vercel.app",
  ogImage: "/og-image.png",
  links: {
    twitter: "https://twitter.com/cliphunter", // Placeholder
    github: "https://github.com/IbrahimDoba/cliphunter",
  },
  creator: "Ibrahim Doba",
  keywords: [
    "YouTube to Shorts",
    "AI Video Editor",
    "TikTok Creator Tools",
    "Instagram Reels Generator",
    "Viral Clip Maker",
    "Video Automation",
    "Content Creation AI",
  ],
} as const;

export type SiteConfig = typeof siteConfig;
