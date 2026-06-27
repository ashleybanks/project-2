import TopNav from "./TopNav";
import { TemplateNavProvider } from "@/lib/templateNavContext";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <TemplateNavProvider>
      <div className="h-screen flex flex-col overflow-hidden bg-background">
        <TopNav />
        <div className="flex-1 min-h-0 flex flex-col">{children}</div>
      </div>
    </TemplateNavProvider>
  );
}

export function PageContainer({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className="flex-1 overflow-auto">
      <div className={`max-w-4xl mx-auto px-8 py-10 ${className ?? ""}`}>
        {children}
      </div>
    </div>
  );
}
