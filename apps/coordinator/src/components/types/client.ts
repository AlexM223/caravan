export interface ClientScanStatus {
  phase: "idle" | "checking" | "importing" | "scanning" | "done" | "error";
  progress: number | null;
  startedAt: number | null;
  error: string;
}

export interface ClientType {
  type: string;
  url?: string;
  username?: string;
  password?: string;
  urlError?: string;
  usernameError?: string;
  passwordError?: string;
  status?: string;
  walletName?: string;
  umbrel?: { active: boolean; network: string | null };
  scanStatus?: ClientScanStatus;
}
