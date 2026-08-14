import { createSessionClient } from "@/lib/supabase/server";
import { getGymScope } from "@/lib/auth/gym-scope";
import { getMemberProfile, getBookingsForMember } from "@/lib/data/pods";
import { getTransactionsForMember } from "@/lib/data/refunds";
import { MemberProfileView } from "@/components/pods/member-profile-view";
import { AppShell } from "@/components/layout/app-shell";

export default async function MemberProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const memberId = Number(id);

  const supabase = await createSessionClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <main className="flex min-h-screen items-center justify-center px-4">
        <p className="text-sm text-danger">Not signed in.</p>
      </main>
    );
  }

  const scope = await getGymScope(user.id);
  if (!scope) {
    return (
      <main className="flex min-h-screen items-center justify-center px-4 text-center">
        <p className="text-sm text-danger">No gym or role is assigned to this account. Contact your admin.</p>
      </main>
    );
  }

  if (!Number.isInteger(memberId) || memberId <= 0) {
    return (
      <main className="flex min-h-screen items-center justify-center px-4">
        <p className="text-sm text-danger">Member not found.</p>
      </main>
    );
  }

  const profile = await getMemberProfile(memberId);

  // Never trust the URL for gym scoping — same pattern as the refund
  // route's lookupRefundableTransaction: derive the real gym server-side
  // and reject a mismatch as "not found" rather than confirming another
  // gym's member even exists.
  if (!profile || (scope.role === "owner" && profile.gym !== scope.gym)) {
    return (
      <main className="flex min-h-screen items-center justify-center px-4">
        <p className="text-sm text-danger">Member not found.</p>
      </main>
    );
  }

  const [bookings, transactions] = await Promise.all([
    getBookingsForMember(memberId),
    getTransactionsForMember(memberId),
  ]);

  return (
    <AppShell role={scope.role}>
      <div className="mx-auto max-w-5xl px-4 py-8">
        <MemberProfileView profile={profile} initialBookings={bookings} initialTransactions={transactions} />
      </div>
    </AppShell>
  );
}
