import type { OpenClawConfig } from "openclaw/plugin-sdk/config-contracts";
import { updateConfig } from "openclaw/plugin-sdk/config-mutation";
import { normalizeE164 } from "../text-runtime.js";
import { parseVcard } from "../vcard.js";

export type VcardCommandResult = "added" | "removed" | null;

export type VcardCommandParams = {
  fromMe: boolean;
  selfChatMode: boolean;
  configWrites: boolean;
  directVcard: string | undefined;
  selfJid: string;
  remoteJid: string;
  accountId: string;
  sendMessage: (jid: string, content: { text: string }) => Promise<unknown>;
};

function readManualFrom(cfg: OpenClawConfig, accountId: string): string[] {
  const raw = cfg as unknown as { channels?: { whatsapp?: Record<string, unknown> } };
  const whatsapp = raw.channels?.whatsapp;
  if (!whatsapp) return [];
  if (accountId !== "default") {
    const accounts = whatsapp.accounts as Record<string, unknown> | undefined;
    const acct = accounts?.[accountId] as Record<string, unknown> | undefined;
    if (Array.isArray(acct?.manualFrom)) return acct.manualFrom as string[];
  }
  return Array.isArray(whatsapp.manualFrom) ? (whatsapp.manualFrom as string[]) : [];
}

function writeManualFrom(cfg: OpenClawConfig, accountId: string, next: string[]): OpenClawConfig {
  const raw = cfg as unknown as Record<string, unknown>;
  const channels = (raw.channels ?? {}) as Record<string, unknown>;
  const whatsapp = (channels.whatsapp ?? {}) as Record<string, unknown>;
  if (accountId !== "default") {
    const accounts = (whatsapp.accounts ?? {}) as Record<string, unknown>;
    const acct = (accounts[accountId] ?? {}) as Record<string, unknown>;
    return {
      ...raw,
      channels: {
        ...channels,
        whatsapp: {
          ...whatsapp,
          accounts: { ...accounts, [accountId]: { ...acct, manualFrom: next } },
        },
      },
    } as OpenClawConfig;
  }
  return {
    ...raw,
    channels: { ...channels, whatsapp: { ...whatsapp, manualFrom: next } },
  } as OpenClawConfig;
}

export async function handleVcardCommand(params: VcardCommandParams): Promise<VcardCommandResult> {
  if (!params.selfChatMode || !params.configWrites) return null;
  if (!params.fromMe) return null;
  if (params.remoteJid !== params.selfJid) return null;
  if (!params.directVcard) return null;

  const parsed = parseVcard(params.directVcard);
  if (parsed.phones.length === 0) return null;

  const phone = normalizeE164(parsed.phones[0]);

  let outcome: "added" | "removed" = "added";
  await updateConfig((cfg) => {
    const list = readManualFrom(cfg, params.accountId);
    const idx = list.map(normalizeE164).findIndex((e) => e === phone);
    if (idx === -1) {
      outcome = "added";
      return writeManualFrom(cfg, params.accountId, [...list, phone]);
    }
    outcome = "removed";
    return writeManualFrom(
      cfg,
      params.accountId,
      list.filter((_, i) => i !== idx),
    );
  });

  const text =
    outcome === "added" ? `Added ${phone} to manual list` : `Removed ${phone} from manual list`;
  await params.sendMessage(params.selfJid, { text });
  return outcome;
}
