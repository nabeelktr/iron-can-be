import { NextResponse, type NextRequest } from "next/server";
import { requireAuthAPI, isAuthError } from "@/lib/auth/require-auth-api";
import { canAccessTemplate } from "@/lib/diet/template-access";

// POST /api/fitness/diet/templates/[templateId]/apply — the user applies a
// template to themselves: cancels their current active assignment and creates a
// new active assignment pointing at the template (mirrors the trainer/admin
// assign flow, but self-initiated).
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ templateId: string }> },
) {
  try {
    const auth = await requireAuthAPI(request);
    if (isAuthError(auth)) return auth;
    const { supabase, user } = auth;
    const { templateId } = await params;

    const body = await request.json().catch(() => ({}));
    const { start_date } = body as { start_date?: string };

    // Verify the template exists and is applicable by this user.
    const { data: template, error: templateError } = await supabase
      .from("diet_plans")
      .select("id, is_public, created_by_trainer_id")
      .eq("id", templateId)
      .eq("is_template", true)
      .eq("is_active", true)
      .single();

    if (templateError || !template) {
      return NextResponse.json(
        { error: "Template not found" },
        { status: 404 },
      );
    }

    const allowed = await canAccessTemplate(supabase, user.id, template);
    if (!allowed)
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    // Cancel any existing active assignment for this user.
    await supabase
      .from("diet_plan_assignments")
      .update({ status: "cancelled", updated_at: new Date().toISOString() })
      .eq("user_id", user.id)
      .eq("status", "active");

    // Create the new self-applied assignment.
    const { data: assignment, error } = await supabase
      .from("diet_plan_assignments")
      .insert({
        user_id: user.id,
        plan_id: template.id,
        assigned_by: user.id,
        trainer_id: template.created_by_trainer_id ?? null,
        start_date: start_date || new Date().toISOString().split("T")[0],
        notes: null,
      })
      .select()
      .single();

    if (error)
      return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json(
      { assignment_id: assignment.id, assignment },
      { status: 201 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
