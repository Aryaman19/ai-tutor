import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  PlayIcon,
  BookOpenIcon,
  ArrowRightIcon,
  SparklesIcon,
  BrainIcon,
} from "lucide-react";
import {
  Button,
  Input,
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@ai-tutor/ui";
import { ASSET_IMAGES } from "@/assets/asset";
import { lessonsApi } from "@ai-tutor/api-client";

const Home: React.FC = () => {
  const [topic, setTopic] = useState("");
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const createLessonMutation = useMutation({
    mutationFn: (topic: string) => lessonsApi.createLesson(topic),
    onSuccess: (lesson) => {
      queryClient.invalidateQueries({ queryKey: ["lessons"] });
      navigate(`/lesson/${lesson.id}`);
    },
    onError: (error) => {
      console.error("Error creating lesson:", error);
    },
  });

  const handleGenerateELI5 = async () => {
    if (!topic.trim()) return;
    createLessonMutation.mutate(topic.trim());
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleGenerateELI5();
    }
  };

  const exampleTopics = [
    "How do computers work?",
    "Why is the sky blue?",
    "What is photosynthesis?",
    "How do airplanes fly?",
    "What are black holes?",
    "How does the internet work?",
  ];

  return (
    <div className="h-full overflow-y-auto">
      <div className="min-h-full flex flex-col items-center justify-center p-6 bg-gradient-to-br from-primary/5 via-background to-secondary/5">
      <div className="max-w-3xl w-full space-y-10">
        {/* Header */}
        <div className="text-center space-y-6">
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            Discover knowledge through personalized, interactive explanations powered by AI
          </p>
        </div>

        {/* Main Input */}
        <Card className="shadow-lg border-0 bg-card/80 backdrop-blur-sm">
          <CardContent className="p-8">
            <div className="space-y-4">
              <div className="space-y-4">
                <label className="text-lg font-semibold text-foreground">
                  What would you like to learn today?
                </label>
                <div className="space-y-3">
                  <textarea
                    value={topic}
                    onChange={(e) => setTopic(e.target.value)}
                    onKeyPress={handleKeyPress}
                    placeholder="e.g., How does photosynthesis work? Explain quantum physics in simple terms..."
                    className="w-full text-base bg-background border-2 border-border rounded-xl px-4 py-3 h-32 resize-none overflow-y-auto focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all duration-200 placeholder:text-muted-foreground"
                    disabled={createLessonMutation.isPending}
                  />
                  <Button
                    onClick={handleGenerateELI5}
                    disabled={!topic.trim() || createLessonMutation.isPending}
                    className="w-full h-14 text-base font-semibold bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 border-0 rounded-xl transition-all duration-200 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
                  >
                    {createLessonMutation.isPending ? (
                      <div className="flex items-center space-x-3">
                        <div className="animate-spin h-5 w-5 border-2 border-primary-foreground border-t-transparent rounded-full" />
                        <span>Creating your lesson...</span>
                      </div>
                    ) : (
                      <div className="flex items-center justify-center space-x-3">
                        <PlayIcon className="h-5 w-5" />
                        <span>Generate Lesson</span>
                      </div>
                    )}
                  </Button>
                </div>
              </div>

              {createLessonMutation.isPending && (
                <div className="flex items-center justify-center space-x-3 p-4 bg-primary/10 rounded-lg border border-primary/20">
                  <div className="flex space-x-1">
                    <div className="animate-bounce h-2 w-2 bg-primary rounded-full" style={{animationDelay: '0ms'}}></div>
                    <div className="animate-bounce h-2 w-2 bg-primary rounded-full" style={{animationDelay: '150ms'}}></div>
                    <div className="animate-bounce h-2 w-2 bg-primary rounded-full" style={{animationDelay: '300ms'}}></div>
                  </div>
                  <span className="text-primary font-medium">Creating your personalized lesson...</span>
                </div>
              )}
              
              {createLessonMutation.isError && (
                <div className="flex items-center justify-center space-x-3 p-4 bg-destructive/10 rounded-lg border border-destructive/20">
                  <span className="text-destructive font-medium">Failed to create lesson. Please try again.</span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>


        {/* Example Topics */}
        <div className="space-y-6">
          <h3 className="text-2xl font-bold text-foreground text-center">
            Popular Learning Topics
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {exampleTopics.map((example, index) => (
              <button
                key={index}
                onClick={() => setTopic(example)}
                className="p-4 text-left bg-card/60 backdrop-blur-sm rounded-xl border-2 border-border/50 hover:border-primary/30 hover:bg-card/80 transition-all duration-200 group transform hover:-translate-y-1 hover:shadow-lg"
                disabled={createLessonMutation.isPending}
              >
                <div className="flex items-center justify-between">
                  <span className="text-base text-foreground group-hover:text-primary font-medium transition-colors">
                    {example}
                  </span>
                  <ArrowRightIcon className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-all duration-200 transform group-hover:translate-x-1" />
                </div>
              </button>
            ))}
          </div>
        </div>

      </div>
      </div>
    </div>
  );
};

export default Home;
