import { memory } from './memory.js';

/**
 * Extension point for HTTP 402 / micropayment (e.g. x402) when automated recovery hits a paywall.
 * Enable with UMB_X402_ENABLED=1 and wire your settlement logic here.
 */
export async function tryX402Payment(context: string): Promise<string | null> {
  if (process.env.UMB_X402_ENABLED !== '1' && process.env.UMB_X402_ENABLED !== 'true') {
    return null;
  }
  const snippet = context.slice(0, 800);
  await memory.ingest(
    'x402_event',
    `Payment path requested (stub — implement settlement): ${snippet}`,
  );
  return 'Payment layer signaled; X402 handler is not fully configured — manual billing may be required.';
}

export function errorLooksLikePaymentWall(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes('402') ||
    m.includes('payment required') ||
    m.includes('quota exceeded') ||
    (m.includes('insufficient') && m.includes('quota')) ||
    (m.includes('billing') && m.includes('required'))
  );
}
