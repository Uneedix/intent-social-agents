import { isWidgetCurrency, loadWidgetRates } from '../../../../lib/widget-rates';

export async function GET(request: Request): Promise<Response> {
  const params = new URL(request.url).searchParams;
  const base = params.get('base') ?? 'EUR';
  if (!isWidgetCurrency(base) || params.getAll('base').length > 1
    || [...params.keys()].some(key => key !== 'base')) {
    return Response.json({ error: 'Unsupported currency base.' }, {
      status: 400, headers: { 'Cache-Control': 'no-store' },
    });
  }
  try {
    const payload = await loadWidgetRates(base);
    return Response.json(payload, {
      headers: { 'Cache-Control': 'public, max-age=300, s-maxage=3600, must-revalidate' },
    });
  } catch {
    // No provider details, tokens, stack traces, invented values or fallback quotes.
    return Response.json({ error: 'Exchange rates are temporarily unavailable.' }, {
      status: 503, headers: { 'Cache-Control': 'no-store' },
    });
  }
}
