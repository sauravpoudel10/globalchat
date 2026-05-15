import { supabase } from "../supabase/client";

type SignInOptions = {
  redirect_uri?: string;
  extraParams?: Record<string, string>;
};

export const authClient = {
  signInWithOAuth: async (provider: "google", opts?: SignInOptions) => {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: opts?.redirect_uri,
        queryParams: opts?.extraParams,
      },
    });

    if (error) {
      return { error };
    }

    return data;
  },
};
