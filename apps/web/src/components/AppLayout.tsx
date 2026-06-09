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
