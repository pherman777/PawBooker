export async function sendExpoPushToTokens(
  tokens: string[],
  title: string,
  body: string,
  data?: Record<string, unknown>
) {
  if (tokens.length === 0) return;

  const messages = tokens.map((to) => ({ to, title, body, data }));

  const response = await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(messages),
  });

  if (!response.ok) {
    console.warn('Expo push send failed', await response.text());
    return;
  }

  const responseBody = (await response.json()) as {
    data?: { status: string; message?: string; details?: unknown; id?: string }[];
  };
  const tickets = responseBody.data ?? [];
  const ticketErrors = tickets.filter((ticket) => ticket.status === 'error');
  if (ticketErrors.length > 0) {
    console.warn('Expo push tickets returned errors', JSON.stringify(ticketErrors));
  }

  // A ticket status of "ok" only means Expo accepted the request - it doesn't mean
  // Apple/Google actually delivered it. The real delivery result only shows up via a
  // separate receipts check, so we look those up too (in the background, so this
  // doesn't add latency to the caller).
  const receiptIds = tickets.filter((ticket) => ticket.status === 'ok' && ticket.id).map((ticket) => ticket.id!);
  if (receiptIds.length === 0) return;

  const checkReceipts = async () => {
    await new Promise((resolve) => setTimeout(resolve, 3000));
    try {
      const receiptsResponse = await fetch('https://exp.host/--/api/v2/push/getReceipts', {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ids: receiptIds }),
      });
      const receiptsBody = (await receiptsResponse.json()) as {
        data?: Record<string, { status: string; message?: string; details?: unknown }>;
      };
      const receiptErrors = Object.entries(receiptsBody.data ?? {}).filter(([, receipt]) => receipt.status === 'error');
      if (receiptErrors.length > 0) {
        console.warn('Expo push receipts returned errors', JSON.stringify(receiptErrors));
      } else {
        console.log('Expo push receipts', JSON.stringify(receiptsBody.data));
      }
    } catch (err) {
      console.warn('Expo push receipt check failed', err instanceof Error ? err.message : err);
    }
  };

  const edgeRuntime = (globalThis as { EdgeRuntime?: { waitUntil: (p: Promise<unknown>) => void } }).EdgeRuntime;
  if (edgeRuntime) {
    edgeRuntime.waitUntil(checkReceipts());
  } else {
    await checkReceipts();
  }
}

// deno-lint-ignore no-explicit-any
export async function pushTokensForUser(supabase: any, userId: string): Promise<string[]> {
  const { data } = await supabase.from('push_tokens').select('token').eq('user_id', userId);
  return (data ?? []).map((row: { token: string }) => row.token);
}
