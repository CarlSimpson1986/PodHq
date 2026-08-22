"use client";

import { useState } from "react";
import type { CatalogItem } from "@/lib/data/catalog";
import type { GymName } from "@/lib/data/types";
import { GymSelect } from "@/components/ui/gym-select";
import { CatalogView } from "@/components/setup/catalog-view";
import { PromoCodesView } from "@/components/setup/promo-codes-view";
import { BrevoConfigView } from "@/components/setup/brevo-config-view";
import { ResendConfigView } from "@/components/setup/resend-config-view";
import { StripeConnectView } from "@/components/setup/stripe-connect-view";

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
}: {
  role: "admin" | "owner";
  initialGym: GymName | null;
  initialItems: CatalogItem[];
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

      {role === "admin" && (
        <>
          <BrevoConfigView gym={gym} />
          <ResendConfigView gym={gym} />
          <StripeConnectView gym={gym} />
        </>
      )}
    </div>
  );
}
