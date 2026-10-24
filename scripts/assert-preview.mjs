/** Fail closed if Vercel classifies a requested preview as production. */
export function assertPreviewBuild(env) {
  if (!env.VERCEL) return;
  if (env.VERCEL_ENV !== 'preview' || (env.VERCEL_TARGET_ENV && env.VERCEL_TARGET_ENV !== 'preview')) {
    throw new Error('INTENT: only Vercel preview builds are approved. Production/custom-environment builds are blocked; request explicit release approval.');
  }
}

if (process.argv[1] && /[\\/]assert-preview\.mjs$/.test(process.argv[1])) assertPreviewBuild(process.env);
