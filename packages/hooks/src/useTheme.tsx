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

    root.classList.remove("light", "dark");

    if (theme === "system") {
      const systemTheme = window.matchMedia("(prefers-color-scheme: dark)")
        .matches
        ? "dark"
        : "light";

      root.classList.add(systemTheme);
      return;
    }

    root.classList.add(theme);
  }, [theme]);

  // Apply color scheme
  useEffect(() => {
    const root = window.document.documentElement;

    // Remove all color scheme data attributes
    root.removeAttribute("data-theme");

    // Apply new color scheme if not default
    if (colorScheme !== "green") {
      root.setAttribute("data-theme", colorScheme);
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
