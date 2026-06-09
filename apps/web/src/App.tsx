import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import ProtectedRoute from "./components/ProtectedRoute";
import AppLayout from "./components/AppLayout";
import SignIn from "./pages/SignIn";
import SignUp from "./pages/SignUp";
import Dashboard from "./pages/Dashboard";
import TemplateListPage from "./pages/TemplateListPage";
import NewTemplatePage from "./pages/NewTemplatePage";
import TemplatePage from "./pages/TemplatePage";
import StylesheetsPage from "./pages/StylesheetsPage";

const queryClient = new QueryClient();

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/sign-in" element={<SignIn />} />
          <Route path="/sign-up" element={<SignUp />} />
          <Route
            path="/app/*"
            element={
              <ProtectedRoute>
              <AppLayout>
                <Routes>
                  <Route path="dashboard" element={<Dashboard />} />
                  <Route path="templates" element={<TemplateListPage />} />
                  <Route path="templates/new" element={<NewTemplatePage />} />
                  <Route path="templates/:id" element={<TemplatePage />} />
                  <Route path="stylesheets" element={<StylesheetsPage />} />
                </Routes>
              </AppLayout>
              </ProtectedRoute>
            }
          />
          <Route path="*" element={<Navigate to="/sign-in" replace />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
