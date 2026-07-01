export const INPUT_SAMPLE_RATE = 16000;
export const OUTPUT_SAMPLE_RATE = 24000;

export const LIVE_API_HOST = "generativelanguage.googleapis.com";
export const LIVE_API_WS_PATH =
  "/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContentConstrained";

export function buildLiveWebSocketUrl(accessToken: string): string {
  return `wss://${LIVE_API_HOST}${LIVE_API_WS_PATH}?access_token=${encodeURIComponent(
    accessToken,
  )}`;
}
