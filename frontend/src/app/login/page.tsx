"use client";

import { signIn, useSession } from "next-auth/react";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function LoginPage() {
  const router = useRouter();
  const { status } = useSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Redirect to dashboard if already logged in
  useEffect(() => {
    if (status === "authenticated") {
      router.replace("/dashboard");
    }
  }, [status, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    const result = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });

    if (result?.error) {
      setError("Invalid email or password");
      setLoading(false);
    } else {
      router.replace("/dashboard");
    }
  };

  if (status === "authenticated") return null;

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold mb-2" style={{ color: "var(--text-primary)" }}>
            Crypto Analytics
          </h1>
          <p style={{ color: "var(--text-muted)" }}>
            Real-time cryptocurrency dashboard
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="rounded-lg p-6 space-y-4"
          style={{ backgroundColor: "var(--bg-card)", border: "1px solid var(--border-color)" }}
        >
          <h2 className="text-xl font-semibold" style={{ color: "var(--text-primary)" }}>Sign In</h2>

          {error && (
            <div className="bg-red-900/30 border border-red-800 text-red-400 px-4 py-2 rounded text-sm">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm mb-1" style={{ color: "var(--text-muted)" }}>Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-md px-3 py-2 focus:outline-none focus:border-blue-500"
              style={{ backgroundColor: "var(--bg-input)", border: "1px solid var(--border-color)", color: "var(--text-primary)" }}
              required
            />
          </div>

          <div>
            <label className="block text-sm mb-1" style={{ color: "var(--text-muted)" }}>
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-md px-3 py-2 focus:outline-none focus:border-blue-500"
              style={{ backgroundColor: "var(--bg-input)", border: "1px solid var(--border-color)", color: "var(--text-primary)" }}
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2 rounded-md font-medium transition-colors disabled:opacity-50"
          >
            {loading ? "Signing in..." : "Sign In"}
          </button>

          <div className="relative my-2">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t" style={{ borderColor: "var(--border-color)" }} />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="px-2" style={{ backgroundColor: "var(--bg-card)", color: "var(--text-muted)" }}>or</span>
            </div>
          </div>

          <button
            type="button"
            onClick={() => signIn("google", { callbackUrl: "/dashboard" })}
            className="w-full flex items-center justify-center gap-3 py-2 rounded-md font-medium transition-colors hover:opacity-90"
            style={{ backgroundColor: "var(--bg-input)", border: "1px solid var(--border-color)", color: "var(--text-primary)" }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            Continue with Google
          </button>

          <p className="text-center text-sm" style={{ color: "var(--text-muted)" }}>
            Don&apos;t have an account?{" "}
            <Link href="/register" className="text-blue-400 hover:underline">
              Register
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
