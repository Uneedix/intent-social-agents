import { createClient } from '../../../lib/supabase/server';
import { handleTranslation } from '../../../lib/translation-server';

export const runtime = 'nodejs';
export async function POST(request:Request):Promise<Response>{
 return handleTranslation(request,{
  authenticate:async()=>{const db=await createClient();const {data,error}=await db.auth.getUser();return error?null:data.user?.id||null;},
  apiKey:()=>process.env.DEEPL_API_KEY,
  plan:()=>process.env.DEEPL_API_PLAN,
 });
}
