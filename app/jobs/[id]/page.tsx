'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { GetJobStatusResponse } from '@/types/api';

export default function JobPage() {
  const params = useParams();
  const jobId = params.id as string;

  const [job, setJob] = useState<GetJobStatusResponse | null>(null);
  const [error, setError] = useState('');
  const [isPolling, setIsPolling] = useState(true);

  useEffect(() => {
    if (!jobId) return;

    const fetchJobStatus = async () => {
      try {
        const response = await fetch(`/api/jobs/${jobId}/status`);
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error?.message || 'Failed to fetch job status');
        }

        setJob(data);

        // Stop polling if job is completed or failed
        if (data.status === 'completed' || data.status === 'failed' || data.status === 'cancelled') {
          setIsPolling(false);
        }
      } catch (err: any) {
        setError(err.message);
        setIsPolling(false);
      }
    };

    // Initial fetch
    fetchJobStatus();

    // Poll every 2 seconds while job is processing
    let interval: NodeJS.Timeout;
    if (isPolling) {
      interval = setInterval(fetchJobStatus, 2000);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [jobId, isPolling]);

  if (error) {
    return (
      <div className="max-w-2xl mx-auto">
        <Card>
          <CardHeader>
            <CardTitle className="text-destructive">Error</CardTitle>
          </CardHeader>
          <CardContent>
            <p>{error}</p>
            <Link href="/" className="mt-4 inline-block">
              <Button>Go Back</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!job) {
    return (
      <div className="max-w-2xl mx-auto">
        <Card>
          <CardContent className="p-8">
            <div className="text-center">Loading...</div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Status Card */}
      <Card>
        <CardHeader>
          <CardTitle>Processing Video</CardTitle>
          <CardDescription>Job ID: {jobId}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {job.status === 'processing' || job.status === 'queued' ? (
            <>
              <div>
                <div className="flex justify-between text-sm mb-2">
                  <span className="font-medium">{job.progress.message}</span>
                  <span className="text-muted-foreground">{job.progress.percentage}%</span>
                </div>
                <Progress value={job.progress.percentage} />
              </div>
              <p className="text-sm text-muted-foreground">
                Current step: {job.progress.step}
              </p>
            </>
          ) : job.status === 'completed' ? (
            <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg">
              <p className="text-green-800 dark:text-green-200 font-medium">
                Clips generated successfully!
              </p>
            </div>
          ) : job.status === 'failed' ? (
            <div className="p-4 bg-destructive/10 rounded-lg">
              <p className="text-destructive font-medium">Processing failed</p>
              {job.error && <p className="text-sm mt-1">{job.error.message}</p>}
            </div>
          ) : job.status === 'cancelled' ? (
            <div className="p-4 bg-muted rounded-lg">
              <p className="text-muted-foreground font-medium">Job was cancelled</p>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {/* Results */}
      {job.status === 'completed' && job.result && (
        <Card>
          <CardHeader>
            <CardTitle>{job.result.videoTitle}</CardTitle>
            <CardDescription>
              {job.result.clips.length} clip{job.result.clips.length !== 1 ? 's' : ''} generated
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {job.result.clips.map((clip, index) => (
                <div key={clip.id} className="border rounded-lg overflow-hidden">
                  <div className="aspect-[9/16] bg-black relative">
                    <video
                      src={clip.videoUrl}
                      controls
                      className="w-full h-full object-contain"
                      preload="metadata"
                    />
                  </div>
                  <div className="p-4 space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Clip {index + 1}</span>
                      <span className="text-muted-foreground">
                        {clip.duration.toFixed(1)}s
                      </span>
                    </div>
                    <a href={`${clip.videoUrl}?download=true`} download>
                      <Button variant="outline" size="sm" className="w-full">
                        Download
                      </Button>
                    </a>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="text-center">
        <Link href="/">
          <Button variant="outline">Process Another Video</Button>
        </Link>
      </div>
    </div>
  );
}
