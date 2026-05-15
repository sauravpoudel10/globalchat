import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Session, User } from "@supabase/supabase-js";

export type Profile = {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
};

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object") {
    const maybe = error as { message?: unknown; details?: unknown; hint?: unknown; code?: unknown };
    const parts = [maybe.message, maybe.details, maybe.hint, maybe.code]
      .filter((part): part is string => typeof part === "string" && part.length > 0)
      .filter((part, index, arr) => arr.indexOf(part) === index);

    if (parts.length > 0) return parts.join(" ");
  }

  return "Unable to create your chat profile.";
}

function isMissingProfileSchema(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const maybe = error as { code?: unknown; message?: unknown };
  const message = typeof maybe.message === "string" ? maybe.message.toLowerCase() : "";

  return maybe.code === "PGRST205" || message.includes("public.profiles");
}

function getLocalProfile(user: User): Profile {
  const metadata = user.user_metadata ?? {};
  const displayName =
    typeof metadata.full_name === "string"
      ? metadata.full_name
      : typeof metadata.name === "string"
        ? metadata.name
        : user.email?.split("@")[0] || "WorldChat user";
  const usernameBase =
    displayName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 18) || "user";

  return {
    id: user.id,
    username: `${usernameBase}_${user.id.slice(0, 6)}`,
    display_name: displayName,
    avatar_url: null,
  };
}

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
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
    if (!user) {
      setProfile(null);
      setProfileError(null);
      return;
    }

    let cancelled = false;

    const loadProfile = async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, username, display_name, avatar_url")
        .eq("id", user.id)
        .maybeSingle();

      if (error) throw error;
      return data;
    };

    const createProfile = async () => {
      const bootstrapped = await supabase.rpc("bootstrap_profile");
      if (!bootstrapped.error && bootstrapped.data) return bootstrapped.data;

      const rpcMissing =
        bootstrapped.error?.code === "PGRST202" ||
        bootstrapped.error?.message?.toLowerCase().includes("bootstrap_profile") ||
        isMissingProfileSchema(bootstrapped.error);
      if (!rpcMissing) throw bootstrapped.error;

      const metadata = user.user_metadata ?? {};
      const displayName =
        typeof metadata.full_name === "string"
          ? metadata.full_name
          : typeof metadata.name === "string"
            ? metadata.name
            : user.email?.split("@")[0] || "WorldChat user";
      const usernameBase =
        displayName
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "_")
          .replace(/^_+|_+$/g, "")
          .slice(0, 18) || "user";
      const username = `${usernameBase}_${user.id.slice(0, 6)}`;

      const { data, error } = await supabase
        .from("profiles")
        .insert({
          id: user.id,
          username,
          display_name: displayName,
          avatar_url: null,
        })
        .select("id, username, display_name, avatar_url")
        .single();

      if (error) {
        if (error.code === "23505") return loadProfile();
        if (isMissingProfileSchema(error)) return getLocalProfile(user);
        throw error;
      }

      return data;
    };

    const load = async () => {
      setProfileError(null);

      try {
        for (let i = 0; i < 6; i++) {
          const data = await loadProfile();
          if (cancelled) return;
          if (data) {
            setProfile(data);
            return;
          }
          await new Promise((r) => setTimeout(r, 400));
        }

        const data = await createProfile();
        if (cancelled) return;
        if (data) setProfile(data);
      } catch (error) {
        if (cancelled) return;
        if (isMissingProfileSchema(error)) {
          setProfile(getLocalProfile(user));
          setProfileError(null);
          return;
        }
        setProfileError(getErrorMessage(error));
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [user]);

  return { session, user, profile, profileError, loading };
}
