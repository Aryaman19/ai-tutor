import React, { useState } from "react";
import { useParams } from "react-router-dom";
import {
  PlayIcon,
  PauseIcon,
  MessageCircleIcon,
  BookOpenIcon,
  BrainIcon,
  MapIcon,
  FileQuestion,
} from "lucide-react";
import { Button } from "@ai-tutor/ui";
import { Input } from "@ai-tutor/ui";
import { Card, CardHeader, CardTitle, CardContent } from "@ai-tutor/ui";
import { cn } from "@ai-tutor/utils";

type ViewMode = "video" | "notes" | "mindmap" | "quiz";

const Lesson: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [viewMode, setViewMode] = useState<ViewMode>("video");
  const [isPlaying, setIsPlaying] = useState(false);
  const [doubt, setDoubt] = useState("");
  const [doubts, setDoubts] = useState<
    Array<{ question: string; answer: string }>
  >([]);

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
        <div className="flex-1 p-6 bg-background">
          {viewMode === "video" && (
            <div className="space-y-6">
              {/* Video Player Placeholder */}
              <Card className="border-border">
                <CardContent className="p-0">
                  <div className="aspect-video bg-gray-900 dark:bg-gray-800 rounded-lg flex items-center justify-center relative">
                    <div className="text-center text-white space-y-4">
                      <div className="text-6xl">🧠</div>
                      <h3 className="text-xl font-semibold font-heading">
                        Understanding Quantum Physics
                      </h3>
                      <p className="text-gray-300 dark:text-gray-400 font-body">
                        Visual explanation coming soon...
                      </p>
                    </div>

                    {/* Play/Pause Button */}
                    <Button
                      onClick={handlePlayPause}
                      size="lg"
                      className="absolute bottom-4 right-4 font-medium"
                    >
                      {isPlaying ? (
                        <PauseIcon className="h-6 w-6" />
                      ) : (
                        <PlayIcon className="h-6 w-6" />
                      )}
                    </Button>
                  </div>
                </CardContent>
              </Card>

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

          {viewMode === "notes" && (
            <Card className="bg-card border-border">
              <CardHeader>
                <CardTitle className="text-card-foreground font-heading">
                  Lesson Notes
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground font-body">
                  Notes feature coming soon! This will contain key points from
                  the lesson.
                </p>
              </CardContent>
            </Card>
          )}

          {viewMode === "mindmap" && (
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

          {viewMode === "quiz" && (
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
