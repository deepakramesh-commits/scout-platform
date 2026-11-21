import {defineTheme} from '@astryxdesign/core/theme';
import {matchaTheme} from '@astryxdesign/theme-matcha';

const sans = {family: 'DM Sans', fallbacks: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif'};

// Matcha's components and data colours, with a sans display face (its script heading face is hard to scan in a data product)
// and the pitch-green accent the product already uses.
export const scoutTheme = defineTheme({
  name: 'scout',
  extends: matchaTheme,
  typography: {
    scale: {base: 16, ratio: 1.25},
    body: sans,
    heading: sans,
    code: {family: 'ui-monospace', fallbacks: '"SF Mono", Monaco, Consolas, monospace'},
  },
  tokens: {
    '--color-accent': ['#138546', '#3ddc84'],
    '--color-accent-muted': ['#13854614', '#3ddc8424'],
    '--color-text-accent': ['#0b603d', '#3ddc84'],
    '--color-icon-accent': ['#138546', '#3ddc84'],
    '--color-on-accent': ['#ffffff', '#06210f'],
    '--focus-outline-color': 'var(--color-accent)',
    // A cool near-black instead of matcha's olive: it stays black on projectors, and each surface is a clear step lighter.
    '--color-text-primary': ['#141a22', '#eef1f5'],
    '--color-text-secondary': ['#4a5565', '#9aa5b4'],
    '--color-icon-primary': ['#141a22', '#eef1f5'],
    '--color-background-body': ['#f4f6f8', '#0a0d12'],
    '--color-background-surface': ['#ffffff', '#0f1319'],
    '--color-background-card': ['#ffffff', '#151a22'],
    '--color-background-muted': ['#eceff3', '#1f2632'],
    '--color-background-popover': ['#ffffff', '#1b222d'],
    '--color-background-inverted': ['#141a22', '#e6eaf0'],
    '--color-background-gray': ['#6b768626', '#8a96a833'],
    '--color-overlay': ['#0a0d1299', '#05070acc'],
    '--color-overlay-hover': ['#141a220d', '#e6eaf00d'],
    '--color-overlay-pressed': ['#141a221a', '#e6eaf01a'],
    '--color-border': ['#141a221f', '#e6eaf01f'],
    '--color-border-emphasized': ['#aab3c0', '#3d4757'],
    '--color-border-gray': ['#6b7686', '#6b7686'],
  },
  localTokens: {
    '--ease-out': 'cubic-bezier(0.23, 1, 0.32, 1)',
    '--ease-in-out': 'cubic-bezier(0.77, 0, 0.175, 1)',
    '--pitch': '#12301f',
    '--pitch-stripe': '#143522',
    '--pitch-line': '#ffffff8c',
  },
  components: {
    card: {base: {borderRadius: 'var(--radius-container)'}},
  },
});
