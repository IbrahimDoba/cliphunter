"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";

function GenerateContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [videoUrl, setVideoUrl] = useState("");
  const [maxClips, setMaxClips] = useState("5");
  const [includeSubtitles, setIncludeSubtitles] = useState(false);
  const [showSubscribe, setShowSubscribe] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  // Pre-fill URL from query params (from landing page CTA)
  useEffect(() => {
    const urlParam = searchParams.get("url");
    if (urlParam) {
      setVideoUrl(decodeURIComponent(urlParam));
    }
  }, [searchParams]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    try {
      const response = await fetch("/api/jobs/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          videoUrl,
          options: {
            maxClips: parseInt(maxClips, 10),
            includeSubtitles,
            showSubscribe,
          },
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error?.message || "Failed to create job");
      }

      // Redirect to job status page
      router.push(`/jobs/${data.jobId}`);
    } catch (err: any) {
      setError(err.message || "Something went wrong");
      setIsLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
      <Card>
        <CardHeader>
          <CardTitle>Create Short Clips from YouTube</CardTitle>
          <CardDescription>
            Paste a YouTube URL below and we'll automatically generate engaging
            short clips perfect for TikTok, Instagram Reels, and YouTube Shorts.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label
                htmlFor="video-url"
                className="text-sm font-medium mb-2 block"
              >
                YouTube URL
              </Label>
              <Input
                id="video-url"
                type="url"
                placeholder="https://www.youtube.com/watch?v=..."
                value={videoUrl}
                onChange={(e) => setVideoUrl(e.target.value)}
                disabled={isLoading}
                required
                className="text-base"
              />
              {error && (
                <p className="text-sm text-destructive mt-2">{error}</p>
              )}
            </div>

            <div>
              <Label
                htmlFor="max-clips"
                className="text-sm font-medium mb-2 block"
              >
                Number of Clips
              </Label>
              <Select
                value={maxClips}
                onValueChange={setMaxClips}
                disabled={isLoading}
              >
                <SelectTrigger id="max-clips" className="w-full">
                  <SelectValue placeholder="Select number of clips" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="3">3 clips</SelectItem>
                  <SelectItem value="5">5 clips</SelectItem>
                  <SelectItem value="7">7 clips</SelectItem>
                  <SelectItem value="10">10 clips</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center space-x-3">
              <Checkbox
                id="include-subtitles"
                checked={includeSubtitles}
                onCheckedChange={(checked) =>
                  setIncludeSubtitles(checked === true)
                }
                disabled={isLoading}
              />
              <Label
                htmlFor="include-subtitles"
                className="text-sm font-medium cursor-pointer"
              >
                Include subtitles (synced captions burned into video)
              </Label>
            </div>

            <div className="flex items-center space-x-3">
              <Checkbox
                id="show-subscribe"
                checked={showSubscribe}
                onCheckedChange={(checked) =>
                  setShowSubscribe(checked === true)
                }
                disabled={isLoading}
              />
              <Label
                htmlFor="show-subscribe"
                className="text-sm font-medium cursor-pointer"
              >
                Show "SUBSCRIBE :)" overlay at bottom
              </Label>
            </div>

            <Button type="submit" disabled={isLoading} className="w-full">
              {isLoading ? "Creating Job..." : "Generate Clips"}
            </Button>
          </form>

          <div className="mt-8 space-y-4">
            <h3 className="font-medium text-sm">How it works:</h3>
            <ol className="text-sm text-muted-foreground space-y-2 list-decimal list-inside">
              <li>Paste a YouTube video URL</li>
              <li>We analyze the video to find engaging moments</li>
              <li>
                Clips are automatically generated in vertical format (9:16)
              </li>
              <li>Download your clips ready for social media</li>
            </ol>
          </div>
        </CardContent>
      </Card>

      <div className="mt-6 p-4 bg-muted/50 rounded-lg">
        <h3 className="font-medium text-sm mb-2">Supported URLs:</h3>
        <ul className="text-xs text-muted-foreground space-y-1">
          <li>• https://www.youtube.com/watch?v=...</li>
          <li>• https://youtu.be/...</li>
          <li>• https://www.youtube.com/shorts/...</li>
        </ul>
      </div>
    </div>
  );
}

export default function GeneratePage() {
  return (
    <div className="container mx-auto px-4 py-8">
      <Suspense
        fallback={
          <div className="max-w-2xl mx-auto">
            <Card className="animate-pulse">
              <CardHeader className="h-32" />
              <CardContent className="h-96" />
            </Card>
          </div>
        }
      >
        <GenerateContent />
      </Suspense>
    </div>
  );
}
