import { handleGifRoute } from '../../../../lib/gifs';

// Server-only proxy. GIPHY_API_KEY / TENOR_API_KEY are read from process.env and never returned or logged.
export async function GET(request: Request): Promise<Response> {
  return handleGifRoute('trending', request);
}
