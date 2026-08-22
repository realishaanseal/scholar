"use client";

import { signOut } from "next-auth/react";

export default function SignOutButton() {
  return (
    <button onClick={() => signOut({ callbackUrl: "/login" })} className="btn-ghost px-3.5 py-2 text-xs">
      Sign out
    </button>
  );
}
