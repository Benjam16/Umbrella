import { Hono } from "hono";
import { requireUser } from "../services/auth.js";
import { getWalletStatus } from "../services/wallet.js";

export const walletRoutes = new Hono();

walletRoutes.get("/status", async (c) => {
  const user = requireUser(c);
  if (user instanceof Response) return user;
  const status = await getWalletStatus();
  return c.json({ wallet: status });
});
