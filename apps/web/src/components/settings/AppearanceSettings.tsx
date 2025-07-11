import React from "react";
import { Card, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@ai-tutor/ui";
import { useTheme } from "@ai-tutor/hooks";
import { cn } from "@ai-tutor/utils";
import type { AppearanceSettings as AppearanceSettingsType } from "@ai-tutor/types";

interface AppearanceSettingsProps {
  data?: AppearanceSettingsType;
  onChange: (data: Partial<AppearanceSettingsType>) => void;
}

const AppearanceSettingsComponent: React.FC<AppearanceSettingsProps> = ({ data, onChange }) => {
  const { theme, setTheme, colorScheme, setColorScheme } = useTheme();
  
  const themeOptions = [
    { value: "light", label: "Light", description: "Clean and bright interface" },
    { value: "dark", label: "Dark", description: "Easy on the eyes" },
    { value: "system", label: "System", description: "Matches your device settings" },
  ];

  const colorOptions = [
    { value: "green", label: "Green", description: "Fresh and natural", color: "bg-green-500" },
    { value: "blue", label: "Blue", description: "Calm and professional", color: "bg-blue-500" },
    { value: "purple", label: "Purple", description: "Creative and modern", color: "bg-purple-500" },
    { value: "orange", label: "Orange", description: "Warm and energetic", color: "bg-orange-500" },
  ];

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4">Appearance & Display</h3>
        
        <div className="space-y-6">
          <div>
            <label className="block text-sm font-medium mb-2">Theme</label>
            <Select value={theme} onValueChange={setTheme}>
              <SelectTrigger>
                <SelectValue placeholder="Select theme" />
              </SelectTrigger>
              <SelectContent>
                {themeOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    <div className="flex items-center space-x-2">
                      <span>{option.label}</span>
                      <span className="text-xs text-muted-foreground">
                        - {option.description}
                      </span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          <div>
            <label className="block text-sm font-medium mb-2">Color Scheme</label>
            <Select value={colorScheme} onValueChange={setColorScheme}>
              <SelectTrigger>
                <SelectValue placeholder="Select color scheme" />
              </SelectTrigger>
              <SelectContent>
                {colorOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    <div className="flex items-center space-x-2">
                      <div className={cn("w-4 h-4 rounded-full", option.color)}></div>
                      <span>{option.label}</span>
                      <span className="text-xs text-muted-foreground">
                        - {option.description}
                      </span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </Card>
    </div>
  );
};

export const AppearanceSettings = React.memo(AppearanceSettingsComponent);