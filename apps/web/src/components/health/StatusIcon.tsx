import React from "react";
import { CheckCircle, XCircle, AlertCircle, Loader2 } from "lucide-react";

interface StatusIconProps {
  status: string;
}

const StatusIconComponent: React.FC<StatusIconProps> = ({ status }) => {
  switch (status) {
    case "healthy":
    case "connected":
    case "available":
      return <CheckCircle className="h-4 w-4 text-green-500" />;
    case "degraded":
    case "disconnected":
      return <AlertCircle className="h-4 w-4 text-yellow-500" />;
    case "unhealthy":
    case "error":
    case "unavailable":
      return <XCircle className="h-4 w-4 text-red-500" />;
    default:
      return <Loader2 className="h-4 w-4 animate-spin text-blue-500" />;
  }
};

export const StatusIcon = React.memo(StatusIconComponent);