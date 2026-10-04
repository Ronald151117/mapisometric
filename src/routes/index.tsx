import { createFileRoute } from "@tanstack/react-router";
import { TerrainMap } from "@/components/terrain-map";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  return <TerrainMap />;
}
