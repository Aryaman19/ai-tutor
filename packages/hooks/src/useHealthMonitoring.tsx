import { useState, useCallback, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { healthApi } from '@ai-tutor/api-client';
import type { HealthStatus } from '@ai-tutor/types';

interface UseHealthMonitoringOptions {
  enabled?: boolean;
  refetchInterval?: number;
  retryAttempts?: number;
  onStatusChange?: (status: HealthStatus) => void;
}

export function useHealthMonitoring(options: UseHealthMonitoringOptions = {}) {
  const {
    enabled = true,
    refetchInterval = 30000, // 30 seconds
    retryAttempts = 1,
    onStatusChange
  } = options;

  const [isManualRefreshing, setIsManualRefreshing] = useState(false);

  const {
    data: healthStatus,
    isLoading,
    error,
    refetch,
    dataUpdatedAt
  } = useQuery({
    queryKey: ['health', 'detailed'],
    queryFn: healthApi.checkDetailedHealth,
    enabled,
    refetchInterval,
    retry: retryAttempts,
  });

  // Handle status changes
  useEffect(() => {
    if (healthStatus && onStatusChange) {
      onStatusChange(healthStatus);
    }
  }, [healthStatus, onStatusChange]);

  // Manual refresh with loading state
  const handleManualRefresh = useCallback(async () => {
    setIsManualRefreshing(true);
    try {
      await refetch();
    } finally {
      setIsManualRefreshing(false);
    }
  }, [refetch]);

  // Get overall system health status
  const getSystemStatus = useCallback(() => {
    if (!healthStatus) return 'unknown';
    return healthStatus.status;
  }, [healthStatus]);

  // Get service-specific status
  const getServiceStatus = useCallback((serviceName: keyof HealthStatus['services']) => {
    if (!healthStatus) return 'unknown';
    return healthStatus.services[serviceName]?.status || 'unknown';
  }, [healthStatus]);

  // Check if any service is unhealthy
  const hasUnhealthyServices = useCallback(() => {
    if (!healthStatus) return false;
    
    const services = healthStatus.services;
    return Object.values(services).some(service => {
      if (typeof service === 'object' && service !== null && 'status' in service) {
        const status = (service as { status: string }).status;
        return status === 'unhealthy' || status === 'error' || status === 'unavailable';
      }
      return false;
    });
  }, [healthStatus]);

  // Get list of unhealthy services
  const getUnhealthyServices = useCallback(() => {
    if (!healthStatus) return [];
    
    const services = healthStatus.services;
    return Object.entries(services)
      .filter(([_, service]) => {
        if (typeof service === 'object' && service !== null && 'status' in service) {
          const status = (service as { status: string }).status;
          return status === 'unhealthy' || status === 'error' || status === 'unavailable';
        }
        return false;
      })
      .map(([name, service]) => ({
        name,
        status: (service as { status: string; error?: string }).status,
        error: (service as { status: string; error?: string }).error
      }));
  }, [healthStatus]);

  // Get time since last update
  const getTimeSinceLastUpdate = useCallback(() => {
    if (!dataUpdatedAt) return null;
    return Date.now() - dataUpdatedAt;
  }, [dataUpdatedAt]);

  // Check if data is stale
  const isDataStale = useCallback((staleTimeMs: number = 60000) => {
    const timeSinceUpdate = getTimeSinceLastUpdate();
    return timeSinceUpdate !== null && timeSinceUpdate > staleTimeMs;
  }, [getTimeSinceLastUpdate]);

  return {
    // Data
    healthStatus,
    isLoading,
    error,
    dataUpdatedAt,
    
    // Actions
    refetch: handleManualRefresh,
    isManualRefreshing,
    
    // Status helpers
    getSystemStatus,
    getServiceStatus,
    hasUnhealthyServices,
    getUnhealthyServices,
    getTimeSinceLastUpdate,
    isDataStale,
    
    // Computed states
    isHealthy: getSystemStatus() === 'healthy',
    hasConnection: !error,
    lastUpdateTime: dataUpdatedAt ? new Date(dataUpdatedAt).toLocaleTimeString() : null
  };
}