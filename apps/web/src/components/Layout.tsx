// src/components/Layout.tsx
import React, { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { PlusIcon, BookOpenIcon, MenuIcon, SettingsIcon, ArrowLeftIcon } from "lucide-react";
import { Button } from "@ai-tutor/ui";
import { ScrollArea } from "@ai-tutor/ui";
import { SimpleThemeToggle } from "@ai-tutor/ui";
import { cn } from "@ai-tutor/utils";
import { lessonsApi } from "@ai-tutor/api-client";
import { ASSET_IMAGES } from "@/assets/asset";

interface LayoutProps {
  children: React.ReactNode;
}

const Layout: React.FC<LayoutProps> = ({ children }) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  
  // Auto-hide sidebar on settings page for desktop
  const isSettingsPage = location.pathname === '/settings';
  const [forceHideSidebar, setForceHideSidebar] = useState(isSettingsPage);
  
  React.useEffect(() => {
    if (isSettingsPage) {
      setForceHideSidebar(true);
      setSidebarOpen(false);
    } else {
      setForceHideSidebar(false);
    }
  }, [isSettingsPage]);

  const { data: lessons = [], isLoading } = useQuery({
    queryKey: ["lessons"],
    queryFn: () => lessonsApi.getAll(),
    refetchOnWindowFocus: false,
  });

  return (
    <div className="flex bg-background font-body">
      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div
        className={cn(
          "fixed inset-y-0 left-0 z-50 w-64 bg-card border-r shadow-lg transform transition-transform duration-300 ease-in-out",
          forceHideSidebar ? "lg:-translate-x-full" : "lg:translate-x-0 lg:static lg:inset-0",
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {/* Sidebar Header */}
        <div className="flex items-center justify-between h-16 px-4 border-b">
          <div className="flex items-center space-x-2">
            <Button
              variant="ghost"
              size="sm"
              className="lg:hidden"
              onClick={() => setSidebarOpen(false)}
            >
              <MenuIcon className="h-4 w-4" />
            </Button>
            <img src={ASSET_IMAGES.logoIcon} alt="logo" className="h-8 w-8" />
            <h1 className="text-xl font-bold font-heading text-foreground">
              Xonera
            </h1>
          </div>
        </div>

        {/* Sidebar Content */}
        <div className="flex flex-col p-4">
          <Link to="/">
            <Button className="w-full mb-6 font-medium" variant="default">
              <PlusIcon className="h-4 w-4 mr-2" />
              New Lesson
            </Button>
          </Link>

          {/* Lesson History */}
          <div className="flex-1 overflow-y-auto">
            <h3 className="text-caption text-muted-foreground mb-3">
              Recent Lessons
            </h3>
            <ScrollArea className="h-[calc(100vh-16rem)]">
              <div className="space-y-2">
                {isLoading ? (
                  <div className="text-body-small text-muted-foreground">
                    Loading lessons...
                  </div>
                ) : lessons.length > 0 ? (
                  lessons.map((lesson) => (
                    <Link
                      key={lesson.id}
                      to={`/lesson/${lesson.id}`}
                      className={cn(
                        "block p-3 rounded-lg transition-colors font-body",
                        "hover:bg-accent border border-transparent",
                        location.pathname === `/lesson/${lesson.id}`
                          ? "bg-primary/10 border-primary/20 text-primary"
                          : "text-foreground hover:text-accent-foreground"
                      )}
                    >
                      <div className="flex items-center space-x-2">
                        <BookOpenIcon className="h-4 w-4 flex-shrink-0" />
                        <span className="truncate font-medium text-sm">
                          {lesson.topic}
                        </span>
                      </div>
                      <div className="text-xs text-muted-foreground mt-1 font-body">
                        {new Date(lesson.created_at).toLocaleDateString()}
                      </div>
                    </Link>
                  ))
                ) : (
                  <div className="text-body-small text-muted-foreground">
                    No lessons yet
                  </div>
                )}
              </div>
            </ScrollArea>
          </div>

          {/* Settings Link */}
          <div className="mt-4 pt-4 border-t">
            <Link
              to="/settings"
              className={cn(
                "flex items-center space-x-2 p-3 rounded-lg transition-colors font-body",
                "hover:bg-accent border border-transparent",
                location.pathname === "/settings"
                  ? "bg-primary/10 border-primary/20 text-primary"
                  : "text-foreground hover:text-accent-foreground"
              )}
            >
              <SettingsIcon className="h-4 w-4 flex-shrink-0" />
              <span className="font-medium text-sm">Settings</span>
            </Link>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile Header */}
        <div className={cn(
          "flex items-center h-16 px-4 bg-card border-b",
          isSettingsPage ? "" : "lg:hidden"
        )}>
          <div className="flex items-center space-x-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                if (isSettingsPage) {
                  navigate('/');
                } else {
                  setSidebarOpen(true);
                }
              }}
            >
              {isSettingsPage ? (
                <ArrowLeftIcon className="h-5 w-5" />
              ) : (
                <MenuIcon className="h-5 w-5" />
              )}
            </Button>
            <img src={ASSET_IMAGES.logoIcon} alt="logo" className="h-8 w-8" />
            <h1 className="text-xl font-bold font-heading text-foreground">
              Xonera
            </h1>
          </div>
        </div>

        {/* Page Content */}
        <main className="flex-1 bg-background h-full">{children}</main>
      </div>
    </div>
  );
};

export default Layout;
