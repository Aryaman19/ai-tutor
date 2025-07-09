import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
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

const Home: React.FC = () => {
  const [topic, setTopic] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const navigate = useNavigate();

  const handleGenerateELI5 = async () => {
    if (!topic.trim()) return;

    setIsGenerating(true);

    try {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      navigate("/lesson/demo-lesson");
    } catch (error) {
      console.error("Error generating lesson:", error);
    } finally {
      setIsGenerating(false);
    }
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
    <div className="h-full flex flex-col items-center justify-center p-6 bg-gradient-to-br from-primary/5 via-background to-secondary/5">
      <div className="max-w-2xl w-full space-y-8">
        {/* Header */}
        <div className="text-center space-y-4">
          <div className="flex justify-center">
            <img src={ASSET_IMAGES.logoIcon} alt="logo" className="h-12 w-12" />
          </div>
          <h1 className="text-heading-1 text-foreground">Xonera</h1>
          <p className="text-body-large text-muted-foreground">
            Learn anything with personalized visual explanations
          </p>
          <div className="flex items-center justify-center space-x-2 text-sm text-primary font-medium">
            <SparklesIcon className="h-4 w-4" />
            <span>Powered by Gemma 3n</span>
          </div>
        </div>

        {/* Main Input */}
        <Card className="shadow-lg border-0 bg-card">
          <CardContent className="p-6">
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-body font-medium text-foreground">
                  What would you like to learn today?
                </label>
                <div className="flex space-x-2">
                  <Input
                    value={topic}
                    onChange={(e) => setTopic(e.target.value)}
                    onKeyPress={handleKeyPress}
                    placeholder="e.g., How does photosynthesis work?"
                    className="flex-1 text-base bg-background font-body"
                    disabled={isGenerating}
                  />
                  <Button
                    onClick={handleGenerateELI5}
                    disabled={!topic.trim() || isGenerating}
                    className="px-6 font-medium"
                  >
                    {isGenerating ? (
                      <div className="animate-spin h-4 w-4 border-2 border-primary-foreground border-t-transparent rounded-full" />
                    ) : (
                      <>
                        <PlayIcon className="h-4 w-4 mr-2" />
                        Generate
                      </>
                    )}
                  </Button>
                </div>
              </div>

              {isGenerating && (
                <div className="flex items-center space-x-2 text-body-small text-primary font-medium">
                  <div className="animate-pulse h-2 w-2 bg-primary rounded-full" />
                  <span>Creating your personalized lesson...</span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Example Topics */}
        <div className="space-y-4">
          <h3 className="text-heading-3 text-foreground text-center">
            Or try one of these popular topics
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {exampleTopics.map((example, index) => (
              <button
                key={index}
                onClick={() => setTopic(example)}
                className="p-3 text-left bg-card rounded-lg border border-border hover:border-primary/30 hover:bg-accent transition-all group"
                disabled={isGenerating}
              >
                <div className="flex items-center justify-between">
                  <span className="text-body-small text-foreground group-hover:text-primary font-medium">
                    {example}
                  </span>
                  <ArrowRightIcon className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Features */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-8">
          <div className="text-center space-y-2">
            <div className="p-2 bg-green-500/10 rounded-lg inline-block">
              <BookOpenIcon className="h-6 w-6 text-green-600 dark:text-green-400" />
            </div>
            <h4 className="font-semibold text-foreground font-heading">
              Visual Learning
            </h4>
            <p className="text-body-small text-muted-foreground">
              Step-by-step visual explanations with narration
            </p>
          </div>
          <div className="text-center space-y-2">
            <div className="p-2 bg-purple-500/10 rounded-lg inline-block">
              <BrainIcon className="h-6 w-6" />
            </div>
            <h4 className="font-semibold text-foreground font-heading">
              Interactive Q&A
            </h4>
            <p className="text-body-small text-muted-foreground">
              Ask questions anytime and get instant answers
            </p>
          </div>
          <div className="text-center space-y-2">
            <div className="p-2 bg-blue-500/10 rounded-lg inline-block">
              <SparklesIcon className="h-6 w-6 text-blue-600 dark:text-blue-400" />
            </div>
            <h4 className="font-semibold text-foreground font-heading">
              Offline Ready
            </h4>
            <p className="text-body-small text-muted-foreground">
              Works without internet using local AI
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Home;
