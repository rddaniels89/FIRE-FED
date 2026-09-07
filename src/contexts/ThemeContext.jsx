import { createContext, useContext, useState, useEffect } from 'react';

const ThemeContext = createContext();

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};

export const ThemeProvider = ({ children }) => {
  const [isDarkMode, setIsDarkMode] = useState(true);

  useEffect(() => {
    // An explicit choice always wins. With no choice on record, follow the
    // operating system rather than forcing dark on someone who asked for light,
    // and do not write anything to storage so the preference keeps tracking.
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'dark' || savedTheme === 'light') {
      const isDark = savedTheme === 'dark';
      setIsDarkMode(isDark);
      updateDocumentClass(isDark);
      return undefined;
    }

    const media = window.matchMedia?.('(prefers-color-scheme: light)');
    const apply = (prefersLight) => {
      setIsDarkMode(!prefersLight);
      updateDocumentClass(!prefersLight);
    };
    apply(Boolean(media?.matches));

    if (!media?.addEventListener) return undefined;
    const onChange = (event) => {
      if (localStorage.getItem('theme')) return;
      apply(event.matches);
    };
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);

  const updateDocumentClass = (isDark) => {
    if (isDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  };

  const toggleTheme = () => {
    const newTheme = !isDarkMode;
    setIsDarkMode(newTheme);
    localStorage.setItem('theme', newTheme ? 'dark' : 'light');
    updateDocumentClass(newTheme);
  };

  const value = {
    isDarkMode,
    toggleTheme,
    theme: isDarkMode ? 'dark' : 'light'
  };

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}; 