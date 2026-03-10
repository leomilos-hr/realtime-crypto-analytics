import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";
import bcrypt from "bcryptjs";
import { prisma } from "./prisma";
import { checkRateLimit } from "./rate-limit";

const DEFAULT_COINS = JSON.stringify([
  { pair: "BTCUSDT", ticker: "BTC", name: "Bitcoin" },
  { pair: "ETHUSDT", ticker: "ETH", name: "Ethereum" },
  { pair: "LTCUSDT", ticker: "LTC", name: "Litecoin" },
]);

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID || "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
    }),
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        // Rate limit: 10 login attempts per 15 minutes per email
        const rl = checkRateLimit(`login:${credentials.email.toLowerCase()}`, { limit: 10, windowSec: 900 });
        if (!rl.allowed) return null;

        const user = await prisma.user.findUnique({
          where: { email: credentials.email },
        });
        if (!user || !user.password) return null;

        const valid = await bcrypt.compare(credentials.password, user.password);
        if (!valid) return null;

        return { id: user.id, email: user.email, name: user.name };
      },
    }),
  ],
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  secret: process.env.NEXTAUTH_SECRET,
  callbacks: {
    async signIn({ user, account }) {
      if (account?.provider === "google" && user.email) {
        // Find or create user for Google sign-in
        const existing = await prisma.user.findUnique({
          where: { email: user.email },
        });
        if (!existing) {
          await prisma.user.create({
            data: {
              email: user.email,
              name: user.name || undefined,
              image: user.image || undefined,
              provider: "google",
              dashboardCoins: DEFAULT_COINS,
            },
          });
        } else if (!existing.provider) {
          // Link Google to existing credentials account
          await prisma.user.update({
            where: { email: user.email },
            data: {
              provider: "google",
              image: user.image || existing.image,
              name: existing.name || user.name,
            },
          });
        }
      }
      return true;
    },
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.name = user.name;
      }
      // Refresh name from DB on each token refresh so settings changes take effect
      if (token.email) {
        const dbUser = await prisma.user.findUnique({
          where: { email: token.email },
          select: { name: true },
        });
        if (dbUser) token.name = dbUser.name;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        if (token.id) (session.user as { id?: string }).id = token.id as string;
        session.user.name = token.name as string | null;
      }
      return session;
    },
  },
};
