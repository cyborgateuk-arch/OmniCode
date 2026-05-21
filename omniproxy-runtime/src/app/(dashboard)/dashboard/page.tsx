import { redirect } from "next/navigation";
import { getMachineId } from "@/shared/utils/machine";
import { getSettings } from "@/lib/localDb";
import HomePageClient from "./HomePageClient";
import BootstrapBanner from "./BootstrapBanner";

// Must be dynamic — depends on DB state (setupComplete) that changes at runtime
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const settings = await getSettings();
  if (!settings.setupComplete) {
    redirect("/dashboard/onboarding");
  }
  const machineId = await getMachineId();
  const isBootstrapped = process.env.OMNIROUTE_BOOTSTRAPPED === "true";
  return (
    <>
      {isBootstrapped && <BootstrapBanner />}
      <HomePageClient machineId={machineId} />
    </>
  );
}
