import React from "react";
import { ScrollArea } from "@ai-tutor/ui";
import { Button } from "@ai-tutor/ui";
import { 
  SettingsIcon, 
  BrainIcon, 
  VolumeIcon, 
  PaletteIcon, 
  ServerIcon,
  SaveIcon,
  RotateCcwIcon
} from "lucide-react";
import { cn } from "@ai-tutor/utils";

interface SettingsLayoutProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  onSave: () => void;
  onReset: () => void;
  isUpdating: boolean;
  children: React.ReactNode;
}

const SettingsLayoutComponent: React.FC<SettingsLayoutProps> = ({
  activeTab,
  onTabChange,
  onSave,
  onReset,
  isUpdating,
  children
}) => {
  const tabs = [
    { id: "llm", label: "Models", icon: BrainIcon },
    { id: "tts", label: "Voice", icon: VolumeIcon },
    { id: "appearance", label: "Appearance", icon: PaletteIcon },
    { id: "system", label: "System Status", icon: ServerIcon },
  ];

  return (
    <div className="flex h-full bg-background overflow-hidden">
      {/* Sidebar */}
      <div className="w-64 border-r bg-card flex-shrink-0">
        <div className="p-6 h-full flex flex-col">
          <div className="flex items-center space-x-2 mb-6 flex-shrink-0">
            <SettingsIcon className="h-6 w-6 text-primary" />
            <h1 className="text-2xl font-bold">Settings</h1>
          </div>
          
          <nav className="space-y-2 flex-1">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => onTabChange(tab.id)}
                  className={cn(
                    "w-full flex items-center space-x-3 px-3 py-2 rounded-lg text-left transition-colors",
                    activeTab === tab.id
                      ? "bg-primary text-primary-foreground"
                      : "hover:bg-accent hover:text-accent-foreground"
                  )}
                >
                  <Icon className="h-4 w-4" />
                  <span className="text-sm font-medium">{tab.label}</span>
                </button>
              );
            })}
          </nav>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-h-0">
        {/* Header */}
        <div className="border-b bg-card px-6 py-4 flex-shrink-0">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold">
              {tabs.find(tab => tab.id === activeTab)?.label}
            </h2>
            <div className="flex items-center space-x-2">
              <Button
                variant="outline"
                size="sm"
                onClick={onReset}
                disabled={isUpdating}
              >
                <RotateCcwIcon className="h-4 w-4 mr-2" />
                Reset
              </Button>
              <Button
                onClick={onSave}
                disabled={isUpdating}
                size="sm"
              >
                <SaveIcon className="h-4 w-4 mr-2" />
                {isUpdating ? "Saving..." : "Save"}
              </Button>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden">
          <ScrollArea className="h-full">
            <div className="p-6">
              {children}
            </div>
          </ScrollArea>
        </div>
      </div>
    </div>
  );
};

export const SettingsLayout = React.memo(SettingsLayoutComponent);