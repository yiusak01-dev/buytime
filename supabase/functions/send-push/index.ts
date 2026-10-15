// WARNING: Legacy BuyTime endpoint removed from the NEW development branch.
// Previous version committed private VAPID credentials in a public repository.
// Those keys MUST be rotated and all deployed versions audited before launch.
// New NGAAM push notifications require an authenticated, recipient-authorised server path.
Deno.serve(async (request: Request) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, apikey, x-client-info, content-type',
    'Content-Type': 'application/json',
  };
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  return new Response(JSON.stringify({ error: 'Legacy push endpoint disabled' }), { status: 410, headers });
});
