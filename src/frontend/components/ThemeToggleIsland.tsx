import { useTheme } from '../hooks/useTheme';
import { ThemeToggle } from './ThemeToggle';

export default function ThemeToggleIsland() {
  const { theme, setTheme } = useTheme();
  return <ThemeToggle theme={theme} setTheme={setTheme} />;
}
