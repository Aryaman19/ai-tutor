import React from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@ai-tutor/ui";
import { StatusIcon } from "./StatusIcon";
import { StatusBadge } from "./StatusBadge";

interface ServiceCardProps {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  status: string;
  url?: string;
  error?: string;
  additionalInfo?: React.ReactNode;
}

const ServiceCardComponent: React.FC<ServiceCardProps> = ({
  title,
  icon: Icon,
  status,
  url,
  error,
  additionalInfo
}) => {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center space-x-2">
          <Icon className="h-5 w-5" />
          <span>{title}</span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-sm">Status:</span>
            <StatusBadge status={status} />
          </div>
          {url && (
            <div className="flex justify-between items-center">
              <span className="text-sm">URL:</span>
              <span className="text-xs font-mono text-muted-foreground">
                {url}
              </span>
            </div>
          )}
          {error && (
            <div className="p-2 bg-red-50 border border-red-200 rounded text-xs text-red-600">
              {error}
            </div>
          )}
          {additionalInfo}
        </div>
      </CardContent>
    </Card>
  );
};

export const ServiceCard = React.memo(ServiceCardComponent);