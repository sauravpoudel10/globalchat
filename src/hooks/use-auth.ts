import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Session, User } from "@supabase/supabase-js";

export type Profile = {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
};

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      setUser(s?.user ?? null);
    });
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setUser(data.session?.user ?? null);
      setLoading(false);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) { setProfile(null); return; }
    let cancelled = false;
    const load = async () => {
      // Try a few times — trigger may take a beat on first sign-in
      for (let i = 0; i < 6; i++) {
        const { data } = await supabase
          .from("profiles")
          .select("id, username, display_name, avatar_url")
          .eq("id", user.id)
          .maybeSingle();
        if (cancelled) return;
        if (data) { setProfile(data); return; }
        await new Promise((r) => setTimeout(r, 400));
      }
    };
    load();
    return () => { cancelled = true; };
  }, [user]);

  return { session, user, profile, loading };
}
