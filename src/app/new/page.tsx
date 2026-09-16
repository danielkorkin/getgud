import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/profile";
import { SetBuilderForm } from "@/components/set-builder/set-builder-form";

export default async function NewSetPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/");

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-8 px-6 py-16">
      <div className="flex flex-col gap-1">
        <span className="text-xs tracking-[0.05em] text-muted-foreground uppercase">New practice set</span>
        <h1 className="font-serif text-4xl tracking-tight">Build your set</h1>
      </div>
      <SetBuilderForm />
    </div>
  );
}
