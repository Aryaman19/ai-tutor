import React, { useState, useEffect } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@ai-tutor/ui";
import { Button } from "@ai-tutor/ui";
import { Badge } from "@ai-tutor/ui";
import {
  CheckCircle,
  XCircle,
  AlertCircle,
  Loader2,
  RefreshCw,
  Database,
  Brain,
  Volume2,
  Server,
} from "lucide-react";
import { healthApi } from "@ai-tutor/api-client";
import { useQuery } from "@tanstack/react-query";

const StatusIcon: React.FC<{ status: string }> = ({ status }) => {
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

const StatusBadge: React.FC<{ status: string }> = ({ status }) => {
  const variant =
    status === "healthy" || status === "connected" || status === "available"
      ? "default"
      : status === "degraded"
      ? "secondary"
      : "destructive";

  return <Badge variant={variant}>{status}</Badge>;
};

export const HealthChecker: React.FC = () => {
  const [isRefreshing, setIsRefreshing] = useState(false);

  const {
    data: healthStatus,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ["health", "detailed"],
    queryFn: healthApi.checkDetailedHealth,
    refetchInterval: 30000, // Refresh every 30 seconds
    retry: 1,
  });

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await refetch();
    setIsRefreshing(false);
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center p-6">
          <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
          <span className="ml-2">Checking system health...</span>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2 text-red-600">
            <XCircle className="h-5 w-5" />
            <span>Backend Connection Failed</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <p className="text-red-600">
              Cannot connect to the backend API. Please ensure:
            </p>
            <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
              <li>Backend server is running on port 8000</li>
              <li>MongoDB is running on port 27017</li>
              <li>No firewall blocking the connections</li>
            </ul>
            <Button onClick={handleRefresh} variant="outline">
              <RefreshCw className="h-4 w-4 mr-2" />
              Retry Connection
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Overall Status */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <StatusIcon status={healthStatus?.status || "unknown"} />
              <span>System Health</span>
            </div>
            <div className="flex items-center space-x-2">
              <StatusBadge status={healthStatus?.status || "unknown"} />
              <Button
                onClick={handleRefresh}
                disabled={isRefreshing}
                variant="outline"
                size="sm"
              >
                {isRefreshing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
              </Button>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Database Status */}
            <div className="flex items-center space-x-3 p-3 bg-muted/50 rounded-lg">
              <Database className="h-8 w-8 text-blue-500" />
              <div>
                <div className="flex items-center space-x-2">
                  <StatusIcon
                    status={healthStatus?.services.database.status || "unknown"}
                  />
                  <span className="font-medium">Database</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {healthStatus?.services.database.database || "Unknown"}
                </p>
              </div>
            </div>

            {/* Ollama Status */}
            <div className="flex items-center space-x-3 p-3 bg-muted/50 rounded-lg">
              <Brain className="h-8 w-8 text-purple-500" />
              <div>
                <div className="flex items-center space-x-2">
                  <StatusIcon
                    status={healthStatus?.services.ollama.status || "unknown"}
                  />
                  <span className="font-medium">Ollama</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {healthStatus?.services.ollama.models?.length || 0} models
                </p>
              </div>
            </div>

            {/* TTS Status */}
            <div className="flex items-center space-x-3 p-3 bg-muted/50 rounded-lg">
              <Volume2 className="h-8 w-8 text-green-500" />
              <div>
                <div className="flex items-center space-x-2">
                  <CheckCircle className="h-4 w-4 text-green-500" />
                  <span className="font-medium">TTS</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {Object.keys(healthStatus?.services.tts || {}).length}{" "}
                  providers
                </p>
              </div>
            </div>

            {/* System Info */}
            <div className="flex items-center space-x-3 p-3 bg-muted/50 rounded-lg">
              <Server className="h-8 w-8 text-orange-500" />
              <div>
                <div className="flex items-center space-x-2">
                  <CheckCircle className="h-4 w-4 text-green-500" />
                  <span className="font-medium">System</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {healthStatus?.system.environment || "Unknown"}
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Detailed Service Status */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Ollama Details */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Brain className="h-5 w-5" />
              <span>Ollama Service</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm">Status:</span>
                <StatusBadge
                  status={healthStatus?.services.ollama.status || "unknown"}
                />
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm">URL:</span>
                <span className="text-xs font-mono text-muted-foreground">
                  {healthStatus?.services.ollama.url || "N/A"}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm">Models:</span>
                <span className="text-sm font-medium">
                  {healthStatus?.services.ollama.models?.length || 0}
                </span>
              </div>
              {healthStatus?.services.ollama.error && (
                <div className="p-2 bg-red-50 border border-red-200 rounded text-xs text-red-600">
                  {healthStatus.services.ollama.error}
                </div>
              )}
              {healthStatus?.services.ollama.models &&
                healthStatus.services.ollama.models.length > 0 && (
                  <div className="space-y-1">
                    <span className="text-xs font-medium">
                      Available Models:
                    </span>
                    <div className="max-h-24 overflow-y-auto space-y-1">
                      {healthStatus.services.ollama.models.map(
                        (model: any, index: number) => (
                          <div
                            key={index}
                            className="text-xs bg-muted p-1 rounded"
                          >
                            {model.name}
                          </div>
                        )
                      )}
                    </div>
                  </div>
                )}
            </div>
          </CardContent>
        </Card>

        {/* Database Details */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Database className="h-5 w-5" />
              <span>MongoDB</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm">Status:</span>
                <StatusBadge
                  status={healthStatus?.services.database.status || "unknown"}
                />
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm">Database:</span>
                <span className="text-sm font-medium">
                  {healthStatus?.services.database.database || "N/A"}
                </span>
              </div>
              {healthStatus?.services.database.error && (
                <div className="p-2 bg-red-50 border border-red-200 rounded text-xs text-red-600">
                  {healthStatus.services.database.error}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* TTS Details */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Volume2 className="h-5 w-5" />
              <span>TTS Providers</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {healthStatus?.services.tts &&
                Object.entries(healthStatus.services.tts).map(
                  ([provider, info]: [string, any]) => (
                    <div
                      key={provider}
                      className="flex justify-between items-center"
                    >
                      <span className="text-sm capitalize">{provider}:</span>
                      <StatusBadge status={info.status || "unknown"} />
                    </div>
                  )
                )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* System Information */}
      {healthStatus?.system && (
        <Card>
          <CardHeader>
            <CardTitle>System Information</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <span className="font-medium">Environment:</span>
                <p className="text-muted-foreground">
                  {healthStatus.system.environment}
                </p>
              </div>
              <div>
                <span className="font-medium">Container:</span>
                <p className="text-muted-foreground">
                  {healthStatus.system.is_container ? "Yes" : "No"}
                </p>
              </div>
              <div>
                <span className="font-medium">Platform:</span>
                <p className="text-muted-foreground">
                  {healthStatus.system.platform}
                </p>
              </div>
              <div>
                <span className="font-medium">Ollama Host:</span>
                <p className="text-muted-foreground font-mono text-xs">
                  {healthStatus.system.ollama_host}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};
