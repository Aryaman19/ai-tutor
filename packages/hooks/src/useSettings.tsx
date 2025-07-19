import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { settingsApi } from "@ai-tutor/api-client";
import type { 
  UserSettings, 
  SettingsUpdateRequest, 
  AvailableModels 
} from "@ai-tutor/types";
import { toast } from "sonner";
import { createServiceLogger } from "@ai-tutor/utils";

const logger = createServiceLogger('useSettings');

export const useSettings = (userId: string = "default") => {
  const queryClient = useQueryClient();

  // Query for getting user settings
  const {
    data: settings,
    isLoading,
    error,
    refetch
  } = useQuery({
    queryKey: ["settings", userId],
    queryFn: () => settingsApi.getUserSettings(userId),
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
    refetchOnWindowFocus: false,
    retry: 3,
    retryDelay: (attemptIndex: number) => Math.min(1000 * 2 ** attemptIndex, 30000),
  });

  // Mutation for updating settings
  const updateSettingsMutation = useMutation({
    mutationFn: (updateData: SettingsUpdateRequest) => 
      settingsApi.updateUserSettings(updateData, userId),
    onSuccess: (updatedSettings: UserSettings) => {
      queryClient.setQueryData(["settings", userId], updatedSettings);
      toast.success("Settings updated successfully");
    },
    onError: (error: Error) => {
      logger.error("Failed to update settings:", error);
      toast.error("Failed to update settings");
    },
  });

  // Mutation for updating specific settings section
  const updateSectionMutation = useMutation({
    mutationFn: ({ section, data }: { section: string; data: Record<string, any> }) =>
      settingsApi.updateSettingsSection(section, data, userId),
    onSuccess: (updatedSettings: UserSettings) => {
      queryClient.setQueryData(["settings", userId], updatedSettings);
      toast.success("Settings updated successfully");
    },
    onError: (error: Error) => {
      logger.error("Failed to update settings section:", error);
      toast.error("Failed to update settings");
    },
  });

  // Mutation for resetting settings
  const resetSettingsMutation = useMutation({
    mutationFn: () => settingsApi.resetUserSettings(userId),
    onSuccess: (defaultSettings: UserSettings) => {
      queryClient.setQueryData(["settings", userId], defaultSettings);
      toast.success("Settings reset to default");
    },
    onError: (error: Error) => {
      logger.error("Failed to reset settings:", error);
      toast.error("Failed to reset settings");
    },
  });

  // Mutation for deleting settings
  const deleteSettingsMutation = useMutation({
    mutationFn: () => settingsApi.deleteUserSettings(userId),
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: ["settings", userId] });
      toast.success("Settings deleted successfully");
    },
    onError: (error: Error) => {
      logger.error("Failed to delete settings:", error);
      toast.error("Failed to delete settings");
    },
  });

  return {
    // Data
    settings,
    isLoading,
    error,
    
    // Actions
    updateSettings: updateSettingsMutation.mutate,
    updateSection: updateSectionMutation.mutate,
    resetSettings: resetSettingsMutation.mutate,
    deleteSettings: deleteSettingsMutation.mutate,
    refetch,
    
    // Mutation states
    isUpdating: updateSettingsMutation.isPending,
    isUpdatingSection: updateSectionMutation.isPending,
    isResetting: resetSettingsMutation.isPending,
    isDeleting: deleteSettingsMutation.isPending,
  };
};

export const useAvailableModels = () => {
  const queryClient = useQueryClient();

  const query = useQuery<AvailableModels>({
    queryKey: ["availableModels"],
    queryFn: () => settingsApi.getAvailableModels(),
    staleTime: 30 * 60 * 1000, // 30 minutes
    gcTime: 60 * 60 * 1000, // 1 hour
    refetchOnWindowFocus: false,
    refetchInterval: 30 * 1000, // Poll every 30 seconds to detect when Ollama comes online
    refetchIntervalInBackground: false,
  });

  return {
    ...query,
    refetchModels: () => queryClient.invalidateQueries({ queryKey: ["availableModels"] })
  };
};

export const useSupportedLanguages = () => {
  return useQuery({
    queryKey: ["supportedLanguages"],
    queryFn: () => settingsApi.getSupportedLanguages(),
    staleTime: 60 * 60 * 1000, // 1 hour
    gcTime: 2 * 60 * 60 * 1000, // 2 hours
    refetchOnWindowFocus: false,
  });
};

export const useBrowserVoices = () => {
  return useQuery({
    queryKey: ["browserVoices"],
    queryFn: () => settingsApi.getBrowserVoices(),
    staleTime: 10 * 60 * 1000, // 10 minutes
    gcTime: 30 * 60 * 1000, // 30 minutes
    refetchOnWindowFocus: false,
    enabled: typeof window !== "undefined" && "speechSynthesis" in window,
  });
};

// Helper hook for specific settings sections
export const useSettingsSection = <T extends keyof UserSettings>(
  section: T, 
  userId: string = "default"
) => {
  const { settings, updateSection, isUpdatingSection } = useSettings(userId);
  
  return {
    data: settings?.[section],
    update: (data: Partial<UserSettings[T]>) => updateSection({ section, data }),
    isUpdating: isUpdatingSection,
  };
};

// Specific hooks for common sections
export const useProfileSettings = (userId: string = "default") => 
  useSettingsSection("profile", userId);

export const useLLMSettings = (userId: string = "default") => 
  useSettingsSection("llm", userId);

export const useTTSSettings = (userId: string = "default") => 
  useSettingsSection("tts", userId);

export const useSTTSettings = (userId: string = "default") => 
  useSettingsSection("stt", userId);

export const useLanguageSettings = (userId: string = "default") => 
  useSettingsSection("language", userId);

export const useAppearanceSettings = (userId: string = "default") => 
  useSettingsSection("appearance", userId);

export const useLessonSettings = (userId: string = "default") => 
  useSettingsSection("lessons", userId);

export const useNotificationSettings = (userId: string = "default") => 
  useSettingsSection("notifications", userId);