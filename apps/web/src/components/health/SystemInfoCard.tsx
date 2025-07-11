import React from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@ai-tutor/ui";
import type { SystemInfo } from "@ai-tutor/types";

interface SystemInfoCardProps {
  systemInfo: SystemInfo;
}

const SystemInfoCardComponent: React.FC<SystemInfoCardProps> = ({ systemInfo }) => {
  return (
    <Card>
      <CardHeader>
        <CardTitle>System Information</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div>
            <span className="font-medium">Environment:</span>
            <p className="text-muted-foreground">
              {systemInfo.environment}
            </p>
          </div>
          <div>
            <span className="font-medium">Container:</span>
            <p className="text-muted-foreground">
              {systemInfo.is_container ? "Yes" : "No"}
            </p>
          </div>
          <div>
            <span className="font-medium">Platform:</span>
            <p className="text-muted-foreground">
              {systemInfo.platform}
            </p>
          </div>
          <div>
            <span className="font-medium">Ollama Host:</span>
            <p className="text-muted-foreground font-mono text-xs">
              {systemInfo.ollama_host}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export const SystemInfoCard = React.memo(SystemInfoCardComponent);