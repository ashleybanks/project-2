import { createContext, useContext, useState } from "react";

interface TemplateNavState {
  name: string | null;
  saveStatus: "idle" | "saving" | "saved";
}

interface TemplateNavContextValue extends TemplateNavState {
  setTemplateNav: (
    name: string,
    saveStatus: "idle" | "saving" | "saved",
  ) => void;
  clearTemplateNav: () => void;
}

const TemplateNavContext = createContext<TemplateNavContextValue | null>(null);

export function TemplateNavProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [state, setState] = useState<TemplateNavState>({
    name: null,
    saveStatus: "idle",
  });

  function setTemplateNav(
    name: string,
    saveStatus: "idle" | "saving" | "saved",
  ) {
    setState({ name, saveStatus });
  }

  function clearTemplateNav() {
    setState({ name: null, saveStatus: "idle" });
  }

  return (
    <TemplateNavContext.Provider
      value={{ ...state, setTemplateNav, clearTemplateNav }}
    >
      {children}
    </TemplateNavContext.Provider>
  );
}

export function useTemplateNav() {
  const ctx = useContext(TemplateNavContext);
  if (!ctx)
    throw new Error("useTemplateNav must be used within TemplateNavProvider");
  return ctx;
}
