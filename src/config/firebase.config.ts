import * as admin from 'firebase-admin';

export function initializeFirebase() {
  console.log('[Firebase] initializeFirebase() called');
  console.log('[Firebase] Admin apps count:', admin.apps.length);
  
  if (admin.apps.length > 0) {
    console.log('[Firebase] Already initialized, skipping');
    return;
  }

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKeyRaw = process.env.FIREBASE_PRIVATE_KEY;
  
  console.log('[Firebase] Raw env reads:');
  console.log('  - FIREBASE_PROJECT_ID:', projectId ? `"${projectId}"` : 'undefined');
  console.log('  - FIREBASE_CLIENT_EMAIL:', clientEmail ? `"${clientEmail}"` : 'undefined');
  console.log('  - FIREBASE_PRIVATE_KEY:', privateKeyRaw ? `present (${privateKeyRaw.length} chars)` : 'undefined');

  // Debug logging
  console.log('[Firebase] Checking credentials...');
  console.log('[Firebase] Project ID exists:', !!projectId);
  console.log('[Firebase] Client Email exists:', !!clientEmail);
  console.log('[Firebase] Private Key exists:', !!privateKeyRaw);
  console.log('[Firebase] Project ID value:', projectId);
  console.log('[Firebase] Client Email value:', clientEmail?.substring(0, 20) + '...');

  if (!projectId || !clientEmail || !privateKeyRaw) {
    console.warn(
      '[Firebase] Firebase credentials are not fully set. Push notifications will be skipped.',
    );
    return;
  }

  // Handle both literal \n strings and actual newlines in the env var
  const privateKey = privateKeyRaw
    .replace(/\\n/g, '\n')   // Convert escaped \n to actual newlines
    .replace(/\r\n/g, '\n')  // Normalize Windows line endings
    .replace(/\r/g, '\n')     // Handle old Mac line endings
    .trim();

  // Debug: Check private key format
  console.log('[Firebase] Private key starts with:', privateKey.substring(0, 27));
  console.log('[Firebase] Private key ends with:', privateKey.slice(-25));
  console.log('[Firebase] Private key has newlines:', privateKey.includes('\n'));

  try {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId,
        clientEmail,
        privateKey,
      }),
    });

    console.log('[Firebase] ✅ Firebase initialized successfully');
  } catch (error) {
    console.error('[Firebase] ❌ Failed to initialize Firebase:', error);
    // Don't throw - let the app continue without notifications
  }
}
