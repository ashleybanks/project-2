import { Navigate, useLocation } from "react-router-dom";
import { useSession } from "../lib/auth-client";

interface Props {
  children: React.ReactNode;
}

export default function ProtectedRoute({ children }: Props) {
  const { data: session, isPending } = useSession();
  const location = useLocation();

  if (isPending) return null; // avoid flash of redirect while session loads

  if (!session?.user) {
    return <Navigate to={`/sign-in?redirect=${encodeURIComponent(location.pathname)}`} replace />;
  }

  return <>{children}</>;
}
