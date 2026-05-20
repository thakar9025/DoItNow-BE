import * as admin from 'firebase-admin';

export type FirebaseAudience = 'user' | 'admin';

type FirebaseCredentialSet = {
  projectId?: string;
  clientEmail?: string;
  privateKeyRaw?: string;
};

const FIREBASE_APP_NAMES: Record<FirebaseAudience, string> = {
  user: 'user-notifications',
  admin: 'admin-notifications',
};

function getFirebaseCredentials(audience: FirebaseAudience): FirebaseCredentialSet {
  if (audience === 'admin') {
    return {
      projectId: process.env.FIREBASE_ADMIN_PROJECT_ID ?? process.env.FIREBASE_PROJECT_ID,
      clientEmail:
        process.env.FIREBASE_ADMIN_CLIENT_EMAIL ?? process.env.FIREBASE_CLIENT_EMAIL,
      privateKeyRaw:
        process.env.FIREBASE_ADMIN_PRIVATE_KEY ?? process.env.FIREBASE_PRIVATE_KEY,
    };
  }

  return {
    projectId: process.env.FIREBASE_USER_PROJECT_ID ?? process.env.FIREBASE_PROJECT_ID,
    clientEmail:
      process.env.FIREBASE_USER_CLIENT_EMAIL ?? process.env.FIREBASE_CLIENT_EMAIL,
    privateKeyRaw:
      process.env.FIREBASE_USER_PRIVATE_KEY ?? process.env.FIREBASE_PRIVATE_KEY,
  };
}

export function getFirebaseAppName(audience: FirebaseAudience): string {
  return FIREBASE_APP_NAMES[audience];
}

export function initializeFirebaseAudience(audience: FirebaseAudience): void {
  const appName = getFirebaseAppName(audience);
  const existingApp = admin.apps.find((app) => app?.name === appName);

  if (existingApp) {
    return;
  }

  const { projectId, clientEmail, privateKeyRaw } = getFirebaseCredentials(audience);

  if (!projectId || !clientEmail || !privateKeyRaw) {
    console.warn(
      `[Firebase] ${audience} Firebase credentials are not fully set. Push notifications will be skipped for this audience.`,
    );
    return;
  }

  const privateKey = privateKeyRaw
    .replace(/\\n/g, '\n')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .trim();

  try {
    admin.initializeApp(
      {
        credential: admin.credential.cert({
          projectId,
          clientEmail,
          privateKey,
        }),
      },
      appName,
    );

    console.log(
      `[Firebase] Initialized ${audience} Firebase app "${appName}" for project "${projectId}"`,
    );
  } catch (error) {
    console.error(
      `[Firebase] Failed to initialize ${audience} Firebase app "${appName}"`,
      error,
    );
  }
}

export function initializeFirebase(): void {
  initializeFirebaseAudience('user');
  initializeFirebaseAudience('admin');
}
