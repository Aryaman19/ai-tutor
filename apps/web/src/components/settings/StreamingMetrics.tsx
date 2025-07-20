import React from "react";
import type { StreamingMetrics as StreamingMetricsType } from "@ai-tutor/types";

interface StreamingMetricsProps {
  metrics: StreamingMetricsType;
}

export const StreamingMetrics: React.FC<StreamingMetricsProps> = ({
  metrics
}) => {
  const formatStreamingMetrics = (metrics: StreamingMetricsType) => {
    return {
      firstTokenLatency: `${((metrics.first_token_latency || 0) * 1000).toFixed(0)}ms`,
      tokensPerSecond: `${(metrics.tokens_per_second || 0).toFixed(1)} tokens/s`,
      chunkCount: metrics.chunk_count || 0,
      avgChunkDelay: `${((metrics.average_chunk_delay || 0) * 1000).toFixed(0)}ms`,
      contentQuality: metrics.content_quality?.quality || 'unknown'
    };
  };

  const safeNumber = (value: any, defaultValue: number = 0): number => {
    const num = Number(value);
    return isNaN(num) ? defaultValue : num;
  };

  const formattedMetrics = formatStreamingMetrics(metrics);

  return (
    <div className="space-y-3">
      <h4 className="font-medium">Streaming Performance Analysis</h4>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="p-4 bg-background border border-border rounded-md">
          <h5 className="font-medium mb-3 text-sm">Response Timing</h5>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span>First Token Latency:</span>
              <span className="font-mono">{formattedMetrics.firstTokenLatency}</span>
            </div>
            <div className="flex justify-between">
              <span>Average Chunk Delay:</span>
              <span className="font-mono">{formattedMetrics.avgChunkDelay}</span>
            </div>
            <div className="flex justify-between">
              <span>Total Chunks:</span>
              <span className="font-mono">{metrics.chunk_count}</span>
            </div>
            <div className="flex justify-between">
              <span>Streaming Speed:</span>
              <span className="font-mono">{formattedMetrics.tokensPerSecond}</span>
            </div>
          </div>
        </div>
        
        <div className="p-4 bg-background border border-border rounded-md">
          <h5 className="font-medium mb-3 text-sm">Quality Assessment</h5>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span>Real Streaming:</span>
              <span className={`font-medium ${metrics.real_streaming ? 'text-emerald-600' : 'text-destructive'}`}>
                {metrics.real_streaming ? '✅ Yes' : '❌ No'}
              </span>
            </div>
            <div className="flex justify-between">
              <span>Content Quality:</span>
              <span className={`font-medium ${
                metrics.content_quality.quality === 'good' ? 'text-emerald-600' :
                metrics.content_quality.quality === 'fair' ? 'text-amber-600' : 'text-destructive'
              }`}>
                {metrics.content_quality.quality.charAt(0).toUpperCase() + 
                 metrics.content_quality.quality.slice(1)}
              </span>
            </div>
            <div className="flex justify-between">
              <span>Final Length:</span>
              <span className="font-mono">{safeNumber(metrics.content_quality.final_length)} chars</span>
            </div>
            <div className="flex justify-between">
              <span>Reason:</span>
              <span className="text-muted-foreground text-xs">
                {metrics.content_quality.reason.replace(/_/g, ' ')}
              </span>
            </div>
          </div>
        </div>
        
        {/* Chunk Timing Visualization */}
        {metrics.chunk_times.length > 0 && (
          <div className="p-4 bg-background border border-border rounded-md">
            <h5 className="font-medium mb-3 text-sm">Chunk Timing Pattern</h5>
            <div className="flex items-end gap-1 h-16">
              {metrics.chunk_times.slice(0, 20).map((time, index) => (
                <div
                  key={index}
                  className="bg-blue-500 rounded-t min-w-[3px] flex-1"
                  style={{ 
                    height: `${Math.min((time * 1000 / 200) * 100, 100)}%`,
                    opacity: 0.7 + (index / 20) * 0.3
                  }}
                  title={`Chunk ${index + 1}: ${(time * 1000).toFixed(0)}ms`}
                />
              ))}
            </div>
            <div className="text-xs text-muted-foreground mt-2">
              Inter-chunk delays (first 20 chunks) • Lower bars = faster streaming
            </div>
          </div>
        )}
      </div>
    </div>
  );
};