import React from "react";
import { HealthChecker } from "@/components/HealthChecker";

const SystemStatusSettingsComponent: React.FC = () => {
  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <div>
          <h3 className="text-lg font-semibold mb-2">System Health Monitor</h3>
          <p className="text-sm text-muted-foreground mb-6">
            Monitor the health and status of all AI Tutor services and connections.
          </p>
        </div>
        <HealthChecker />
      </div>
    </div>
  );
};

export const SystemStatusSettings = React.memo(SystemStatusSettingsComponent);