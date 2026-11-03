"use client";

import { signOut, useSession } from "next-auth/react";

/** Signed-in account + sign-out, shown at the bottom of the sidebar. */
export function UserMenu() {
  const { data } = useSession();
  const user = data?.user;
  if (!user) return null;

  const label = user.name || user.email || "Signed in";
  return (
    <div className="flex items-center gap-2 border-t border-hairline px-3 py-3">
      {user.image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={user.image} alt="" className="h-7 w-7 rounded-full" />
      ) : (
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-paper text-xs font-semibold text-ink">
          {label.charAt(0).toUpperCase()}
        </span>
      )}
      <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-ink">
        {label}
      </span>
      <button
        className="btn-ghost !px-2 !py-1 text-xs"
        onClick={() => signOut({ redirectTo: "/signin" })}
      >
        Sign out
      </button>
    </div>
  );
}
