import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  PlayIcon,
  PauseIcon,
  MessageCircleIcon,
  BookOpenIcon,
  BrainIcon,
  MapIcon,
  FileQuestion,
  Loader2Icon,
  AlertCircleIcon,
} from "lucide-react";
import { Button } from "@ai-tutor/ui";
import { Input } from "@ai-tutor/ui";
import { Card, CardHeader, CardTitle, CardContent } from "@ai-tutor/ui";
import { cn } from "@ai-tutor/utils";
import { lessonsApi } from "@ai-tutor/api-client";
import type { Lesson as LessonType } from "@ai-tutor/types";

type ViewMode = "video" | "notes" | "mindmap" | "quiz";

const Lesson: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [viewMode, setViewMode] = useState<ViewMode>("video");
  const [isPlaying, setIsPlaying] = useState(false);
  const [doubt, setDoubt] = useState("");
  const [doubts, setDoubts] = useState<
    Array<{ question: string; answer: string }>
  >([]);
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

  // Auto-generate content if lesson exists but has no steps
  useEffect(() => {
    if (lesson && lesson.steps.length === 0 && !generateContentMutation.isPending) {
      generateContentMutation.mutate(lesson.id!);
    }
  }, [lesson, generateContentMutation]);

  const isGeneratingContent = generateContentMutation.isPending || (lesson && lesson.steps.length === 0);

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

  const handlePlayPause = () => {
    setIsPlaying(!isPlaying);
  };

  const handleAskDoubt = () => {
    if (!doubt.trim()) return;

    // Simulate AI response
    const newDoubt = {
      question: doubt,
      answer: `Great question! Let me explain this concept step by step...`,
    };

    setDoubts([...doubts, newDoubt]);
    setDoubt("");
  };

  const viewTabs = [
    { id: "video", label: "Video", icon: PlayIcon },
    { id: "notes", label: "Notes", icon: BookOpenIcon },
    { id: "mindmap", label: "Mindmap", icon: MapIcon },
    { id: "quiz", label: "Quiz", icon: FileQuestion },
  ];

  return (
    <div className="h-full flex flex-col lg:flex-row bg-background">
      {/* Main Content Area */}
      <div className="flex-1 flex flex-col">
        {/* View Mode Tabs */}
        <div className="border-b border-border bg-card px-6 py-3">
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

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto">
          <div className="p-6 bg-background">
          {isLessonNotFound ? (
            <Card className="border-destructive/20 bg-destructive/5">
              <CardContent className="p-8">
                <div className="flex flex-col items-center justify-center space-y-6 text-center">
                  <AlertCircleIcon className="h-16 w-16 text-destructive" />
                  <div>
                    <h2 className="text-2xl font-bold text-destructive mb-2">Lesson Not Found</h2>
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
            <div className="space-y-6">
              {/* Lesson Content */}
              {isLoadingLesson ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2Icon className="h-8 w-8 animate-spin text-primary" />
                  <span className="ml-2 text-lg">Loading lesson...</span>
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
              ) : (
                <Card className="border-border">
                  <CardContent className="p-6">
                    <div className="space-y-4">
                      <h1 className="text-2xl font-bold">{lesson?.title || lesson?.topic}</h1>
                      {lesson?.steps.map((step, index) => (
                        <div key={index} className="border-l-4 border-primary pl-4 py-2">
                          <h3 className="font-semibold text-lg mb-2">{step.title}</h3>
                          <div className="text-muted-foreground whitespace-pre-wrap">{step.explanation}</div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Ask Doubt Section */}
              <Card className="bg-card border-border">
                <CardHeader>
                  <CardTitle className="flex items-center space-x-2 text-card-foreground font-heading">
                    <MessageCircleIcon className="h-5 w-5 text-primary" />
                    <span>Ask a Question</span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex space-x-2">
                    <Input
                      value={doubt}
                      onChange={(e) => setDoubt(e.target.value)}
                      placeholder="Ask anything about this lesson..."
                      className="flex-1 bg-background border-input font-body"
                      onKeyPress={(e) => e.key === "Enter" && handleAskDoubt()}
                    />
                    <Button
                      onClick={handleAskDoubt}
                      disabled={!doubt.trim()}
                      className="font-medium"
                    >
                      Ask
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {viewMode === "notes" && !isLessonNotFound && (
            <Card className="bg-card border-border">
              <CardHeader>
                <CardTitle className="text-card-foreground font-heading">
                  Lesson Notes
                </CardTitle>
              </CardHeader>
              <CardContent>
                {isGeneratingContent ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2Icon className="h-6 w-6 animate-spin text-primary mr-2" />
                    <span>Generating notes...</span>
                  </div>
                ) : lesson?.steps && lesson.steps.length > 0 ? (
                  <div className="space-y-4">
                    {lesson?.steps?.map((step, index) => (
                      <div key={index} className="border-b pb-3 last:border-b-0">
                        <h4 className="font-semibold mb-2">Step {step.step_number}: {step.title}</h4>
                        <p className="text-sm text-muted-foreground">{step.explanation}</p>
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

      {/* Doubts Sidebar */}
      <div className="w-full lg:w-80 border-l border-border bg-card">
        <div className="p-4 border-b border-border">
          <h3 className="font-semibold text-card-foreground font-heading">
            Questions & Answers
          </h3>
        </div>

        <div className="p-4 space-y-4 h-full overflow-y-auto">
          {doubts.length === 0 ? (
            <div className="text-center text-muted-foreground py-8">
              <BrainIcon className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
              <p className="font-body">No questions yet.</p>
              <p className="text-sm font-body">
                Ask anything about the lesson!
              </p>
            </div>
          ) : (
            doubts.map((doubt, index) => (
              <Card key={index} className="text-sm bg-background border-border">
                <CardContent className="p-4">
                  <div className="space-y-2">
                    <div className="font-medium text-primary font-body">
                      Q: {doubt.question}
                    </div>
                    <div className="text-foreground font-body">
                      A: {doubt.answer}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default Lesson;
