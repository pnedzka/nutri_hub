// "Open in Spark": a link that opens an e-mail in the Spark mail app of whoever clicks it (Michał Roman's request of
// 18.11.2026). Spark builds its deep links as https://sparkmailapp.com/dpl/bl?token=<TOKEN>, where TOKEN is
// base64("A:<account>;ID:<Message-ID without < >>;<CRC32 of the part before it>"), wrapped every 64 characters with
// \r\n and URL-encoded. The link works only where Spark has that mailbox (account) added.

function crc32(text: string): number {
  let crc = 0xffffffff;
  for (const byte of new TextEncoder().encode(text)) {
    crc ^= byte;
    for (let k = 0; k < 8; k++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/** The Spark link to one e-mail in one mailbox; null without a Message-ID or a mailbox. */
export function sparkLink(account: string | null | undefined, messageId: string | null | undefined): string | null {
  const mailbox = account?.trim();
  const id = messageId?.trim().replace(/^<|>$/g, '');
  if (!mailbox || !id) return null;
  const payload = `A:${mailbox};ID:${id}`;
  const bytes = new TextEncoder().encode(`${payload};${crc32(payload)}`);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  const wrapped = (btoa(binary).match(/.{1,64}/g) ?? []).join('\r\n');
  return `https://sparkmailapp.com/dpl/bl?token=${encodeURIComponent(wrapped)}`;
}
