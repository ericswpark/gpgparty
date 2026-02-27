import {
  enums,
  readKey,
  type PublicKey,
  type SignaturePacket,
  type User,
} from "openpgp";

export async function extractNameFromArmoredPublicKey(
  armoredKey: string,
): Promise<string | null> {
  try {
    const key = await readKey({ armoredKey });
    const [firstUserId] = key.getUserIDs();
    if (!firstUserId) {
      return null;
    }

    const withoutEmail = firstUserId.replace(/<[^>]*>/g, " ").trim();
    const withoutComment = withoutEmail.replace(/\([^)]*\)/g, " ").trim();
    const parsed = withoutComment.replace(/\s+/g, " ");
    return parsed || null;
  } catch {
    return null;
  }
}

export async function extractFingerprintFromArmoredPublicKey(
  armoredKey: string,
): Promise<string | null> {
  try {
    const key = await readKey({ armoredKey });
    return key.getFingerprint().toLowerCase();
  } catch {
    return null;
  }
}

export async function hasOwnCertificationOnKey(
  armoredSignedKey: string,
  armoredSignerPublicKey: string,
): Promise<boolean> {
  try {
    const signedKey = await readKey({ armoredKey: armoredSignedKey });
    const signerKey = await readKey({ armoredKey: armoredSignerPublicKey });
    const signerPublicKey = signerKey.isPrivate()
      ? signerKey.toPublic()
      : signerKey;
    const signerKeyIds = new Set(
      signerPublicKey.getKeyIDs().map((keyId) => keyId.toHex().toLowerCase()),
    );

    for (const user of signedKey.users) {
      for (const certification of user.otherCertifications) {
        const issuerKeyId = certification.issuerKeyID?.toHex().toLowerCase();
        if (!issuerKeyId || !signerKeyIds.has(issuerKeyId)) {
          continue;
        }

        if (
          await verifyCertificationFromSigner(
            user,
            certification,
            signerPublicKey,
          )
        ) {
          return true;
        }
      }
    }

    return false;
  } catch {
    return false;
  }
}

async function verifyCertificationFromSigner(
  user: User,
  certification: SignaturePacket,
  signerPublicKey: PublicKey,
): Promise<boolean> {
  try {
    const verified = await user.verifyCertificate(certification, [
      signerPublicKey,
    ]);
    if (verified === true) {
      return true;
    }
  } catch {
    // OpenPGP.js may reject cert-only primaries when resolving a signing key
  }

  const issuerCandidates = signerPublicKey.getKeys(certification.issuerKeyID);
  for (const issuerCandidate of issuerCandidates) {
    try {
      if (certification.revoked) {
        continue;
      }

      const isRevoked = await user.isRevoked(
        certification,
        issuerCandidate.keyPacket,
      );
      if (isRevoked) {
        continue;
      }

      await certification.verify(
        issuerCandidate.keyPacket,
        enums.signature.certGeneric,
        {
          key: user.mainKey.keyPacket,
          userID: user.userID,
          userAttribute: user.userAttribute,
        },
      );
      return true;
    } catch {
      // Keep checking other matching issuer keys.
    }
  }

  return false;
}

export async function hasAnyThirdPartyCertification(
  armoredSignedKey: string,
): Promise<boolean> {
  try {
    const key = await readKey({ armoredKey: armoredSignedKey });
    return key.users.some((user) => user.otherCertifications.length > 0);
  } catch {
    return false;
  }
}

export function containsPrivateKeyBlock(value: string): boolean {
  return /-----BEGIN PGP (PRIVATE|SECRET) KEY BLOCK-----/i.test(value);
}
