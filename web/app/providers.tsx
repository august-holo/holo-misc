"use client";

import { AuthProvider } from "react-oidc-context";

const origin = typeof window === "undefined" ? "" : window.location.origin;

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider
      authority={process.env.NEXT_PUBLIC_COGNITO_AUTHORITY!}
      client_id={process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID!}
      redirect_uri={`${origin}/`}
      response_type="code"
      scope="openid email profile"
      onSigninCallback={() => {
        // Drop ?code=&state= from the address bar once the sign-in has completed.
        window.history.replaceState({}, document.title, window.location.pathname);
      }}
    >
      {children}
    </AuthProvider>
  );
}
