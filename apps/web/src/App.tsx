import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import ProtectedRoute from "./components/ProtectedRoute";
import AppLayout from "./components/AppLayout";
import SignIn from "./pages/SignIn";
import SignUp from "./pages/SignUp";
import HomePage from "./pages/HomePage";
import VerifyEmailError from "./pages/VerifyEmailError";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import ResetPasswordError from "./pages/ResetPasswordError";
import Dashboard from "./pages/Dashboard";
import TemplateListPage from "./pages/TemplateListPage";
import NewTemplatePage from "./pages/NewTemplatePage";
import TemplatePage from "./pages/TemplatePage";
import StylesheetsPage from "./pages/StylesheetsPage";
import MfaSettingsPage from "./pages/MfaSettingsPage";
import AccountSettingsPage from "./pages/AccountSettingsPage";

const queryClient = new QueryClient();

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/sign-in" element={<SignIn />} />
          <Route path="/sign-up" element={<SignUp />} />
          <Route path="/verify-email/error" element={<VerifyEmailError />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/reset-password/error" element={<ResetPasswordError />} />
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
                  <Route path="settings/account" element={<AccountSettingsPage />} />
                  <Route path="settings/mfa" element={<MfaSettingsPage />} />
                  <Route path="*" element={<Navigate to="/app/templates" replace />} />
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
