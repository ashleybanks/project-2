import TopNav from "./TopNav";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-screen flex flex-col overflow-hidden bg-background">
      <TopNav />
      <div className="flex-1 min-h-0 flex flex-col">
        {children}
      </div>
    </div>
  );
}

export function PageContainer({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className="flex-1 overflow-auto">
      <div className={`max-w-4xl mx-auto px-8 py-10 ${className ?? ""}`}>
        {children}
      </div>
    </div>
  );
}
