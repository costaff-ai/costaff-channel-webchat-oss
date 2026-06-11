export interface Me {
  username: string;
  email: string;
  session_id: string;
  is_approved: boolean;
}

export interface Attachment {
  type: "image" | "file";
  filename: string;
  mimeType?: string;
  data?: string;
  path?: string;
}

export interface AgentFile {
  filename: string;
  url: string; // signed download link — works as a plain <a href>
}

export interface RunResponse {
  reply: string;
  files?: AgentFile[];
}

export interface LoginResponse {
  access_token: string;
}
