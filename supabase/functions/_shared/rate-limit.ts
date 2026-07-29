// deno-lint-ignore no-explicit-any
export async function checkRateLimit(
  serviceRoleClient: any,
  key: string,
  maxCount: number,
  windowSeconds: number
): Promise<boolean> {
  const { data, error } = await serviceRoleClient.rpc('check_rate_limit', {
    p_key: key,
    p_max_count: maxCount,
    p_window_seconds: windowSeconds,
  });

  if (error) {
    console.warn('Rate limit check failed, allowing request', error);
    return true;
  }

  return Boolean(data);
}
