"use client";

import { useState } from "react";
import type { CatalogItem } from "@/lib/data/catalog";
import type { CardioEquipment } from "@/lib/data/cardio-equipment";
import type { GymName } from "@/lib/data/types";
import { GymSelect } from "@/components/ui/gym-select";
import { CatalogView } from "@/components/setup/catalog-view";
import { PromoCodesView } from "@/components/setup/promo-codes-view";
import { CardioEquipmentView } from "@/components/setup/cardio-equipment-view";
import { BrevoConfigView } from "@/components/setup/brevo-config-view";
import { ResendConfigView } from "@/components/setup/resend-config-view";
import { StripeConnectView } from "@/components/setup/stripe-connect-view";
import { StripeStandaloneConfigView } from "@/components/setup/stripe-standalone-view";

// One shared gym selection for the whole /setup page, admin-only (an owner's
// gym is fixed, no selector at all — see page.tsx). Previously each card
// (catalog, Brevo, Resend) held its own independent gym state, so picking
// e.g. Hove in one card did nothing for the other two — a real papercut
// when onboarding a new gym touches all three in one sitting. Selecting a
// gym here now scopes every card below it.
export function SetupShell({
  role,
  initialGym,
  initialItems,
  initialCardioEquipment,
}: {
  role: "admin" | "owner";
  initialGym: GymName | null;
  initialItems: CatalogItem[];
  initialCardioEquipment: CardioEquipment[];
}) {
  const [gym, setGym] = useState<GymName | null>(initialGym);

  return (
    <div className="space-y-6">
      {role === "admin" && (
        <div>
          <p className="text-sm text-muted-foreground">One gym at a time — applies to everything on this page.</p>
          <div className="mt-2">
            <GymSelect value={gym} onChange={setGym} />
          </div>
        </div>
      )}

      <CatalogView gym={gym} initialItems={initialItems} />

      <PromoCodesView gym={gym} />

      <CardioEquipmentView gym={gym} initialItems={initialCardioEquipment} />

      {role === "admin" && (
        <>
          <BrevoConfigView gym={gym} />
          <ResendConfigView gym={gym} />
          <StripeConnectView gym={gym} />
          <StripeStandaloneConfigView gym={gym} />
        </>
      )}
    </div>
  );
}
