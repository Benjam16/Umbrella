import { redirect } from "next/navigation";

// The legacy playground route now lives inside the /app shell. Kept as a
// redirect so any external deep-links or CTAs still work.
export default function LegacyPlaygroundRedirect() {
  redirect("/app");
}
