import { env } from "@/lib/config/env";
import HomeClient from "./HomeClient";

export const dynamic = "force-dynamic";

export default function Home() {
  return <HomeClient defaultProvider={env().DEFAULT_PROVIDER} />;
}
