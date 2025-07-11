import React from "react";
import { Badge } from "@ai-tutor/ui";

interface StatusBadgeProps {
  status: string;
}

const StatusBadgeComponent: React.FC<StatusBadgeProps> = ({ status }) => {
  const variant =
    status === "healthy" || status === "connected" || status === "available"
      ? "default"
      : status === "degraded"
      ? "secondary"
      : "destructive";

  return <Badge variant={variant}>{status}</Badge>;
};

export const StatusBadge = React.memo(StatusBadgeComponent);