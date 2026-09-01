const FIREFLIES_GRAPHQL_URL = 'https://api.fireflies.ai/graphql';

const requestFireflies = async ({ query, variables, apiKey, fetchImpl }) => {
  if (!apiKey) throw new Error('FIREFLIES_NOT_CONFIGURED');
  const response = await fetchImpl(FIREFLIES_GRAPHQL_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
      'User-Agent': 'BrainStudioIntelligence/3.0'
    },
    body: JSON.stringify({ query, variables })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.errors?.length) {
    const message = payload.errors?.[0]?.message || `Fireflies respondió HTTP ${response.status}`;
    throw new Error(message);
  }
  return payload.data;
};

export const createFirefliesClient = ({
  apiKey = process.env.FIREFLIES_API_KEY,
  fetchImpl = globalThis.fetch
} = {}) => ({
  async listTranscripts(limit = 25, skip = 0) {
    const data = await requestFireflies({
      apiKey,
      fetchImpl,
      variables: { limit, skip },
      query: `query BriaTranscripts($limit: Int, $skip: Int) {
        transcripts(limit: $limit, skip: $skip) {
          id title date duration organizer_email
        }
      }`
    });
    return data?.transcripts || [];
  },

  async getTranscript(id) {
    const data = await requestFireflies({
      apiKey,
      fetchImpl,
      variables: { id },
      query: `query BriaTranscript($id: String!) {
        transcript(id: $id) {
          id title date duration organizer_email participants
          summary { overview outline keywords action_items notes }
          sentences { text raw_text speaker_name start_time end_time }
        }
      }`
    });
    if (!data?.transcript) throw new Error('FIREFLIES_TRANSCRIPT_NOT_FOUND');
    return data.transcript;
  }
});

export const firefliesClient = createFirefliesClient();
