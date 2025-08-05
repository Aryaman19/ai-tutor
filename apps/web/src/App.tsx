import React from "react";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Outlet,
} from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";

import { ThemeProvider } from "@ai-tutor/hooks";
import Layout from "./components/Layout";
import Home from "./pages/Home";
import Lesson from "./pages/Lesson";
import Settings from "./pages/Settings";
import TemplateTest from "./pages/TemplateTest";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

// Layout wrapper that renders child routes
const AppLayout: React.FC = () => (
  <Layout>
    <Outlet />
  </Layout>
);

function App() {
  return (
    <ThemeProvider defaultTheme="system" storageKey="ai-tutor-theme">
      <QueryClientProvider client={queryClient}>
        <Router>
          <div className="h-screen bg-background transition-colors overflow-hidden">
            <Routes>
              {/* Routes with layout */}
              <Route path="/" element={<AppLayout />}>
                <Route index element={<Home />} />
                <Route path="lesson/:id" element={<Lesson />} />
                <Route path="settings" element={<Settings />} />
                {/* <Route path="templates" element={<TemplateTest />} /> */}
                <Route path="*" element={<NotFound />} />
              </Route>
            </Routes>
            <Toaster />
          </div>
        </Router>
      </QueryClientProvider>
    </ThemeProvider>
  );
}

export default App;
