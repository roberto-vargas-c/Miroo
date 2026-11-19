import { AuthForm } from "@/components/AuthForm";
import { signup } from "@/app/actions/auth";

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return <AuthForm mode="signup" action={signup} next={next} />;
}
