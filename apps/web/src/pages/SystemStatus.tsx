import React from "react";
import { HealthChecker } from "@/components/HealthChecker";
import { Button } from "@ai-tutor/ui";
import { ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";
import { ASSET_IMAGES } from "@/assets/asset";

export const SystemStatus: React.FC = () => {
  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <img src={ASSET_IMAGES.logoIcon} alt="logo" className="w-16 h-16" />
            <div>
              <h1 className="text-3xl font-bold font-heading">System Status</h1>
              <p className="text-muted-foreground">
                Monitor the health of all AI Tutor services
              </p>
            </div>
          </div>
          <Link to="/">
            <Button variant="outline">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Home
            </Button>
          </Link>
        </div>

        {/* Health Checker */}
        <HealthChecker />
      </div>
    </div>
  );
};
