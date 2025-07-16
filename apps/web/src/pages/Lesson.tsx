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
import { cn, createComponentLogger } from "@ai-tutor/utils";
import { lessonsApi } from "@ai-tutor/api-client";
import type { Lesson as LessonType } from "@ai-tutor/types";
import { EditableTitle } from "../components/EditableTitle";
import ExcalidrawPlayer from "../components/ExcalidrawPlayer";

type ViewMode = "video" | "notes" | "mindmap" | "quiz";

const logger = createComponentLogger('Lesson');

const Lesson: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [viewMode, setViewMode] = useState<ViewMode>("video");
  const queryClient = useQueryClient();

  // Fetch lesson data
  const { data: lesson, isLoading: isLoadingLesson, error: lessonError } = useQuery({
    queryKey: ["lesson", id],
    queryFn: () => lessonsApi.getById(id!),
    enabled: !!id,
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
    mutationFn: (lessonId: string) => lessonsApi.generateLessonContent(lessonId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lesson", id] });
      queryClient.invalidateQueries({ queryKey: ["lessons"] });
    },
  });

  // Generate lesson script mutation
  const generateScriptMutation = useMutation({
    mutationFn: (lessonId: string) => 
      fetch(`/api/lesson/${lessonId}/generate-script`, { method: 'POST' })
        .then(res => {
          if (!res.ok) throw new Error('Failed to generate script');
          return res.json();
        }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lesson", id] });
      queryClient.invalidateQueries({ queryKey: ["lessons"] });
    },
  });

  // Update lesson title mutation
  const updateTitleMutation = useMutation({
    mutationFn: ({ lessonId, title }: { lessonId: string; title: string }) => 
      lessonsApi.updateLesson(lessonId, { title }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lesson", id] });
      queryClient.invalidateQueries({ queryKey: ["lessons"] });
    },
  });

  // Auto-generate content if lesson exists but has no steps
  useEffect(() => {
    if (lesson && lesson.steps.length === 0 && !generateContentMutation.isPending) {
      generateContentMutation.mutate(lesson.id!);
    }
  }, [lesson, generateContentMutation]);

  const isGeneratingContent = generateContentMutation.isPending || (lesson && lesson.steps.length === 0);
  const isGeneratingScript = generateScriptMutation.isPending;
  const hasNarrationContent = lesson?.steps?.some(step => step.narration);

  // Check if lesson was deleted or not found
  const isLessonNotFound = (lessonError as any)?.response?.status === 404;

  // Redirect to homepage if lesson is not found
  useEffect(() => {
    if (isLessonNotFound) {
      setTimeout(() => {
        navigate('/');
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

  const viewTabs = [
    { id: "video", label: "Video", icon: PlayIcon },
    { id: "notes", label: "Notes", icon: BookOpenIcon },
    { id: "mindmap", label: "Mindmap", icon: MapIcon },
    { id: "quiz", label: "Quiz", icon: FileQuestion },
  ];

  return (
    <div className="h-screen flex flex-col bg-background">
      {/* Header Section */}
      <div className="border-b border-border bg-card px-6 h-16 flex items-center flex-shrink-0">
        <div className="max-w-6xl mx-auto w-full">
          {isLessonNotFound ? (
            <div className="flex items-center space-x-3">
              <AlertCircleIcon className="h-8 w-8 text-destructive" />
              <h1 className="text-xl font-bold text-destructive">Lesson Not Found</h1>
            </div>
          ) : isLoadingLesson ? (
            <div className="flex items-center space-x-3">
              <Loader2Icon className="h-8 w-8 animate-spin text-primary" />
              <h1 className="text-xl font-bold text-muted-foreground">Loading lesson...</h1>
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
                        The lesson you're looking for has been deleted or doesn't exist.
                      </p>
                      <p className="text-sm text-muted-foreground">
                        Redirecting to homepage in 3 seconds...
                      </p>
                    </div>
                    <Button 
                      onClick={() => navigate('/')}
                      className="mt-4"
                    >
                      Go to Homepage
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ) : viewMode === "video" && (
              isLoadingLesson ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2Icon className="h-8 w-8 animate-spin text-primary" />
                  <span className="ml-2 text-lg">Loading lesson content...</span>
                </div>
              ) : isGeneratingContent ? (
                <Card className="border-border">
                  <CardContent className="p-8">
                    <div className="flex flex-col items-center justify-center space-y-6 text-center">
                      <div className="flex items-center space-x-3">
                        <Loader2Icon className="h-8 w-8 animate-spin text-primary" />
                        <span className="text-xl font-semibold">Generating lesson content...</span>
                      </div>
                      <div className="max-w-md">
                        <p className="text-muted-foreground mb-4">
                          Our AI is creating personalized content for "{lesson?.topic}" just for you.
                        </p>
                        <div className="flex justify-center space-x-2">
                          <div className="animate-bounce h-2 w-2 bg-primary rounded-full" style={{animationDelay: '0ms'}}></div>
                          <div className="animate-bounce h-2 w-2 bg-primary rounded-full" style={{animationDelay: '150ms'}}></div>
                          <div className="animate-bounce h-2 w-2 bg-primary rounded-full" style={{animationDelay: '300ms'}}></div>
                        </div>
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
                        <span className="text-xl font-semibold">Generating interactive script...</span>
                      </div>
                      <div className="max-w-md">
                        <p className="text-muted-foreground mb-4">
                          Creating an interactive visual lesson with narration and drawings for "{lesson?.topic}".
                        </p>
                        <div className="flex justify-center space-x-2">
                          <div className="animate-bounce h-2 w-2 bg-primary rounded-full" style={{animationDelay: '0ms'}}></div>
                          <div className="animate-bounce h-2 w-2 bg-primary rounded-full" style={{animationDelay: '150ms'}}></div>
                          <div className="animate-bounce h-2 w-2 bg-primary rounded-full" style={{animationDelay: '300ms'}}></div>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ) : hasNarrationContent && lesson?.steps ? (
                <div className="space-y-4">
                  <Card className="border-border">
                    <CardHeader>
                      <CardTitle className="text-card-foreground font-heading">
                        Interactive Lesson Player
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-6">
                      <ExcalidrawPlayer 
                        mode="flexible"
                        steps={lesson.steps}
                        autoPlay={false}
                        speechRate={1}
                        speechVolume={0.8}
                        userId="default"
                        onStepChange={(stepIndex) => {
                        }}
                        onComplete={() => {
                          logger.info('Lesson completed!');
                        }}
                      />
                    </CardContent>
                  </Card>
                </div>
              ) : lesson?.steps && lesson.steps.length > 0 ? (
                <div className="space-y-4">
                  <Card className="border-border">
                    <CardContent className="p-6">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-lg font-semibold">Lesson Content</h3>
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
                        This lesson has basic content. Generate an interactive script with narration and visual elements for a better learning experience.
                      </p>
                    </CardContent>
                  </Card>
                  <Card className="border-border">
                    <CardContent className="p-6">
                      <div className="space-y-6">
                        {lesson.steps.map((step, index) => (
                          <div key={index} className="border-l-4 border-primary pl-6 py-4">
                            <h3 className="font-semibold text-lg mb-3">{step.title}</h3>
                            <div className="text-muted-foreground whitespace-pre-wrap leading-relaxed">
                              {step.explanation || step.content || "No content available"}
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
              )
            )}

            {viewMode === "notes" && !isLessonNotFound && (
              <Card className="bg-card border-border h-full flex flex-col">
                <CardHeader className="flex-shrink-0">
                  <CardTitle className="text-card-foreground font-heading">
                    Lesson Notes
                  </CardTitle>
                </CardHeader>
                <CardContent className="flex-1 overflow-y-auto">
                  {isGeneratingContent ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2Icon className="h-6 w-6 animate-spin text-primary mr-2" />
                      <span>Generating notes...</span>
                    </div>
                  ) : lesson?.steps && lesson.steps.length > 0 ? (
                    <div className="space-y-6">
                      {lesson?.steps?.map((step, index) => (
                        <div key={index} className="border-b pb-4 last:border-b-0">
                          <h4 className="font-semibold mb-3 text-lg">Step {step.step_number}: {step.title}</h4>
                          <p className="text-muted-foreground leading-relaxed">
                            {step.explanation || step.content || "No content available"}
                          </p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-muted-foreground font-body">
                      No notes available yet.
                    </p>
                  )}
                </CardContent>
              </Card>
            )}

            {viewMode === "mindmap" && !isLessonNotFound && (
              <Card className="bg-card border-border">
                <CardHeader>
                  <CardTitle className="text-card-foreground font-heading">
                    Concept Mindmap
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground font-body">
                    Mindmap feature coming soon! This will show concept
                    relationships visually.
                  </p>
                </CardContent>
              </Card>
            )}

            {viewMode === "quiz" && !isLessonNotFound && (
              <Card className="bg-card border-border">
                <CardHeader>
                  <CardTitle className="text-card-foreground font-heading">
                    Practice Quiz
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground font-body">
                    Quiz feature coming soon! Test your understanding with
                    interactive questions.
                  </p>
                </CardContent>
              </Card>
            )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Lesson;
