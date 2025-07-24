import React from "react";
import { useNavigate } from "react-router-dom";
import {
  HomeIcon,
  BookOpenIcon,
  SearchIcon,
  ArrowLeftIcon,
} from "lucide-react";
import { Button, Card, CardHeader, CardTitle, CardContent } from "@ai-tutor/ui";

const NotFound: React.FC = () => {
  const navigate = useNavigate();

  const suggestions = [
    {
      title: "Start Learning",
      description: "Go back to the homepage and explore topics",
      icon: HomeIcon,
      action: () => navigate("/"),
      variant: "default" as const,
    },
    {
      title: "Browse Lessons", 
      description: "Check your lesson history and continue learning",
      icon: BookOpenIcon,
      action: () => navigate("/"),
      variant: "outline" as const,
    },
    {
      title: "Go Back",
      description: "Return to the previous page",
      icon: ArrowLeftIcon,
      action: () => window.history.back(),
      variant: "ghost" as const,
    },
  ];

  return (
    <div className="h-full overflow-y-auto">
      <div className="min-h-full flex flex-col items-center justify-center p-6 bg-gradient-to-br from-primary/5 via-background to-secondary/5">
        <div className="max-w-2xl w-full space-y-8">
          {/* 404 Display */}
          <div className="text-center space-y-4">
            <div className="relative">
              <h1 className="text-8xl font-bold text-primary/20 select-none">
                404
              </h1>
              <div className="absolute inset-0 flex items-center justify-center">
                <SearchIcon className="h-16 w-16 text-primary/40" />
              </div>
            </div>
            <h2 className="text-3xl font-bold text-foreground">
              Page Not Found
            </h2>
            <p className="text-lg text-muted-foreground max-w-md mx-auto">
              The page you're looking for seems to have vanished into the digital void. 
              Let's get you back on track!
            </p>
          </div>

          {/* Action Cards */}
          <div className="grid gap-4 md:grid-cols-3">
            {suggestions.map((suggestion, index) => {
              const Icon = suggestion.icon;
              return (
                <Card 
                  key={index}
                  className="cursor-pointer group hover:shadow-lg transition-all duration-200 hover:-translate-y-1 border-border/50 hover:border-primary/30 bg-card/80 backdrop-blur-sm"
                  onClick={suggestion.action}
                >
                  <CardContent className="p-6 text-center space-y-4">
                    <div className="flex justify-center">
                      <div className="p-3 rounded-full bg-primary/10 group-hover:bg-primary/20 transition-colors">
                        <Icon className="h-6 w-6 text-primary" />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <h3 className="font-semibold text-foreground group-hover:text-primary transition-colors">
                        {suggestion.title}
                      </h3>
                      <p className="text-sm text-muted-foreground">
                        {suggestion.description}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* Fun Facts */}
          <Card className="bg-card/60 backdrop-blur-sm border-border/50">
            <CardContent className="p-6">
              <div className="text-center space-y-3">
                <h3 className="text-lg font-semibold text-foreground">
                  🎓 Fun Learning Fact
                </h3>
                <p className="text-muted-foreground">
                  Did you know? The human brain can process visual information 60,000 times faster than text. 
                  That's why our AI-powered visual lessons are so effective at helping you learn!
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default NotFound;