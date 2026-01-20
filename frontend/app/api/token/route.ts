import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import jwt from 'jsonwebtoken';

export const runtime = 'nodejs'; // Force Node.js runtime

export async function GET() {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Generate backend JWT token
  const backendToken = jwt.sign(
    {
      sub: session.user.id,
      email: session.user.email,
      name: session.user.name,
    },
    process.env.NEXTAUTH_SECRET!,
    { expiresIn: '7d' }
  );

  return NextResponse.json({ token: backendToken });
}
