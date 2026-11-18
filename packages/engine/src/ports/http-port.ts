/** HTTP for the engine (#38): the host makes the request (the webview can't reach GitHub's sign-in). */
export interface HttpRequest {
  method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  url: string;
  headers: Record<string, string>;
  body?: string;
}

export interface HttpResponse {
  status: number;
  /** Header names in lower case. */
  headers: Record<string, string>;
  body: string;
}

export interface HttpPort {
  /** Rejects only when the server can't be reached; any status resolves. */
  request(req: HttpRequest): Promise<HttpResponse>;
}
