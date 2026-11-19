import { requireUser } from "@/lib/session";
import { avatarUrl } from "@/lib/avatar";
import { ProfileForm } from "@/components/ProfileForm";

export default async function ProfilePage() {
  const user = await requireUser();
  return (
    <div className="max-w-xl">
      <h1 className="mb-1 text-2xl font-semibold">Your profile</h1>
      <p className="mb-6 text-sm text-slate-500">Your name and picture show on boards, comments and sticky notes you write.</p>
      <ProfileForm user={{ name: user.name, email: user.email, color: user.color, avatar: avatarUrl(user) ?? null }} />
    </div>
  );
}
