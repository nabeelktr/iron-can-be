import type { SupabaseClient } from "@supabase/supabase-js";

export interface TemplateAccessFields {
  is_public: boolean;
  created_by_trainer_id: string | null;
}

// Returns true if the user may view/apply the given template:
//   • the template is a public global template, or
//   • it belongs to a trainer the user has joined.
export async function canAccessTemplate(
  supabase: SupabaseClient,
  userId: string,
  template: TemplateAccessFields,
): Promise<boolean> {
  if (template.is_public) return true;
  if (!template.created_by_trainer_id) return false;

  const { data: relationship } = await supabase
    .from("trainer_users")
    .select("id")
    .eq("user_id", userId)
    .eq("trainer_id", template.created_by_trainer_id)
    .eq("status", "joined")
    .maybeSingle();

  return !!relationship;
}
