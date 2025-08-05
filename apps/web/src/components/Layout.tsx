// src/components/Layout.tsx
import React, { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { PlusIcon, MenuIcon, SettingsIcon, ArrowLeftIcon, Trash2Icon, BrainIcon } from "lucide-react";
import { Button, ConfirmationModal } from "@ai-tutor/ui";
import { ScrollArea } from "@ai-tutor/ui";
import { SimpleThemeToggle } from "@ai-tutor/ui";
import { cn } from "@ai-tutor/utils";
import { lessonsApi } from "@ai-tutor/api-client";
import { ASSET_IMAGES } from "@/assets/asset";
import type { Lesson } from "@ai-tutor/types";

interface LayoutProps {
  children: React.ReactNode;
}


const Layout: React.FC<LayoutProps> = ({ children }) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [lessonToDelete, setLessonToDelete] = useState<Lesson | null>(null);
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  
  // Auto-hide sidebar on settings page for desktop
  const isSettingsPage = location.pathname === '/settings';
  const shouldHideSidebar = isSettingsPage;
  const [forceHideSidebar, setForceHideSidebar] = useState(shouldHideSidebar);
  
  React.useEffect(() => {
    if (shouldHideSidebar) {
      setForceHideSidebar(true);
      setSidebarOpen(false);
    } else {
      setForceHideSidebar(false);
    }
  }, [shouldHideSidebar]);

  const { data: lessons = [], isLoading } = useQuery({
    queryKey: ["lessons"],
    queryFn: () => lessonsApi.getAll(),
    refetchOnWindowFocus: false,
  });


  const deleteLessonMutation = useMutation({
    mutationFn: (id: string) => lessonsApi.deleteLesson(id),
    onSuccess: (_, deletedLessonId) => {
      queryClient.invalidateQueries({ queryKey: ["lessons"] });
      
      // Check if we're currently viewing the deleted lesson
      const currentLessonId = location.pathname.split('/lesson/')[1];
      if (currentLessonId === deletedLessonId) {
        // Redirect to homepage if we're viewing the deleted lesson
        navigate('/');
      }
      
      setDeleteModalOpen(false);
      setLessonToDelete(null);
    },
    onError: (error) => {
      console.error("Error deleting lesson:", error);
    },
  });


  const handleDeleteStart = (lesson: Lesson) => {
    setLessonToDelete(lesson);
    setDeleteModalOpen(true);
  };

  const handleDeleteConfirm = () => {
    if (lessonToDelete?.id) {
      deleteLessonMutation.mutate(lessonToDelete.id);
    }
  };


  return (
    <div className="flex h-screen bg-background font-body overflow-hidden">
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
          "fixed inset-y-0 left-0 z-50 w-64 bg-card border-r shadow-lg transform transition-transform duration-300 ease-in-out flex flex-col",
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
            <div className="bg-white rounded-lg p-1 border border-gray-200">
              <img src={ASSET_IMAGES.logoIcon} alt="logo" className="h-8 w-8" />
            </div>
            <h1 className="text-xl font-bold font-heading text-foreground">
              AI Tutor
            </h1>
          </div>
        </div>

        {/* Sidebar Content */}
        <div className="flex flex-col flex-1 min-h-0 p-4">
          <Link to="/">
            <Button className="w-full mb-6 font-medium" variant="default">
              <PlusIcon className="h-4 w-4 mr-2" />
              New AI Lesson
            </Button>
          </Link>

          {/* Lesson History */}
          <div className="flex-1 min-h-0">
            <h3 className="text-caption text-muted-foreground mb-3">
              Recent Lessons
            </h3>
            <ScrollArea className="h-full">
              <div className="space-y-2 pr-2">
                {isLoading ? (
                  <div className="text-body-small text-muted-foreground">
                    Loading lessons...
                  </div>
                ) : lessons.length > 0 ? (
                  lessons.map((lesson) => (
                    <div
                      key={lesson.id}
                      className={cn(
                        "group relative flex items-center px-3 py-2 mx-2 rounded-lg transition-all duration-200 font-body",
                        "hover:bg-accent/50",
                        location.pathname === `/lesson/${lesson.id}`
                          ? "bg-accent text-accent-foreground"
                          : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      <div className="flex items-center justify-between w-full">
                        <Link
                          to={`/lesson/${lesson.id}`}
                          className="flex-1 min-w-0 group-hover:text-foreground"
                        >
                          <div className="flex-1 min-w-0">
                            <span className="truncate font-medium text-xs block leading-tight">
                              {lesson.title || lesson.topic}
                            </span>
                            <div className="text-xs text-muted-foreground mt-1 font-body">
                              {new Date(lesson.created_at).toLocaleDateString()}
                            </div>
                          </div>
                        </Link>
                        
                        <div className="flex items-center ml-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-accent rounded-md"
                            onClick={(e) => {
                              e.preventDefault();
                              handleDeleteStart(lesson);
                            }}
                          >
                            <Trash2Icon className="h-3 w-3 text-muted-foreground hover:text-destructive" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-body-small text-muted-foreground">
                    No lessons yet
                  </div>
                )}
              </div>
            </ScrollArea>
          </div>

          {/* Navigation Links */}
          <div className="mt-4 pt-4 border-t flex-shrink-0 space-y-2">
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
            
            {/* Templates route hidden from navigation */}
            
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 min-h-0">
        {/* Mobile Header */}
        <div className={cn(
          "flex items-center h-16 px-4 bg-card border-b flex-shrink-0",
          shouldHideSidebar ? "" : "lg:hidden"
        )}>
          <div className="flex items-center space-x-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                if (shouldHideSidebar) {
                  navigate('/');
                } else {
                  setSidebarOpen(true);
                }
              }}
            >
              {shouldHideSidebar ? (
                <ArrowLeftIcon className="h-5 w-5" />
              ) : (
                <MenuIcon className="h-5 w-5" />
              )}
            </Button>
            <div className="bg-white rounded-lg p-1 border border-gray-200">
              <img src={ASSET_IMAGES.logoIcon} alt="logo" className="h-8 w-8" />
            </div>
            <h1 className="text-xl font-bold font-heading text-foreground">
              AI Tutor
            </h1>
          </div>
        </div>

        {/* Page Content */}
        <main className="flex-1 bg-background overflow-y-auto">{children}</main>
      </div>

      {/* Delete Confirmation Modal */}
      <ConfirmationModal
        isOpen={deleteModalOpen}
        onClose={() => setDeleteModalOpen(false)}
        onConfirm={handleDeleteConfirm}
        title="Delete Lesson"
        description={`Are you sure you want to delete "${lessonToDelete?.title || lessonToDelete?.topic}"? This action cannot be undone.`}
        confirmText="Delete"
        cancelText="Cancel"
        variant="destructive"
        isLoading={deleteLessonMutation.isPending}
      />
    </div>
  );
};

export default Layout;
