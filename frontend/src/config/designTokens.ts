/** Design tokens from repo-root ``design.md`` (Storytelling system). */
export const storyDesign = {
  colors: {
    primary: '#3B82F6',
    secondary: '#8B5CF6',
    success: '#16A34A',
    warning: '#D97706',
    danger: '#DC2626',
    surface: '#FFFFFF',
    text: '#111827',
    neutral: '#FFFFFF',
    canvas: '#f8fafc',
    accentSurface: '#eff6ff',
    secondarySurface: '#f5f3ff',
  },
  fonts: {
    display: '"Abril Fatface", Georgia, serif',
    body: '"Inter", system-ui, sans-serif',
    label: '"JetBrains Mono", ui-monospace, monospace',
  },
  typography: {
    h1: '3rem',
    bodyMd: '1rem',
    labelCaps: '0.75rem',
  },
  rounded: {
    sm: '4px',
    md: '8px',
  },
  spacing: {
    sm: '4px',
    md: '8px',
  },
} as const

/** @deprecated Use ``storyDesign`` — kept for incremental migration. */
export const doodleDesign = storyDesign
