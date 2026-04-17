import { NextResponse, type NextRequest } from "next/server";
import { requireAdminAPI, isAdminError } from "@/lib/auth/require-admin-api";
import crypto from "crypto";

// POST /api/admin/trainers/invite — invite a trainer by email
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdminAPI(request);
    if (isAdminError(auth)) return auth;
    const { supabase } = auth;

    const body = await request.json();
    const { email } = body;

    if (!email || typeof email !== "string") {
      return NextResponse.json(
        { error: "Email is required" },
        { status: 400 },
      );
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Check if already a trainer
    const { data: existing } = await supabase
      .from("user_profiles")
      .select("id, role, trainer_status")
      .eq("email", normalizedEmail)
      .single();

    if (existing?.role === "trainer") {
      return NextResponse.json(
        { error: "This email is already registered as a trainer" },
        { status: 400 },
      );
    }

    // Generate a unique invite token
    const inviteToken = crypto.randomBytes(32).toString("hex");

    if (existing) {
      // User already exists — promote to trainer role
      const { error } = await supabase
        .from("user_profiles")
        .update({
          role: "trainer",
          is_trainer: true,
          trainer_status: "pending",
          referral_code: inviteToken.slice(0, 12),
          updated_at: new Date().toISOString(),
        })
        .eq("id", existing.id);

      if (error)
        return NextResponse.json({ error: error.message }, { status: 500 });

      return NextResponse.json({
        status: "promoted",
        message: `Existing user ${normalizedEmail} has been promoted to trainer (pending approval)`,
        invite_token: inviteToken,
      });
    }

    // User doesn't exist yet — generate invite link
    const baseUrl =
      process.env.NEXT_PUBLIC_APP_URL ||
      request.headers.get("origin") ||
      "https://iron-can-be.vercel.app";

    const inviteLink = `ironcan://trainer-invite?token=${inviteToken}&email=${encodeURIComponent(normalizedEmail)}`;
    const webInviteLink = `${baseUrl}/trainer-invite?token=${inviteToken}&email=${encodeURIComponent(normalizedEmail)}`;

    return NextResponse.json({
      status: "invited",
      message: `Invite link generated for ${normalizedEmail}. Share it with the trainer.`,
      invite_link: inviteLink,
      web_invite_link: webInviteLink,
      invite_token: inviteToken,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
