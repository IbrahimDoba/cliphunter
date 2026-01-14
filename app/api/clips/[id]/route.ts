import { NextRequest, NextResponse } from "next/server";
import { getStorageService } from "@/lib/storage";
import { logger } from "@/lib/utils/logger";

export const runtime = "edge";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: clipId } = await params;
    const searchParams = request.nextUrl.searchParams;
    const download = searchParams.get("download") === "true";

    // Construct relative path (assumes format: {jobId}/clips/{clipId}.mp4)
    const relativePath = clipId.endsWith(".mp4") ? clipId : `${clipId}.mp4`;

    logger.debug("Serving clip", { clipId, relativePath });

    const storageService = await getStorageService();

    // Check if we are in production (Vercel Blob)
    const isProduction = process.env.NODE_ENV === "production";
    const hasVercelBlob = !!process.env.BLOB_READ_WRITE_TOKEN;

    if (isProduction && hasVercelBlob) {
      // In production, we can redirect to the Vercel Blob URL
      // We need to find the actual blob URL.
      // Since we don't store the full blob URL in a way that's easily searchable by key alone without 'list'
      // and 'list' might be slow, we'll try to use the storage service to check if it exists
      // and then redirect.

      const exists = await storageService.fileExists(relativePath);
      if (!exists) {
        return NextResponse.json(
          { error: { message: "Clip not found", code: "CLIP_NOT_FOUND" } },
          { status: 404 }
        );
      }

      // Vercel Blob URLs are usually stored in the DB.
      // If we don't have the URL here, we might need to fetch it from the Job result in the DB.
      // However, to keep this route Edge-compatible and fast, we should ideally have the URL.
      // For now, let's assume we can construct it or use a proxy if needed.
      // Actually, the best way is to fetch the Job from Prisma, but Prisma is NOT Edge-compatible.

      // Alternative: If we are on Edge, we can't use Prisma.
      // But we can use Vercel Blob 'list' to find the URL.
      const { list } = await import("@vercel/blob");
      const { blobs } = await list({ prefix: relativePath, limit: 1 });

      if (blobs.length === 0) {
        return NextResponse.json(
          { error: { message: "Clip not found", code: "CLIP_NOT_FOUND" } },
          { status: 404 }
        );
      }

      const blobUrl = blobs[0].url;

      // Redirect to the blob URL
      return NextResponse.redirect(blobUrl);
    }

    // Fallback for local development (Node.js runtime usually)
    // If we are in local dev, 'runtime = edge' might still work if we don't use Node built-ins.
    // But serving local files requires 'fs', which is NOT available in Edge.
    // So for local dev, we might need a different approach or just accept it works differently.

    return NextResponse.json(
      {
        error: {
          message:
            "Local file serving not supported in Edge runtime. Use development mode.",
          code: "NOT_SUPPORTED",
        },
      },
      { status: 501 }
    );
  } catch (error: any) {
    logger.error("Failed to serve clip", { error: error.message });

    return NextResponse.json(
      {
        error: {
          message: "Failed to serve clip",
          code: "INTERNAL_ERROR",
        },
      },
      { status: 500 }
    );
  }
}
