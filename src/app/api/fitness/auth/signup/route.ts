import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// POST /api/fitness/auth/signup — create a new account
// Body: { email: string, password: string, trainer_invite_code?: string, as_trainer?: boolean }
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, password, trainer_invite_code, as_trainer } = body;

    if (!email || !password) {
      return NextResponse.json(
        { error: "Email and password are required" },
        { status: 400 },
      );
    }

    if (password.length < 6) {
      return NextResponse.json(
        { error: "Password must be at least 6 characters" },
        { status: 400 },
      );
    }

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll: () => [],
          setAll: () => {},
        },
      },
    );

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    const shouldPromoteToTrainer = Boolean(as_trainer || trainer_invite_code);

    if (shouldPromoteToTrainer && data.user) {
      const update: Record<string, unknown> = {
        role: "trainer",
        is_trainer: true,
        trainer_status: "pending",
      };
      if (trainer_invite_code) {
        update.referral_code = String(trainer_invite_code).slice(0, 12);
      }
      await supabase
        .from("user_profiles")
        .update(update)
        .eq("user_id", data.user.id);
    }

    return NextResponse.json({
      user: data.user
        ? { id: data.user.id, email: data.user.email }
        : null,
      role: shouldPromoteToTrainer ? "trainer" : "user",
      message: shouldPromoteToTrainer
        ? "Trainer account created. Check your email to confirm, then wait for admin approval."
        : "Check your email for a confirmation link",
    }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
