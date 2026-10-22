'use client';
import { Canvas } from '@/components/canvas/Canvas';
import { TopBar } from '@/components/ui/TopBar';
import { Palette } from '@/components/ui/Palette';
import { Inspector } from '@/components/ui/Inspector';
import { CodeDrawer } from '@/components/ui/CodeDrawer';
import { AiDrawer } from '@/components/ui/AiDrawer';
import { DrawerTabs } from '@/components/ui/DrawerTabs';
import { Pet } from '@/components/ui/Pet';
import { Toasts } from '@/components/ui/Toasts';
import { useSimulation } from '@/hooks/useSimulation';
import { useAutosave } from '@/hooks/useAutosave';

export default function Home() {
  useAutosave();
  useSimulation();
  return (
    <main style={{ position: 'fixed', inset: 0 }}>
      <h1 className="sr-only">Circuit Lab</h1>
      <Canvas />
      <TopBar />
      <Palette />
      <Inspector />
      <CodeDrawer />
      <AiDrawer />
      <DrawerTabs />
      <Pet />
      <Toasts />
    </main>
  );
}
