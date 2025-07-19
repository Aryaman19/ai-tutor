import React, { useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@ai-tutor/ui";
import { Button } from "@ai-tutor/ui";
import { Loader2, RefreshCw, XCircle, Database, Brain, Volume2, Server, CheckCircle } from "lucide-react";
import { healthApi } from "@ai-tutor/api-client";
import { useQuery } from "@tanstack/react-query";
import { StatusIcon } from "./StatusIcon";
import { StatusBadge } from "./StatusBadge";
import { ServiceCard } from "./ServiceCard";
import { SystemInfoCard } from "./SystemInfoCard";
import type { HealthStatus, OllamaModel, TTSProvider } from "@ai-tutor/types";

const HealthDashboardComponent: React.FC = () => {
  const [isRefreshing, setIsRefreshing] = useState(false);

  const {
    data: healthStatus,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ["health", "detailed"],
    queryFn: healthApi.checkDetailedHealth,
    refetchInterval: 30000,
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
                  {Object.values(healthStatus?.services.tts || {}).filter(provider => provider.status === "available").length}{" "}
                  of {Object.keys(healthStatus?.services.tts || {}).length} available
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
        <ServiceCard
          title="Ollama Service"
          icon={Brain}
          status={healthStatus?.services.ollama.status || "unknown"}
          url={healthStatus?.services.ollama.url}
          error={healthStatus?.services.ollama.error}
          additionalInfo={
            <>
              <div className="flex justify-between items-center">
                <span className="text-sm">Models:</span>
                <span className="text-sm font-medium">
                  {healthStatus?.services.ollama.models?.length || 0}
                </span>
              </div>
              {healthStatus?.services.ollama.models &&
                healthStatus.services.ollama.models.length > 0 && (
                  <div className="space-y-1">
                    <span className="text-xs font-medium">
                      Available Models:
                    </span>
                    <div className="max-h-24 overflow-y-auto space-y-1">
                      {healthStatus.services.ollama.models.map(
                        (model: OllamaModel, index: number) => (
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
            </>
          }
        />

        {/* Database Details */}
        <ServiceCard
          title="MongoDB"
          icon={Database}
          status={healthStatus?.services.database.status || "unknown"}
          error={healthStatus?.services.database.error}
          additionalInfo={
            <div className="flex justify-between items-center">
              <span className="text-sm">Database:</span>
              <span className="text-sm font-medium">
                {healthStatus?.services.database.database || "N/A"}
              </span>
            </div>
          }
        />

        {/* TTS Details */}
        <ServiceCard
          title="TTS Providers"
          icon={Volume2}
          status="available"
          additionalInfo={
            <div className="space-y-3">
              {healthStatus?.services.tts &&
                Object.entries(healthStatus.services.tts).map(
                  ([provider, info]: [string, TTSProvider]) => (
                    <div key={provider} className="space-y-1">
                      <div className="flex justify-between items-center">
                        <span className="text-sm font-medium capitalize">{provider}:</span>
                        <StatusBadge status={info.status || "unknown"} />
                      </div>
                      {info.note && (
                        <p className="text-xs text-muted-foreground">{info.note}</p>
                      )}
                      {info.voices_count !== undefined && (
                        <p className="text-xs text-muted-foreground">
                          {info.voices_count} voices available
                        </p>
                      )}
                      {info.error && (
                        <p className="text-xs text-red-500">{info.error}</p>
                      )}
                    </div>
                  )
                )}
            </div>
          }
        />
      </div>

      {/* System Information */}
      {healthStatus?.system && (
        <SystemInfoCard systemInfo={healthStatus.system} />
      )}
    </div>
  );
};

export const HealthDashboard = React.memo(HealthDashboardComponent);