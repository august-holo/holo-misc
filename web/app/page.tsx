"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "react-oidc-context";
import styles from "./page.module.css";

type Me = { sub: string; username: string | null };

export default function Home() {
  const auth = useAuth();
  const token = auth.user?.access_token;
  const [me, setMe] = useState<Me | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    const controller = new AbortController();
    fetch("/api/me", {
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
    })
      .then((res) => {
        if (!res.ok) throw new Error(`API responded ${res.status}`);
        return res.json();
      })
      .then(setMe)
      .catch((e: Error) => {
        if (e.name !== "AbortError") setError(e.message);
      });
    return () => controller.abort();
  }, [token]);

  const signOut = async () => {
    await auth.removeUser();
    const params = new URLSearchParams({
      client_id: process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID!,
      logout_uri: `${window.location.origin}/`,
    });
    // Cognito's hosted logout endpoint, which also ends the session on its side.
    window.location.href = new URL(
      `/logout?${params}`,
      process.env.NEXT_PUBLIC_COGNITO_DOMAIN,
    ).toString();
  };

  return (
    <main className={styles.main}>
      <h1>holo-misc</h1>
      <Link href="/solarpunk-terrarium">Solarpunk terrarium</Link>

      {auth.isLoading && <p>Loading…</p>}
      {auth.error && <p className={styles.error}>Sign-in failed: {auth.error.message}</p>}

      {!auth.isLoading && !auth.isAuthenticated && (
        <button className={styles.button} onClick={() => auth.signinRedirect()}>
          Sign in
        </button>
      )}

      {auth.isAuthenticated && (
        <>
          <p>Signed in as {auth.user?.profile.email}</p>
          {me && (
            <p className={styles.detail}>
              API sees you as <code>{me.sub}</code>
            </p>
          )}
          {error && <p className={styles.error}>{error}</p>}
          <button className={styles.button} onClick={signOut}>
            Sign out
          </button>
        </>
      )}
    </main>
  );
}
