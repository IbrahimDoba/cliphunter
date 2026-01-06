import NextAuth from "next-auth"
import { PrismaAdapter } from "@auth/prisma-adapter"
import Google from "next-auth/providers/google"
import { prisma } from "@/lib/db/prisma"

export const { handlers, signIn, signOut, auth } = NextAuth({
  adapter: PrismaAdapter(prisma),
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],
  trustHost: true,
  session: {
    strategy: "jwt",
  },
  events: {
    // Create default subscription when a new user is created
    async createUser({ user }) {
      if (user.id) {
        await prisma.subscription.create({
          data: {
            userId: user.id,
            plan: 'FREE',
          }
        })
      }
    }
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id
      }
      return token
    },
    async session({ session, token }) {
      if (session.user && token.id) {
        session.user.id = token.id as string
        // Plan will be fetched separately via API to avoid Edge Runtime issues
      }
      return session
    },
  },
  pages: {
    signIn: '/auth/signin',
  },
})
