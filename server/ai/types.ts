export interface AIResponse {
  content: string;
}

export interface AIProvider {
  respond(userId: string, message: string): Promise<AIResponse>;
}
