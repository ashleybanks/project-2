import { useState, useRef, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useSession, signOut } from "../lib/auth-client";

export default function TopNav() {
  const { data: session } = useSession();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const user = session?.user;
  const initials = user?.name
    ? user.name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase()
    : (user?.email?.[0]?.toUpperCase() ?? "?");

  async function handleSignOut() {
    await signOut();
    navigate("/sign-in");
  }

  return (
    <header className="h-14 border-b border-border bg-white flex items-center px-6 shrink-0 z-30">
      <Link
        to="/app/templates"
        className="font-semibold text-2xl tracking-tight text-foreground hover:opacity-70 transition-opacity"
      >
        Tessia
      </Link>

      <div className="ml-auto relative" ref={menuRef}>
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-2 pl-2 pr-1 py-1 rounded-md hover:bg-zinc-100 transition-colors"
        >
          <span className="text-base text-muted-foreground hidden sm:block max-w-[180px] truncate">
            {user?.name || user?.email}
          </span>
          <div className="w-8 h-8 rounded-full bg-zinc-200 text-zinc-600 flex items-center justify-center text-base font-semibold shrink-0">
            {initials}
          </div>
        </button>

        {open && (
          <div className="absolute right-0 top-full mt-1 w-52 bg-white border border-border rounded-lg shadow-lg py-1 z-50">
            <button
              onClick={() => { navigate("/app/settings/account"); setOpen(false); }}
              className="w-full text-left px-3 py-1.5 text-sm hover:bg-zinc-50 transition-colors"
            >
              Account settings
            </button>
            <button
              onClick={() => { navigate("/app/stylesheets"); setOpen(false); }}
              className="w-full text-left px-3 py-1.5 text-sm hover:bg-zinc-50 transition-colors"
            >
              Brand rules
            </button>
            <div className="border-t border-border mt-1 pt-1">
              <button
                onClick={handleSignOut}
                className="w-full text-left px-3 py-1.5 text-sm text-muted-foreground hover:bg-zinc-50 transition-colors"
              >
                Sign out
              </button>
            </div>
          </div>
        )}
      </div>
    </header>
  );
}
