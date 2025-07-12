import React, { createContext, useContext, useEffect, useState } from "react";

type Theme = "dark" | "light" | "system";
type ColorScheme = "blue" | "green" | "purple" | "orange";

type ThemeProviderProps = {
  children: React.ReactNode;
  defaultTheme?: Theme;
  defaultColorScheme?: ColorScheme;
  storageKey?: string;
  colorStorageKey?: string;
};

type ThemeProviderState = {
  theme: Theme;
  colorScheme: ColorScheme;
  setTheme: (theme: Theme) => void;
  setColorScheme: (scheme: ColorScheme) => void;
  setThemeAndColor: (theme: Theme, scheme: ColorScheme) => void;
};

const initialState: ThemeProviderState = {
  theme: "system",
  colorScheme: "green",
  setTheme: () => null,
  setColorScheme: () => null,
  setThemeAndColor: () => null,
};

const ThemeProviderContext = createContext<ThemeProviderState>(initialState);

export function ThemeProvider({
  children,
  defaultTheme = "system",
  defaultColorScheme = "green",
  storageKey = "ai-tutor-theme",
  colorStorageKey = "ai-tutor-color-scheme",
  ...props
}: ThemeProviderProps) {
  const [theme, setTheme] = useState<Theme>(
    () => (localStorage.getItem(storageKey) as Theme) || defaultTheme
  );

  const [colorScheme, setColorScheme] = useState<ColorScheme>(
    () =>
      (localStorage.getItem(colorStorageKey) as ColorScheme) ||
      defaultColorScheme
  );

  // Apply theme mode (light/dark/system)
  useEffect(() => {
    const root = window.document.documentElement;
    
    // Determine what theme should be applied
    let targetTheme: string;
    if (theme === "system") {
      targetTheme = window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light";
    } else {
      targetTheme = theme;
    }
    
    // Only update if the current theme is different
    const currentTheme = root.classList.contains("dark") ? "dark" : "light";
    
    if (currentTheme !== targetTheme) {
      root.classList.remove("light", "dark");
      root.classList.add(targetTheme);
    }
  }, [theme]);

  // Apply color scheme
  useEffect(() => {
    const root = window.document.documentElement;
    
    // Check current color scheme
    const currentColorScheme = root.getAttribute("data-theme");
    const targetColorScheme = colorScheme !== "green" ? colorScheme : null;
    
    // Only update if different
    if (currentColorScheme !== targetColorScheme) {
      // Remove all color scheme data attributes
      root.removeAttribute("data-theme");

      // Apply new color scheme if not default
      if (targetColorScheme) {
        root.setAttribute("data-theme", targetColorScheme);
      }
    }
  }, [colorScheme]);

  const value = {
    theme,
    colorScheme,
    setTheme: (newTheme: Theme) => {
      localStorage.setItem(storageKey, newTheme);
      setTheme(newTheme);
    },
    setColorScheme: (newScheme: ColorScheme) => {
      localStorage.setItem(colorStorageKey, newScheme);
      setColorScheme(newScheme);
    },
    setThemeAndColor: (newTheme: Theme, newScheme: ColorScheme) => {
      localStorage.setItem(storageKey, newTheme);
      localStorage.setItem(colorStorageKey, newScheme);
      setTheme(newTheme);
      setColorScheme(newScheme);
    },
  };

  return (
    <ThemeProviderContext.Provider {...props} value={value}>
      {children}
    </ThemeProviderContext.Provider>
  );
}

export const useTheme = () => {
  const context = useContext(ThemeProviderContext);

  if (context === undefined)
    throw new Error("useTheme must be used within a ThemeProvider");

  return context;
};

// Hook for color scheme only
export const useColorScheme = () => {
  const { colorScheme, setColorScheme } = useTheme();
  return { colorScheme, setColorScheme };
};
