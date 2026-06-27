import { useState, useRef, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useSession, signOut } from "../lib/auth-client";
import { useTemplateNav } from "@/lib/templateNavContext";
import ParapheMark from "./ParapheMark";

export default function TopNav() {
  const { data: session } = useSession();
  const navigate = useNavigate();
  const { name: templateName, saveStatus } = useTemplateNav();
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
    ? user.name
        .split(" ")
        .map((w) => w[0])
        .slice(0, 2)
        .join("")
        .toUpperCase()
    : (user?.email?.[0]?.toUpperCase() ?? "?");

  async function handleSignOut() {
    await signOut();
    navigate("/sign-in");
  }

  return (
    <header className="h-14 border-b border-border bg-white flex items-center px-6 shrink-0 z-30">
      <div className="flex items-center gap-2.5 min-w-0">
        <Link
          to="/app/templates"
          className="flex items-center gap-2 shrink-0 group"
        >
          <ParapheMark
            className={`transition-opacity group-hover:opacity-70 ${templateName ? "w-5 h-5" : "w-6 h-6"} text-primary`}
          />
          <span
            className={`font-semibold tracking-tight transition-colors group-hover:opacity-70 ${
              templateName
                ? "text-lg text-muted-foreground"
                : "text-2xl text-foreground"
            }`}
          >
            Paraphe
          </span>
        </Link>
        {templateName && (
          <>
            <div className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
            <span className="text-base font-medium text-foreground truncate max-w-xs">
              {templateName}
            </span>
            {saveStatus !== "idle" && (
              <span className="text-xs text-muted-foreground shrink-0">
                {saveStatus === "saving" ? "Saving…" : "Saved"}
              </span>
            )}
          </>
        )}
      </div>

      <div className="ml-auto relative" ref={menuRef}>
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-2 pl-2 pr-1 py-1 rounded-md hover:bg-accent transition-colors"
        >
          <span className="text-base text-muted-foreground hidden sm:block max-w-[180px] truncate">
            {user?.name || user?.email}
          </span>
          <div className="w-8 h-8 rounded-full bg-primary/15 text-primary flex items-center justify-center text-base font-semibold shrink-0">
            {initials}
          </div>
        </button>

        {open && (
          <div className="absolute right-0 top-full mt-1 w-52 bg-white border border-border rounded-lg shadow-lg py-1 z-50">
            <button
              onClick={() => {
                navigate("/app/settings/account");
                setOpen(false);
              }}
              className="w-full text-left px-3 py-1.5 text-sm hover:bg-accent transition-colors"
            >
              Account settings
            </button>
            <button
              onClick={() => {
                navigate("/app/stylesheets");
                setOpen(false);
              }}
              className="w-full text-left px-3 py-1.5 text-sm hover:bg-accent transition-colors"
            >
              Brand rules
            </button>
            <div className="border-t border-border mt-1 pt-1">
              <button
                onClick={handleSignOut}
                className="w-full text-left px-3 py-1.5 text-sm text-muted-foreground hover:bg-accent transition-colors"
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
