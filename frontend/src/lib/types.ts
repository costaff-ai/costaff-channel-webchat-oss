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

export interface RunResponse {
  reply: string;
}

export interface LoginResponse {
  access_token: string;
}
