import { beforeEach, describe, expect, it, vi } from "vitest";

const { updateConfigMock } = vi.hoisted(() => ({ updateConfigMock: vi.fn() }));
vi.mock("openclaw/plugin-sdk/config-mutation", () => ({
  updateConfig: updateConfigMock,
}));

const sendMessageMock = vi.fn().mockResolvedValue(undefined);

import { handleVcardCommand } from "./vcard-command-handler.js";

const SELF_JID = "15550009999@s.whatsapp.net";
const OTHER_JID = "15550001111@s.whatsapp.net";
const SAMPLE_VCARD = "BEGIN:VCARD\nVERSION:3.0\nFN:John\nTEL:+5511999988888\nEND:VCARD";

function makeParams(
  overrides: Partial<{
    fromMe: boolean;
    selfChatMode: boolean;
    configWrites: boolean;
    directVcard: string | undefined;
    selfJid: string;
    remoteJid: string;
    accountId: string;
  }> = {},
) {
  return {
    fromMe: overrides.fromMe ?? true,
    selfChatMode: overrides.selfChatMode ?? true,
    configWrites: overrides.configWrites ?? true,
    directVcard: "directVcard" in overrides ? overrides.directVcard : SAMPLE_VCARD,
    selfJid: overrides.selfJid ?? SELF_JID,
    remoteJid: overrides.remoteJid ?? SELF_JID,
    accountId: overrides.accountId ?? "default",
    sendMessage: sendMessageMock,
  };
}

function mockConfig(manualFrom: string[] = []) {
  updateConfigMock.mockImplementation(async (mutator: (cfg: unknown) => unknown) =>
    mutator({ channels: { whatsapp: { dmPolicy: "open-except", manualFrom } } }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockConfig([]);
});

describe("handleVcardCommand", () => {
  it("returns null when selfChatMode is false", async () => {
    const result = await handleVcardCommand(makeParams({ selfChatMode: false }));
    expect(result).toBeNull();
    expect(updateConfigMock).not.toHaveBeenCalled();
  });

  it("returns null when configWrites is false", async () => {
    const result = await handleVcardCommand(makeParams({ configWrites: false }));
    expect(result).toBeNull();
    expect(updateConfigMock).not.toHaveBeenCalled();
  });

  it("returns null when not fromMe", async () => {
    const result = await handleVcardCommand(makeParams({ fromMe: false }));
    expect(result).toBeNull();
  });

  it("returns null when remoteJid is not selfJid", async () => {
    const result = await handleVcardCommand(makeParams({ remoteJid: OTHER_JID }));
    expect(result).toBeNull();
  });

  it("returns null when directVcard is absent", async () => {
    const result = await handleVcardCommand(makeParams({ directVcard: undefined }));
    expect(result).toBeNull();
  });

  it("returns null when vcard has no phone", async () => {
    const result = await handleVcardCommand(
      makeParams({ directVcard: "BEGIN:VCARD\nVERSION:3.0\nFN:John\nEND:VCARD" }),
    );
    expect(result).toBeNull();
  });

  it("adds phone when not in list and replies confirmation", async () => {
    mockConfig([]);
    const result = await handleVcardCommand(makeParams());
    expect(result).toBe("added");
    expect(updateConfigMock).toHaveBeenCalledOnce();
    expect(sendMessageMock).toHaveBeenCalledWith(SELF_JID, {
      text: "Added +5511999988888 to manual list",
    });
  });

  it("removes phone when already in list and replies confirmation", async () => {
    mockConfig(["+5511999988888"]);
    const result = await handleVcardCommand(makeParams());
    expect(result).toBe("removed");
    expect(updateConfigMock).toHaveBeenCalledOnce();
    expect(sendMessageMock).toHaveBeenCalledWith(SELF_JID, {
      text: "Removed +5511999988888 from manual list",
    });
  });

  it("normalizes phone before comparison (no leading +)", async () => {
    mockConfig(["5511999988888"]);
    const result = await handleVcardCommand(makeParams());
    expect(result).toBe("removed");
  });
});
