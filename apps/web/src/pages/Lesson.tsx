import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  PlayIcon,
  BookOpenIcon,
  MapIcon,
  FileQuestion,
  Loader2Icon,
  AlertCircleIcon,
  WandIcon,
} from "lucide-react";
import { Button } from "@ai-tutor/ui";
import { Card, CardHeader, CardTitle, CardContent } from "@ai-tutor/ui";
import { cn, getApiUrl } from "@ai-tutor/utils";
import { lessonsApi } from "@ai-tutor/api-client";
import type { Lesson, GenerationStatus } from "@ai-tutor/types";
import { EditableTitle } from "../components/EditableTitle";
import { MultiSlideCanvasPlayer } from "../components/MultiSlideCanvasPlayer";

type ViewMode = "video" | "notes" | "mindmap" | "quiz";


const Lesson: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [viewMode, setViewMode] = useState<ViewMode>("video");
  const queryClient = useQueryClient();

  // Create a unique instance ID to prevent cross-component interference
  const [instanceId] = useState(() => `lesson-${id}-${Date.now()}`);

  // Fetch lesson data - removed global polling to prevent cross-lesson interference
  const {
    data: lesson,
    isLoading: isLoadingLesson,
    error: lessonError,
    refetch: refetchLesson,
  } = useQuery({
    queryKey: ["lesson", id],
    queryFn: () => lessonsApi.getById(id!),
    enabled: !!id,
    staleTime: 0, // Always fetch fresh data for lessons to prevent stale state issues
    retry: (failureCount, error) => {
      // Don't retry on 404 errors (lesson not found)
      if ((error as any)?.response?.status === 404) {
        return false;
      }
      return failureCount < 3;
    },
  });

  // Generate lesson content mutation
  const generateContentMutation = useMutation({
    mutationKey: ["generateContent", id], // Add lesson-specific mutation key
    mutationFn: (lessonId: string) =>
      fetch(getApiUrl(`/api/lesson/${lessonId}/generate`), { method: "POST" }).then(
        (res) => {
          if (!res.ok) throw new Error("Failed to generate lesson content");
          return res.json();
        }
      ),
    onSuccess: async () => {
      // Force immediate refetch to get updated lesson data
      await refetchLesson();
      // Invalidate lessons list to show updated status
      queryClient.invalidateQueries({ queryKey: ["lessons"] });
      // Specifically invalidate this lesson's cache to ensure fresh data
      queryClient.invalidateQueries({ queryKey: ["lesson", id], exact: true });
    },
    retry: false, // Disable retries to prevent infinite loops on timeout
  });

  // Generate lesson script mutation
  const generateScriptMutation = useMutation({
    mutationKey: ["generateScript", id], // Add lesson-specific mutation key
    mutationFn: (lessonId: string) =>
      fetch(getApiUrl(`/api/lesson/${lessonId}/generate-script`), { method: "POST" }).then(
        (res) => {
          if (!res.ok) throw new Error("Failed to generate script");
          return res.json();
        }
      ),
    onSuccess: async () => {
      await refetchLesson();
      queryClient.invalidateQueries({ queryKey: ["lessons"] });
    },
  });

  // Update lesson title mutation
  const updateTitleMutation = useMutation({
    mutationKey: ["updateTitle", id], // Add lesson-specific mutation key
    mutationFn: ({ lessonId, title }: { lessonId: string; title: string }) =>
      lessonsApi.updateLesson(lessonId, { title }),
    onSuccess: async () => {
      await refetchLesson();
      queryClient.invalidateQueries({ queryKey: ["lessons"] });
    },
  });

  // Auto-generate content if lesson exists with pending status
  useEffect(() => {
    if (
      lesson &&
      lesson.generation_status === "pending" &&
      !generateContentMutation.isPending
    ) {
      generateContentMutation.mutate(lesson.id!);
    }
  }, [lesson?.id, lesson?.generation_status]); // Use generation_status instead of slides length

  // Component-specific polling for generating lessons
  useEffect(() => {
    let pollInterval: NodeJS.Timeout | null = null;

    // Only poll if current lesson is generating AND this component is active
    if (lesson?.generation_status === "generating" && id === lesson.id) {

      pollInterval = setInterval(async () => {
        try {
          const result = await refetchLesson();

          // Stop polling if lesson is no longer generating
          if (result.data?.generation_status !== "generating") {
            if (pollInterval) {
              clearInterval(pollInterval);
            }
          }
        } catch (error) {
          console.error(
            `[${instanceId}] Polling error for lesson ${id}:`,
            error
          );
        }
      }, 2000); // Poll every 2 seconds
    }

    // Cleanup function
    return () => {
      if (pollInterval) {
        clearInterval(pollInterval);
      }
    };
  }, [lesson?.generation_status, lesson?.id, id, refetchLesson]); // Dependencies to restart polling when needed

  // Improved loading state logic using generation_status
  const isGeneratingContent =
    lesson?.generation_status === "generating" ||
    (lesson?.generation_status === "pending" &&
      generateContentMutation.isPending);
  const isGeneratingScript = generateScriptMutation.isPending;
  const hasNarrationContent = lesson?.slides?.some((slide) => slide.narration);
  const hasGenerationError = lesson?.generation_status === "failed";
  const isContentReady =
    lesson?.generation_status === "completed" && lesson.slides.length > 0;

  // Debug logging to understand lesson state
  useEffect(() => {
  }, [
    lesson,
    hasNarrationContent,
    isGeneratingContent,
    hasGenerationError,
    isContentReady,
    instanceId,
    id,
  ]);

  // Cleanup on component unmount to prevent memory leaks
  useEffect(() => {
    return () => {
      // Cancel any pending queries for this lesson to prevent stale updates
      queryClient.cancelQueries({ queryKey: ["lesson", id] });
    };
  }, [id, queryClient, instanceId]);

  // Check if lesson was deleted or not found
  const isLessonNotFound = (lessonError as any)?.response?.status === 404;

  // Redirect to homepage if lesson is not found
  useEffect(() => {
    if (isLessonNotFound) {
      setTimeout(() => {
        navigate("/");
      }, 3000); // Redirect after 3 seconds
    }
  }, [isLessonNotFound, navigate]);

  const handleTitleSave = (newTitle: string) => {
    if (id && newTitle.trim()) {
      updateTitleMutation.mutate({ lessonId: id, title: newTitle });
    }
  };

  const handleGenerateScript = () => {
    if (id) {
      generateScriptMutation.mutate(id);
    }
  };

  const handleRetryGeneration = () => {
    if (id) {
      generateContentMutation.mutate(id);
    }
  };

  const viewTabs = [
    { id: "video", label: "Video", icon: PlayIcon },
    { id: "notes", label: "Notes", icon: BookOpenIcon },
    { id: "mindmap", label: "Mindmap", icon: MapIcon },
    { id: "quiz", label: "Quiz", icon: FileQuestion },
  ];

  return (
    <div className="flex flex-col bg-background">
      {/* Header Section */}
      <div className="border-b border-border bg-card px-6 h-16 flex items-center flex-shrink-0">
        <div className="max-w-6xl mx-auto w-full">
          {isLessonNotFound ? (
            <div className="flex items-center space-x-3">
              <AlertCircleIcon className="h-8 w-8 text-destructive" />
              <h1 className="text-xl font-bold text-destructive">
                Lesson Not Found
              </h1>
            </div>
          ) : isLoadingLesson ? (
            <div className="flex items-center space-x-3">
              <Loader2Icon className="h-8 w-8 animate-spin text-primary" />
              <h1 className="text-xl font-bold text-muted-foreground">
                Loading lesson...
              </h1>
            </div>
          ) : (
            <EditableTitle
              title={lesson?.title || lesson?.topic || "Untitled Lesson"}
              onSave={handleTitleSave}
              isLoading={updateTitleMutation.isPending}
              placeholder="Enter lesson title..."
            />
          )}
        </div>
      </div>

      {/* View Mode Tabs */}
      <div className="border-b border-border bg-card px-6 py-3 flex-shrink-0">
        <div className="max-w-6xl mx-auto">
          <div className="flex space-x-1">
            {viewTabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setViewMode(tab.id as ViewMode)}
                  className={cn(
                    "flex items-center space-x-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors font-body",
                    viewMode === tab.id
                      ? "bg-primary/10 text-primary border border-primary/20"
                      : "text-muted-foreground hover:text-foreground hover:bg-accent"
                  )}
                >
                  <Icon className="h-4 w-4" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-h-0">
        {/* Content Area */}
        <div className="flex-1 overflow-y-auto">
          <div className="p-6 bg-background">
            <div className="max-w-6xl mx-auto">
              {isLessonNotFound ? (
                <Card className="border-destructive/20 bg-destructive/5">
                  <CardContent className="p-8">
                    <div className="flex flex-col items-center justify-center space-y-6 text-center">
                      <div>
                        <p className="text-muted-foreground mb-4">
                          The lesson you're looking for has been deleted or
                          doesn't exist.
                        </p>
                        <p className="text-sm text-muted-foreground">
                          Redirecting to homepage in 3 seconds...
                        </p>
                      </div>
                      <Button onClick={() => navigate("/")} className="mt-4">
                        Go to Homepage
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ) : (
                <>
                  {/* Video View - Always render to preserve component state */}
                  <div className={viewMode === "video" ? "block" : "hidden"}>
                    {isLoadingLesson ? (
                      <div className="flex items-center justify-center py-12">
                        <Loader2Icon className="h-8 w-8 animate-spin text-primary" />
                        <span className="ml-2 text-lg">
                          Loading lesson content...
                        </span>
                      </div>
                    ) : isGeneratingContent ? (
                      <Card className="border-border">
                        <CardContent className="p-8">
                          <div className="flex flex-col items-center justify-center space-y-6 text-center">
                            <div className="flex items-center space-x-3">
                              <Loader2Icon className="h-8 w-8 animate-spin text-primary" />
                              <span className="text-xl font-semibold">
                                Generating lesson content...
                              </span>
                            </div>
                            <div className="max-w-md">
                              <p className="text-muted-foreground mb-4">
                                Our AI is creating personalized content for "
                                {lesson?.topic}" just for you.
                              </p>
                              <div className="flex justify-center space-x-2">
                                <div
                                  className="animate-bounce h-2 w-2 bg-primary rounded-full"
                                  style={{ animationDelay: "0ms" }}
                                ></div>
                                <div
                                  className="animate-bounce h-2 w-2 bg-primary rounded-full"
                                  style={{ animationDelay: "150ms" }}
                                ></div>
                                <div
                                  className="animate-bounce h-2 w-2 bg-primary rounded-full"
                                  style={{ animationDelay: "300ms" }}
                                ></div>
                              </div>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ) : hasGenerationError ? (
                      <Card className="border-destructive/20 bg-destructive/5">
                        <CardContent className="p-8">
                          <div className="flex flex-col items-center justify-center space-y-6 text-center">
                            <div className="flex items-center space-x-3">
                              <AlertCircleIcon className="h-8 w-8 text-destructive" />
                              <span className="text-xl font-semibold text-destructive">
                                Generation Failed
                              </span>
                            </div>
                            <div className="max-w-md">
                              <p className="text-muted-foreground mb-4">
                                {lesson?.generation_error ||
                                  "Failed to generate lesson content. Please try again."}
                              </p>
                              <Button
                                onClick={handleRetryGeneration}
                                disabled={generateContentMutation.isPending}
                                className="mt-4"
                              >
                                {generateContentMutation.isPending ? (
                                  <>
                                    <Loader2Icon className="h-4 w-4 mr-2 animate-spin" />
                                    Retrying...
                                  </>
                                ) : (
                                  <>
                                    <WandIcon className="h-4 w-4 mr-2" />
                                    Retry Generation
                                  </>
                                )}
                              </Button>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ) : isGeneratingScript ? (
                      <Card className="border-border">
                        <CardContent className="p-8">
                          <div className="flex flex-col items-center justify-center space-y-6 text-center">
                            <div className="flex items-center space-x-3">
                              <Loader2Icon className="h-8 w-8 animate-spin text-primary" />
                              <span className="text-xl font-semibold">
                                Generating interactive script...
                              </span>
                            </div>
                            <div className="max-w-md">
                              <p className="text-muted-foreground mb-4">
                                Creating an interactive visual lesson with
                                narration and drawings for "{lesson?.topic}".
                              </p>
                              <div className="flex justify-center space-x-2">
                                <div
                                  className="animate-bounce h-2 w-2 bg-primary rounded-full"
                                  style={{ animationDelay: "0ms" }}
                                ></div>
                                <div
                                  className="animate-bounce h-2 w-2 bg-primary rounded-full"
                                  style={{ animationDelay: "150ms" }}
                                ></div>
                                <div
                                  className="animate-bounce h-2 w-2 bg-primary rounded-full"
                                  style={{ animationDelay: "300ms" }}
                                ></div>
                              </div>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ) : isContentReady ? (
                      <div className="space-y-4">
                        <Card className="border-border">
                          <CardHeader>
                            <CardTitle className="text-card-foreground font-heading">
                              Interactive Lesson Player
                            </CardTitle>
                          </CardHeader>
                          <CardContent className="">
                            <div className="h-[700px] relative">
                              <MultiSlideCanvasPlayer
                                key={`lesson-${lesson.id}-${
                                  lesson.slides?.length || 0
                                }`} // Force re-render when slides change
                                slides={lesson.slides}
                                existingAudioSegments={lesson.audio_segments}
                                mergedAudioUrl={lesson.merged_audio_url}
                                autoPlay={false}
                                showControls={true}
                                enableAudio={true}
                                onSlideChange={(slideIndex: number) => {
                                  // Slide changed
                                }}
                                onPlaybackStart={() => {
                                  // Playback started
                                }}
                                onPlaybackEnd={() => {
                                  // Lesson completed
                                }}
                                onError={(error: Error) => {
                                  console.error("Lesson player error:", error);
                                }}
                                className="w-full h-full"
                                testMode={false}
                              />
                            </div>
                          </CardContent>
                        </Card>
                      </div>
                    ) : lesson?.slides && lesson.slides.length > 0 ? (
                      <div className="space-y-4">
                        <Card className="border-border">
                          <CardContent className="p-6">
                            <div className="flex items-center justify-between mb-4">
                              <h3 className="text-lg font-semibold">
                                Lesson Content
                              </h3>
                              <Button
                                onClick={handleGenerateScript}
                                disabled={generateScriptMutation.isPending}
                                size="sm"
                                variant="outline"
                              >
                                <WandIcon className="h-4 w-4 mr-2" />
                                Generate Interactive Script
                              </Button>
                            </div>
                            <p className="text-sm text-muted-foreground mb-4">
                              This lesson has basic content. Generate an
                              interactive script with narration and visual
                              elements for a better learning experience.
                            </p>
                          </CardContent>
                        </Card>
                        <Card className="border-border">
                          <CardContent className="p-6">
                            <div className="space-y-6">
                              {lesson.slides.map((slide, index) => (
                                <div
                                  key={index}
                                  className="border-l-4 border-primary pl-6 py-4"
                                >
                                  <h3 className="font-semibold text-lg mb-3">
                                    Slide {slide.slide_number}:{" "}
                                    {slide.content_type}
                                  </h3>
                                  <div className="text-muted-foreground whitespace-pre-wrap leading-relaxed">
                                    {slide.narration || "No content available"}
                                  </div>
                                  <div className="text-xs text-muted-foreground mt-2">
                                    Template: {slide.template_name} | Duration:{" "}
                                    {slide.estimated_duration}s
                                  </div>
                                </div>
                              ))}
                            </div>
                          </CardContent>
                        </Card>
                      </div>
                    ) : (
                      <Card className="border-border">
                        <CardContent className="p-8">
                          <div className="flex flex-col items-center justify-center space-y-6 text-center">
                            <div>
                              <p className="text-muted-foreground mb-4">
                                No lesson content available yet.
                              </p>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    )}
                  </div>

                  {viewMode === "notes" && !isLessonNotFound && (
                    <Card className="bg-card border-border h-full flex flex-col">
                      <CardHeader className="flex-shrink-0">
                        <CardTitle className="text-card-foreground font-heading">
                          Lesson Notes
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="flex-1 overflow-y-auto">
                        <div className="flex flex-col items-center justify-center py-16 text-center">
                          <div className="w-20 h-20 bg-muted rounded-full flex items-center justify-center mb-6">
                            <BookOpenIcon className="h-10 w-10 text-muted-foreground" />
                          </div>
                          <h3 className="text-xl font-semibold text-foreground mb-3">
                            Coming in Future
                          </h3>
                          <p className="text-muted-foreground max-w-md leading-relaxed">
                            We're working on enhanced note-taking features with AI-powered summaries, 
                            key concepts extraction, and interactive study materials.
                          </p>
                          <div className="mt-6 px-4 py-2 bg-primary/10 rounded-lg border border-primary/20">
                            <p className="text-primary text-sm font-medium">
                              🚀 Stay tuned for updates!
                            </p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {viewMode === "mindmap" && !isLessonNotFound && (
                    <Card className="bg-card border-border h-full flex flex-col">
                      <CardHeader className="flex-shrink-0">
                        <CardTitle className="text-card-foreground font-heading">
                          Concept Mindmap
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="flex-1 overflow-y-auto">
                        <div className="flex flex-col items-center justify-center py-16 text-center">
                          <div className="w-20 h-20 bg-muted rounded-full flex items-center justify-center mb-6">
                            <MapIcon className="h-10 w-10 text-muted-foreground" />
                          </div>
                          <h3 className="text-xl font-semibold text-foreground mb-3">
                            Coming in Future
                          </h3>
                          <p className="text-muted-foreground max-w-md leading-relaxed">
                            We're developing intelligent mindmaps that will visualize concept relationships, 
                            dependencies, and knowledge connections for better understanding.
                          </p>
                          <div className="mt-6 px-4 py-2 bg-primary/10 rounded-lg border border-primary/20">
                            <p className="text-primary text-sm font-medium">
                              🧠 Interactive visual learning coming soon!
                            </p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {viewMode === "quiz" && !isLessonNotFound && (
                    <Card className="bg-card border-border h-full flex flex-col">
                      <CardHeader className="flex-shrink-0">
                        <CardTitle className="text-card-foreground font-heading">
                          Practice Quiz
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="flex-1 overflow-y-auto">
                        <div className="flex flex-col items-center justify-center py-16 text-center">
                          <div className="w-20 h-20 bg-muted rounded-full flex items-center justify-center mb-6">
                            <FileQuestion className="h-10 w-10 text-muted-foreground" />
                          </div>
                          <h3 className="text-xl font-semibold text-foreground mb-3">
                            Coming in Future
                          </h3>
                          <p className="text-muted-foreground max-w-md leading-relaxed">
                            We're building adaptive quizzes with multiple question types, 
                            instant feedback, and personalized difficulty adjustment based on your progress.
                          </p>
                          <div className="mt-6 px-4 py-2 bg-primary/10 rounded-lg border border-primary/20">
                            <p className="text-primary text-sm font-medium">
                              📝 Smart assessments coming soon!
                            </p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Lesson;
